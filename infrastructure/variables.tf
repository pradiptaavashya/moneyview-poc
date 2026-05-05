variable "project_name" {
  description = "Project name used as prefix for all resources"
  type        = string
  default     = "mv-liveness"
}

variable "environment" {
  description = "Deployment environment (dev, staging, prod)"
  type        = string
  default     = "dev"
}

variable "aws_region" {
  description = "AWS region for all resources"
  type        = string
  default     = "ap-south-1"
}

variable "video_retention_days" {
  description = "Number of days to retain video recordings in S3"
  type        = number
  default     = 90
}

variable "frame_capture_rate" {
  description = "Frames per second to capture during challenges"
  type        = number
  default     = 4
}

variable "cognito_admin_emails" {
  description = "Email addresses to add to admin group on creation"
  type        = list(string)
  default     = []
}

variable "terraform_state_bucket" {
  description = "S3 bucket for storing Terraform state (must be pre-created)"
  type        = string
  default     = "mv-liveness-terraform-state"
}

variable "terraform_state_lock_table" {
  description = "DynamoDB table for Terraform state locking (must be pre-created)"
  type        = string
  default     = "mv-liveness-terraform-locks"
}
