output "api_gateway_url" {
  description = "API Gateway endpoint URL"
  value       = aws_apigatewayv2_api.main.api_endpoint
}

output "video_bucket_name" {
  description = "S3 bucket name for video storage"
  value       = aws_s3_bucket.video_storage.id
}

output "video_bucket_arn" {
  description = "S3 bucket ARN for video storage"
  value       = aws_s3_bucket.video_storage.arn
}

output "reference_docs_bucket_name" {
  description = "S3 bucket name for reference documents"
  value       = aws_s3_bucket.reference_docs.id
}

output "reference_docs_bucket_arn" {
  description = "S3 bucket ARN for reference documents"
  value       = aws_s3_bucket.reference_docs.arn
}

output "config_table_name" {
  description = "DynamoDB config table name"
  value       = aws_dynamodb_table.config.name
}

output "config_table_arn" {
  description = "DynamoDB config table ARN"
  value       = aws_dynamodb_table.config.arn
}

output "sessions_table_name" {
  description = "DynamoDB sessions table name"
  value       = aws_dynamodb_table.sessions.name
}

output "sessions_table_arn" {
  description = "DynamoDB sessions table ARN"
  value       = aws_dynamodb_table.sessions.arn
}

output "cognito_user_pool_id" {
  description = "Cognito user pool ID"
  value       = aws_cognito_user_pool.main.id
}

output "cognito_user_pool_arn" {
  description = "Cognito user pool ARN"
  value       = aws_cognito_user_pool.main.arn
}

output "cognito_client_id" {
  description = "Cognito app client ID"
  value       = aws_cognito_user_pool_client.web.id
}

output "cognito_identity_pool_id" {
  description = "Cognito Identity Pool ID for AWS credentials"
  value       = aws_cognito_identity_pool.main.id
}

output "kms_key_arn" {
  description = "KMS key ARN for encryption"
  value       = aws_kms_key.main.arn
}

output "kms_key_id" {
  description = "KMS key ID"
  value       = aws_kms_key.main.key_id
}

output "lambda_exec_role_arn" {
  description = "Lambda execution role ARN"
  value       = aws_iam_role.lambda_exec.arn
}

output "lambda_function_arns" {
  description = "Map of Lambda function names to ARNs"
  value       = { for k, v in aws_lambda_function.handlers : k => v.arn }
}

output "lambda_function_names" {
  description = "Map of Lambda function key to deployed function names"
  value       = { for k, v in aws_lambda_function.handlers : k => v.function_name }
}

output "frontend_bucket_name" {
  description = "S3 bucket for frontend static files"
  value       = aws_s3_bucket.frontend.id
}

output "cloudfront_distribution_id" {
  description = "CloudFront distribution ID for cache invalidation"
  value       = aws_cloudfront_distribution.frontend.id
}

output "cloudfront_domain_name" {
  description = "CloudFront domain name (the live URL)"
  value       = aws_cloudfront_distribution.frontend.domain_name
}
