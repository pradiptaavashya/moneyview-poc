#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INFRA_DIR="$SCRIPT_DIR/infrastructure"
FRONTEND_DIR="$SCRIPT_DIR/frontend"
LAMBDA_DIST_DIR="$INFRA_DIR/lambda_dist"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log()  { echo -e "${GREEN}[deploy]${NC} $1"; }
warn() { echo -e "${YELLOW}[deploy]${NC} $1"; }
err()  { echo -e "${RED}[deploy]${NC} $1" >&2; exit 1; }

usage() {
  cat <<EOF
Usage: ./deploy.sh [OPTIONS]

Deploy the MoneyView Liveness stack to AWS.

Options:
  --env ENV          Environment name (default: dev)
  --region REGION    AWS region (default: ap-south-1)
  --skip-frontend    Skip frontend build and deploy
  --skip-backend     Skip lambda build and deploy
  --skip-infra       Skip terraform (infra unchanged, just redeploy code)
  --plan-only        Run terraform plan without applying
  --auto-approve     Skip terraform apply confirmation
  --bootstrap        Create state backend (S3 + DynamoDB) before first deploy
  -h, --help         Show this help

Examples:
  ./deploy.sh --bootstrap              # First-time setup
  ./deploy.sh                          # Full deploy (interactive)
  ./deploy.sh --auto-approve           # Full deploy (non-interactive)
  ./deploy.sh --skip-frontend          # Backend-only deploy
  ./deploy.sh --skip-infra             # Redeploy code only (no terraform)
EOF
  exit 0
}

ENV="dev"
REGION="ap-south-1"
SKIP_FRONTEND=false
SKIP_BACKEND=false
SKIP_INFRA=false
PLAN_ONLY=false
AUTO_APPROVE=""
BOOTSTRAP=false

while [[ $# -gt 0 ]]; do
  case $1 in
    --env) ENV="$2"; shift 2 ;;
    --region) REGION="$2"; shift 2 ;;
    --skip-frontend) SKIP_FRONTEND=true; shift ;;
    --skip-backend) SKIP_BACKEND=true; shift ;;
    --skip-infra) SKIP_INFRA=true; shift ;;
    --plan-only) PLAN_ONLY=true; shift ;;
    --auto-approve) AUTO_APPROVE="-auto-approve"; shift ;;
    --bootstrap) BOOTSTRAP=true; shift ;;
    -h|--help) usage ;;
    *) err "Unknown option: $1" ;;
  esac
done

check_prerequisites() {
  log "Checking prerequisites..."
  command -v aws >/dev/null 2>&1 || err "AWS CLI not found. Install: https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html"
  command -v terraform >/dev/null 2>&1 || err "Terraform not found. Install: https://developer.hashicorp.com/terraform/install"
  command -v node >/dev/null 2>&1 || err "Node.js not found. Install Node 20+."
  command -v npm >/dev/null 2>&1 || err "npm not found."

  NODE_VERSION=$(node -v | sed 's/v//' | cut -d. -f1)
  [[ $NODE_VERSION -ge 20 ]] || err "Node 20+ required (found v$NODE_VERSION)"

  aws sts get-caller-identity >/dev/null 2>&1 || err "AWS credentials not configured. Run 'aws configure' or set AWS_PROFILE."

  ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
  log "AWS Account: $ACCOUNT_ID (region: $REGION)"
}

bootstrap_state_backend() {
  log "Bootstrapping Terraform state backend..."
  local BUCKET="mv-liveness-terraform-state"
  local TABLE="mv-liveness-terraform-locks"

  if aws s3api head-bucket --bucket "$BUCKET" 2>/dev/null; then
    log "State bucket '$BUCKET' already exists."
  else
    log "Creating S3 bucket: $BUCKET"
    aws s3api create-bucket \
      --bucket "$BUCKET" \
      --region "$REGION" \
      --create-bucket-configuration LocationConstraint="$REGION"
    aws s3api put-bucket-versioning \
      --bucket "$BUCKET" \
      --versioning-configuration Status=Enabled
    aws s3api put-bucket-encryption \
      --bucket "$BUCKET" \
      --server-side-encryption-configuration '{
        "Rules": [{"ApplyServerSideEncryptionByDefault": {"SSEAlgorithm": "AES256"}}]
      }'
    aws s3api put-public-access-block \
      --bucket "$BUCKET" \
      --public-access-block-configuration \
        BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
  fi

  if aws dynamodb describe-table --table-name "$TABLE" --region "$REGION" >/dev/null 2>&1; then
    log "Lock table '$TABLE' already exists."
  else
    log "Creating DynamoDB table: $TABLE"
    aws dynamodb create-table \
      --table-name "$TABLE" \
      --attribute-definitions AttributeName=LockID,AttributeType=S \
      --key-schema AttributeName=LockID,KeyType=HASH \
      --billing-mode PAY_PER_REQUEST \
      --region "$REGION"
    aws dynamodb wait table-exists --table-name "$TABLE" --region "$REGION"
  fi

  log "State backend ready."
}

