#!/bin/bash
# LocalStack S3 initialization script
# Runs after LocalStack is ready
#
# Creates the S3 bucket for DocuFlow AI documents.
# In production, this bucket is pre-created in AWS.

set -e

# Idempotent: runs on every LocalStack start. The bucket may already exist
# (persisted volume), and with `set -e` a failing `mb` would skip the CORS
# setup below, breaking browser uploads.
if awslocal s3api head-bucket --bucket docuflow-dev 2>/dev/null; then
  echo "==> S3 bucket 'docuflow-dev' already exists"
else
  echo "==> Creating DocuFlow S3 bucket..."
  awslocal s3 mb s3://docuflow-dev --region us-east-1
fi

# Enable versioning (good practice for document storage)
awslocal s3api put-bucket-versioning \
  --bucket docuflow-dev \
  --versioning-configuration Status=Enabled

# Set CORS (for direct browser uploads via presigned URLs)
awslocal s3api put-bucket-cors --bucket docuflow-dev --cors-configuration '{
  "CORSRules": [
    {
      "AllowedHeaders": ["*"],
      "AllowedMethods": ["GET", "PUT", "POST", "DELETE", "HEAD"],
      "AllowedOrigins": ["http://localhost:3000", "http://127.0.0.1:3000"],
      "ExposeHeaders": ["ETag"],
      "MaxAgeSeconds": 3000
    }
  ]
}'

echo "==> S3 bucket 'docuflow-dev' ready (versioning + CORS applied)"
awslocal s3 ls
