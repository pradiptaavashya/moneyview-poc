# MoneyView Liveness Verification — Deployment Guide

## Overview

AI-powered liveness verification system for MoneyView's eKYC flow. Captures live video, runs face liveness challenges (head turns, blinks, expressions), compares against reference documents, and produces a confidence score — all serverless on AWS.

**Stack:** React PWA + AWS Lambda (Node 20) + API Gateway + Cognito + Rekognition + DynamoDB + S3 + CloudFront

---

## Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| AWS CLI | v2+ | https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html |
| Terraform | 1.5+ | https://developer.hashicorp.com/terraform/install |
| Node.js | 20+ | https://nodejs.org |
| npm | 10+ | Bundled with Node |

### AWS Permissions

The deploying IAM user/role needs permissions for:
- S3 (create buckets, put objects)
- DynamoDB (create tables)
- Lambda (create/update functions)
- API Gateway (create HTTP APIs)
- Cognito (create user pools)
- CloudFront (create distributions)
- IAM (create roles and policies)
- KMS (create keys)
- Rekognition (face liveness, compare faces)
- CloudWatch Logs (create log groups)

We recommend using an IAM user with `AdministratorAccess` for initial deployment, then scoping down.

---

## Quick Start

### 1. Configure AWS Credentials

```bash
aws configure
# Region: ap-south-1
# Output: json
```

Or set an existing profile:
```bash
export AWS_PROFILE=moneyview-prod
```

Verify access:
```bash
aws sts get-caller-identity
```

### 2. First-Time Setup (Bootstrap)

This creates the Terraform state backend (S3 bucket + DynamoDB lock table) in your account:

```bash
./deploy.sh --bootstrap --auto-approve
```

### 3. Deploy Everything

```bash
./deploy.sh --auto-approve
```

This will:
1. Build all 12 Lambda functions
2. Provision infrastructure (API Gateway, Cognito, DynamoDB, S3, KMS, CloudFront)
3. Deploy Lambda code
4. Build the frontend with injected config (Cognito IDs, API URL)
5. Upload frontend to S3 and serve via CloudFront

Deployment takes ~5 minutes on first run (CloudFront distribution creation is the bottleneck).

### 4. Note Your Outputs

After deployment completes, you'll see:

```
  CloudFront URL:   https://dxxxxxxxxxxxxxx.cloudfront.net
  API URL:          https://xxxxxx.execute-api.ap-south-1.amazonaws.com
  Cognito Pool ID:  ap-south-1_XXXXXXXXX
  Cognito Client:   xxxxxxxxxxxxxxxxxxxxxxxxxx
  Identity Pool:    ap-south-1:xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx

  Admin login:      admin@moneyview.in / MvAdmin@2026
  Tester login:     tester@moneyview.in / MvTester@2026
```

The **CloudFront URL** is your live application. Users are created automatically during deployment.

---

## Deployment Options

```bash
./deploy.sh [OPTIONS]

Options:
  --env ENV          Environment name (default: dev)
  --region REGION    AWS region (default: ap-south-1)
  --skip-frontend    Skip frontend build and deploy
  --skip-backend     Skip lambda build and deploy
  --plan-only        Run terraform plan without applying
  --auto-approve     Skip terraform apply confirmation
  --bootstrap        Create state backend before first deploy
  -h, --help         Show help
```

### Examples

```bash
# Preview changes without deploying
./deploy.sh --plan-only

# Deploy only backend changes
./deploy.sh --skip-frontend --auto-approve

# Deploy to production
./deploy.sh --env prod --auto-approve

# Deploy to a different region
./deploy.sh --region us-east-1 --auto-approve
```

---

## Post-Deployment Setup

Users are created automatically by the deploy script. No manual steps required.

Default credentials:
- **Admin:** admin@moneyview.in / MvAdmin@2026
- **Tester:** tester@moneyview.in / MvTester@2026

To create additional users manually:

```bash
POOL_ID=$(cd infrastructure && terraform output -raw cognito_user_pool_id)

aws cognito-idp admin-create-user \
  --user-pool-id "$POOL_ID" \
  --username user@example.com \
  --user-attributes Name=email,Value=user@example.com Name=email_verified,Value=true \
  --temporary-password 'TempPass123!' \
  --message-action SUPPRESS \
  --region ap-south-1

aws cognito-idp admin-set-user-password \
  --user-pool-id "$POOL_ID" \
  --username user@example.com \
  --password 'YourPassword123!' \
  --permanent \
  --region ap-south-1

aws cognito-idp admin-add-user-to-group \
  --user-pool-id "$POOL_ID" \
  --username user@example.com \
  --group-name tester \
  --region ap-south-1
```

---

## Architecture

```
User (Browser)
  │
  ├── CloudFront (HTTPS) → S3 (React PWA)
  │
  └── API Gateway (HTTP API)
        │
        ├── POST /sessions           → create-session Lambda
        ├── GET  /sessions           → list-sessions Lambda
        ├── GET  /sessions/{id}      → get-session Lambda
        ├── POST /sessions/{id}/validate  → validate-frames Lambda (Rekognition)
        ├── POST /sessions/{id}/compare   → compare-faces Lambda (Rekognition)
        ├── POST /sessions/{id}/video-url → store-video Lambda (S3 presigned URL)
        ├── POST /reference/upload        → upload-reference Lambda
        ├── POST /reference/check-watermark → check-watermark Lambda
        ├── GET  /config             → get-config Lambda
        ├── PUT  /config             → update-config Lambda
        ├── GET  /analytics          → get-analytics Lambda
        └── GET  /sessions/export    → export-sessions Lambda
```

**Data stores:**
- DynamoDB `sessions` table — liveness session records with GSIs on userId and date
- DynamoDB `config` table — runtime configuration (thresholds, challenge params)
- S3 `video-storage` — encrypted video recordings (90-day lifecycle)
- S3 `reference-docs` — uploaded ID documents for face comparison

**Security:**
- All S3 buckets encrypted with KMS (customer-managed key with rotation)
- Cognito authentication with two groups: `admin` and `tester`
- Public access blocked on all buckets
- CloudFront serves frontend over HTTPS only

---

## Custom Domain (Optional)

To use a custom domain instead of the CloudFront default:

1. Request an ACM certificate in `us-east-1` for your domain
2. Add to `infrastructure/frontend.tf`:
   ```hcl
   aliases = ["liveness.yourdomain.com"]

   viewer_certificate {
     acm_certificate_arn      = "arn:aws:acm:us-east-1:ACCOUNT:certificate/CERT-ID"
     ssl_support_method       = "sni-only"
     minimum_protocol_version = "TLSv1.2_2021"
   }
   ```
3. Create a CNAME record: `liveness.yourdomain.com → dXXX.cloudfront.net`
4. Redeploy: `./deploy.sh --skip-backend --auto-approve`

---

## Updating

After code changes:

```bash
# Full redeploy
./deploy.sh --auto-approve

# Backend only (faster)
./deploy.sh --skip-frontend --auto-approve

# Frontend only (fastest)
./deploy.sh --skip-backend --auto-approve
```

---

## Teardown

To remove all resources:

```bash
cd infrastructure

# Empty S3 buckets first (Terraform can't delete non-empty buckets)
aws s3 rm s3://mv-liveness-dev-video-storage --recursive
aws s3 rm s3://mv-liveness-dev-reference-docs --recursive
aws s3 rm s3://mv-liveness-dev-frontend --recursive

# Destroy infrastructure
terraform destroy -var="environment=dev" -var="aws_region=ap-south-1"
```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `deploy.sh: Permission denied` | Run `chmod +x deploy.sh` |
| `AWS credentials not configured` | Run `aws configure` or set `AWS_PROFILE` |
| `State bucket already exists` | The bootstrap is idempotent, safe to re-run |
| `Error: error creating S3 bucket` | Bucket names are globally unique; change `project_name` in `variables.tf` |
| CloudFront returns 403 | Wait 5-10 min for distribution to fully deploy, then retry |
| Lambda timeout | Check CloudWatch Logs at `/aws/lambda/mv-liveness-dev-<function>` |
| Cognito login fails | Verify user was created and added to correct group |

---

## Support

For issues with this deployment, contact the AWS solutions team.