build_lambdas() {
  log "Building Lambda functions..."
  cd "$SCRIPT_DIR"

  npm ci --prefer-offline 2>/dev/null || npm install

  rm -rf "$LAMBDA_DIST_DIR"
  mkdir -p "$LAMBDA_DIST_DIR"

  HANDLERS=(
    createSession
    getSession
    listSessions
    validateFrames
    compareFaces
    storeVideo
    uploadReference
    checkWatermark
    getConfig
    updateConfig
    getAnalytics
    exportSessions
  )

  HANDLER_TO_ROUTE=(
    "create-session:createSession"
    "get-session:getSession"
    "list-sessions:listSessions"
    "validate-frames:validateFrames"
    "compare-faces:compareFaces"
    "store-video:storeVideo"
    "upload-reference:uploadReference"
    "check-watermark:checkWatermark"
    "get-config:getConfig"
    "update-config:updateConfig"
    "get-analytics:getAnalytics"
    "export-sessions:exportSessions"
  )

  for mapping in "${HANDLER_TO_ROUTE[@]}"; do
    ROUTE_KEY="${mapping%%:*}"
    HANDLER_NAME="${mapping##*:}"
    HANDLER_FILE="backend/src/handlers/${HANDLER_NAME}.ts"
    OUT_DIR="$LAMBDA_DIST_DIR/$ROUTE_KEY"

    mkdir -p "$OUT_DIR"

    npx esbuild "$HANDLER_FILE" \
      --bundle \
      --platform=node \
      --target=node20 \
      --format=esm \
      --outfile="$OUT_DIR/index.mjs" \
      '--external:@aws-sdk/*' \
      --minify \
      --sourcemap 2>/dev/null

    (cd "$OUT_DIR" && zip -qr "../${ROUTE_KEY}.zip" .)
    log "  Built: $ROUTE_KEY"
  done

  log "All ${#HANDLER_TO_ROUTE[@]} Lambda functions built and zipped."
}

deploy_infrastructure() {
  log "Deploying infrastructure (env: $ENV, region: $REGION)..."
  cd "$INFRA_DIR"

  terraform init -input=false

  if [[ "$PLAN_ONLY" == true ]]; then
    terraform plan \
      -var="environment=$ENV" \
      -var="aws_region=$REGION"
    log "Plan complete. Run without --plan-only to apply."
    return
  fi

  terraform apply \
    -var="environment=$ENV" \
    -var="aws_region=$REGION" \
    $AUTO_APPROVE

  log "Infrastructure deployed."
}

build_frontend() {
  log "Building frontend..."
  cd "$INFRA_DIR"

  COGNITO_USER_POOL_ID=$(terraform output -raw cognito_user_pool_id)
  COGNITO_CLIENT_ID=$(terraform output -raw cognito_client_id)
  COGNITO_IDENTITY_POOL_ID=$(terraform output -raw cognito_identity_pool_id)
  API_URL=$(terraform output -raw api_gateway_url)

  cd "$FRONTEND_DIR"
  npm ci --prefer-offline 2>/dev/null || npm install

  VITE_COGNITO_USER_POOL_ID="$COGNITO_USER_POOL_ID" \
  VITE_COGNITO_CLIENT_ID="$COGNITO_CLIENT_ID" \
  VITE_COGNITO_IDENTITY_POOL_ID="$COGNITO_IDENTITY_POOL_ID" \
  VITE_API_URL="$API_URL" \
  npm run build

  log "Frontend built. Output: $FRONTEND_DIR/dist/"
}

