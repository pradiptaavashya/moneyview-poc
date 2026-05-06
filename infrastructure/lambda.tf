locals {
  lambda_env_vars = {
    VIDEO_S3_BUCKET         = aws_s3_bucket.video_storage.id
    REFERENCE_DOC_S3_BUCKET = aws_s3_bucket.reference_docs.id
    KMS_KEY_ARN             = aws_kms_key.main.arn
    VIDEO_RETENTION_DAYS    = tostring(var.video_retention_days)
    FRAME_CAPTURE_RATE      = tostring(var.frame_capture_rate)
    CONFIG_TABLE_NAME       = aws_dynamodb_table.config.name
    SESSIONS_TABLE_NAME     = aws_dynamodb_table.sessions.name
    COGNITO_USER_POOL_ID    = aws_cognito_user_pool.main.id
  }

  lambda_functions = {
    create-session   = "Handles POST /sessions"
    get-session      = "Handles GET /sessions/:id"
    list-sessions    = "Handles GET /sessions"
    validate-frames  = "Handles POST /sessions/:id/validate"
    compare-faces    = "Handles POST /sessions/:id/compare"
    store-video      = "Handles POST /sessions/:id/video-url"
    upload-reference = "Handles POST /reference/upload"
    check-watermark  = "Handles POST /reference/check-watermark"
    get-config       = "Handles GET /config"
    update-config    = "Handles PUT /config"
    get-analytics    = "Handles GET /analytics"
    export-sessions  = "Handles GET /sessions/export"
  }
}

resource "aws_lambda_function" "handlers" {
  for_each = local.lambda_functions

  function_name = "${var.project_name}-${var.environment}-${each.key}"
  description   = each.value
  role          = aws_iam_role.lambda_exec.arn
  handler       = "index.handler"
  runtime       = "nodejs20.x"
  timeout       = 30
  memory_size   = 256

  filename         = "${path.module}/lambda_dist/${each.key}.zip"
  source_code_hash = filebase64sha256("${path.module}/lambda_dist/${each.key}.zip")

  environment {
    variables = local.lambda_env_vars
  }
}
