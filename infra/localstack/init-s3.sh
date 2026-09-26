#!/bin/bash
# LocalStack S3 initialization script
# Runs after LocalStack is ready
#
# Creates the S3 bucket for DocuFlow AI documents.
# In production, this bucket is pre-created in AWS.

set -e

echo "==> Creating DocuFlow S3 bucket..."

awslocal s3 mb s3://docuflow-dev --region us-east-1

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
      "AllowedOrigins": ["http://localhost:3000"],
      "ExposeHeaders": ["ETag"],
      "MaxAgeSeconds": 3000
    }
  ]
}'

echo "==> S3 bucket 'docuflow-dev' created successfully"
awslocal s3 ls
