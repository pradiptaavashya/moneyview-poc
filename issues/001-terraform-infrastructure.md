## Parent PRD

`issues/prd.md`

## What to build

Provision all AWS infrastructure required for the liveness demo application in ap-south-1 (Mumbai). This is the foundation slice — no application code, just the cloud resources that all other slices deploy into.

End-to-end: running `terraform apply` should create a fully functional, empty infrastructure that subsequent slices wire application code into.

**Resources to provision:**
- S3 buckets: video storage (90-day lifecycle, KMS encryption), reference documents, Amplify assets
- DynamoDB tables: `config` (single-row, versioned parameters), `sessions` (session results with GSIs for user-id and date queries)
- Lambda functions: placeholder handlers for session management, frame validation, face comparison, config CRUD, watermark check (actual code comes in later slices)
- API Gateway: REST API with routes matching PRD API contracts (POST /sessions, GET /sessions, POST /sessions/:id/validate, etc.)
- Cognito: user pool with email signup, two groups (tester, admin), app client
- KMS: customer-managed key for S3 encryption
- IAM: roles for Lambda (Rekognition access, S3 read/write, DynamoDB read/write, Cognito admin), API Gateway execution role
- S3 lifecycle rule: 90-day expiry on video storage bucket

**Environment variables wired into Lambda:**
- VIDEO_S3_BUCKET, REFERENCE_DOC_S3_BUCKET, KMS_KEY_ARN, VIDEO_RETENTION_DAYS, FRAME_CAPTURE_RATE, CONFIG_TABLE_NAME, SESSIONS_TABLE_NAME, COGNITO_USER_POOL_ID

## Acceptance criteria

- [ ] `terraform init && terraform plan` runs cleanly with no errors
- [ ] `terraform apply` creates all resources in ap-south-1
- [ ] S3 buckets exist with KMS encryption and lifecycle rules configured
- [ ] DynamoDB tables exist with correct key schemas and GSIs
- [ ] Lambda functions are created (placeholder handlers return 200)
- [ ] API Gateway routes are configured and return responses from Lambda
- [ ] Cognito user pool is created with email signup and tester/admin groups
- [ ] IAM roles have least-privilege policies for each Lambda's needs
- [ ] All resource names/ARNs are output for use by other slices
- [ ] Terraform state is stored remotely (S3 backend)
- [ ] Variables file documents all configurable inputs with defaults

## Blocked by

None - can start immediately

## User stories addressed

Infrastructure foundation — not directly user-facing, but enables all user stories.