deploy_frontend() {
  log "Deploying frontend to S3..."
  cd "$INFRA_DIR"

  FRONTEND_BUCKET=$(terraform output -raw frontend_bucket_name 2>/dev/null || echo "")
  if [[ -z "$FRONTEND_BUCKET" ]]; then
    warn "No frontend_bucket_name output found. Frontend hosting not yet in Terraform."
    warn "Frontend built at: $FRONTEND_DIR/dist/"
    warn "You can manually sync with: aws s3 sync $FRONTEND_DIR/dist/ s3://<bucket-name>"
    return
  fi

  aws s3 sync "$FRONTEND_DIR/dist/" "s3://$FRONTEND_BUCKET" --delete

  DISTRIBUTION_ID=$(terraform output -raw cloudfront_distribution_id 2>/dev/null || echo "")
  if [[ -n "$DISTRIBUTION_ID" ]]; then
    log "Invalidating CloudFront cache..."
    aws cloudfront create-invalidation \
      --distribution-id "$DISTRIBUTION_ID" \
      --paths "/*" >/dev/null
  fi

  log "Frontend deployed."
}

create_users() {
  log "Creating default users..."
  cd "$INFRA_DIR"

  local POOL_ID
  POOL_ID=$(terraform output -raw cognito_user_pool_id)

  # Admin user
  if aws cognito-idp admin-get-user --user-pool-id "$POOL_ID" --username admin@moneyview.in --region "$REGION" >/dev/null 2>&1; then
    log "  Admin user already exists, skipping."
  else
    aws cognito-idp admin-create-user \
      --user-pool-id "$POOL_ID" \
      --username admin@moneyview.in \
      --user-attributes Name=email,Value=admin@moneyview.in Name=email_verified,Value=true \
      --temporary-password 'TempPass123!' \
      --message-action SUPPRESS \
      --region "$REGION" >/dev/null

    aws cognito-idp admin-set-user-password \
      --user-pool-id "$POOL_ID" \
      --username admin@moneyview.in \
      --password 'MvAdmin@2026' \
      --permanent \
      --region "$REGION"

    aws cognito-idp admin-add-user-to-group \
      --user-pool-id "$POOL_ID" \
      --username admin@moneyview.in \
      --group-name admin \
      --region "$REGION"

    log "  Created: admin@moneyview.in (admin group)"
  fi

  # Tester user
  if aws cognito-idp admin-get-user --user-pool-id "$POOL_ID" --username tester@moneyview.in --region "$REGION" >/dev/null 2>&1; then
    log "  Tester user already exists, skipping."
  else
    aws cognito-idp admin-create-user \
      --user-pool-id "$POOL_ID" \
      --username tester@moneyview.in \
      --user-attributes Name=email,Value=tester@moneyview.in Name=email_verified,Value=true \
      --temporary-password 'TempPass123!' \
      --message-action SUPPRESS \
      --region "$REGION" >/dev/null

    aws cognito-idp admin-set-user-password \
      --user-pool-id "$POOL_ID" \
      --username tester@moneyview.in \
      --password 'MvTester@2026' \
      --permanent \
      --region "$REGION"

    aws cognito-idp admin-add-user-to-group \
      --user-pool-id "$POOL_ID" \
      --username tester@moneyview.in \
      --group-name tester \
      --region "$REGION"

    log "  Created: tester@moneyview.in (tester group)"
  fi

  log "Users ready."
}

print_outputs() {
  log "=== Deployment Complete ==="
  cd "$INFRA_DIR"
  echo ""
  echo "  CloudFront URL:   https://$(terraform output -raw cloudfront_domain_name 2>/dev/null || echo 'N/A')"
  echo "  API URL:          $(terraform output -raw api_gateway_url 2>/dev/null || echo 'N/A')"
  echo "  Cognito Pool ID:  $(terraform output -raw cognito_user_pool_id 2>/dev/null || echo 'N/A')"
  echo "  Cognito Client:   $(terraform output -raw cognito_client_id 2>/dev/null || echo 'N/A')"
  echo "  Identity Pool:    $(terraform output -raw cognito_identity_pool_id 2>/dev/null || echo 'N/A')"
  echo ""
  echo "  Admin login:      admin@moneyview.in / MvAdmin@2026"
  echo "  Tester login:     tester@moneyview.in / MvTester@2026"
  echo ""
}

# --- Main ---

check_prerequisites

if [[ "$BOOTSTRAP" == true ]]; then
  bootstrap_state_backend
fi

if [[ "$SKIP_BACKEND" == false ]]; then
  build_lambdas
fi

if [[ "$SKIP_INFRA" == false ]]; then
  deploy_infrastructure
fi

if [[ "$SKIP_FRONTEND" == false && "$PLAN_ONLY" == false ]]; then
  build_frontend
  deploy_frontend
fi

if [[ "$PLAN_ONLY" == false && "$SKIP_INFRA" == false ]]; then
  create_users
fi

if [[ "$PLAN_ONLY" == false ]]; then
  print_outputs
fi
