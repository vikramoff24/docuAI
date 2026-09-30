/**
 * StorageService — S3-compatible object storage abstraction
 *
 * ────────────────────────────────────────────────────────
 * WHY PRESIGNED URLS?
 * ────────────────────────────────────────────────────────
 * For large file uploads, we don't want clients to upload through
 * our API server. That would:
 * 1. Use our server's memory and bandwidth
 * 2. Add latency (client → API → S3 vs client → S3 directly)
 * 3. Risk timeouts for large files
 *
 * Instead, we use "presigned URLs":
 * 1. Client asks API: "I want to upload a 50MB PDF"
 * 2. API generates a time-limited S3 PUT URL (signed with our credentials)
 * 3. Client uploads directly to S3 using that URL
 * 4. Client calls API to confirm: "Upload complete"
 * 5. API queues processing job
 *
 * The presigned URL is:
 * - Time-limited (15 minutes) — expires if unused
 * - Single-purpose (PUT only) — cannot be used for other operations
 * - Scoped (specific key only) — cannot upload to different paths
 * - Authenticated — our AWS credentials sign the URL without exposing them
 *
 * ────────────────────────────────────────────────────────
 * LOCAL DEVELOPMENT (LocalStack)
 * ────────────────────────────────────────────────────────
 * We use LocalStack (runs in Docker) which emulates AWS S3.
 * Config:
 *   endpoint: http://localhost:4566
 *   forcePathStyle: true (required for LocalStack)
 *   credentials: 'test'/'test' (any value works for LocalStack)
 *
 * Production: Remove endpoint override, use real AWS credentials.
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export interface PresignedUploadUrl {
  uploadUrl: string;      // PUT to this URL
  storageKey: string;     // Remember this — use it to reference the file later
  expiresIn: number;      // Seconds until URL expires
}

export interface PresignedDownloadUrl {
  downloadUrl: string;
  expiresIn: number;
}

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly s3: S3Client;
  private readonly bucket: string;

  constructor(private readonly config: ConfigService) {
    const endpoint = config.get<string>('storage.endpoint');
    const region = config.get<string>('storage.region', 'us-east-1');
    const accessKeyId = config.get<string>('storage.accessKeyId', 'test');
    const secretAccessKey = config.get<string>('storage.secretAccessKey', 'test');
    const forcePathStyle = config.get<boolean>('storage.forcePathStyle', true);

    this.bucket = config.get<string>('storage.bucket', 'docuflow-dev');

    this.s3 = new S3Client({
      region,
      credentials: { accessKeyId, secretAccessKey },
      // endpoint is only set for local dev (LocalStack)
      ...(endpoint ? { endpoint, forcePathStyle } : {}),
    });

    this.logger.log(`Storage initialized: bucket=${this.bucket}, endpoint=${endpoint ?? 'AWS'}`);
  }

  // ──────────────────────────────────────────────────
  // PRESIGNED UPLOAD URL
  // ──────────────────────────────────────────────────

  async generateUploadUrl(
    storageKey: string,
    mimeType: string,
    expiresInSeconds = 900, // 15 minutes
  ): Promise<PresignedUploadUrl> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: storageKey,
      ContentType: mimeType,
    });

    const uploadUrl = await getSignedUrl(this.s3, command, { expiresIn: expiresInSeconds });

    return {
      uploadUrl,
      storageKey,
      expiresIn: expiresInSeconds,
    };
  }

  // ──────────────────────────────────────────────────
  // PRESIGNED DOWNLOAD URL
  // ──────────────────────────────────────────────────

  async generateDownloadUrl(
    storageKey: string,
    expiresInSeconds = 3600, // 1 hour
  ): Promise<PresignedDownloadUrl> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: storageKey,
    });

    const downloadUrl = await getSignedUrl(this.s3, command, { expiresIn: expiresInSeconds });

    return {
      downloadUrl,
      expiresIn: expiresInSeconds,
    };
  }

  // ──────────────────────────────────────────────────
  // DELETE OBJECT
  // ──────────────────────────────────────────────────

  async deleteObject(storageKey: string): Promise<void> {
    await this.s3.send(new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: storageKey,
    }));
    this.logger.log(`Deleted object: ${storageKey}`);
  }

  // ──────────────────────────────────────────────────
  // CHECK OBJECT EXISTS
  // ──────────────────────────────────────────────────

  async objectExists(storageKey: string): Promise<boolean> {
    try {
      await this.s3.send(new HeadObjectCommand({
        Bucket: this.bucket,
        Key: storageKey,
      }));
      return true;
    } catch {
      return false;
    }
  }

  // ──────────────────────────────────────────────────
  // LIST OBJECTS (for admin/debugging)
  // ──────────────────────────────────────────────────

  async listObjects(prefix: string): Promise<string[]> {
    const result = await this.s3.send(new ListObjectsV2Command({
      Bucket: this.bucket,
      Prefix: prefix,
    }));

    return (result.Contents ?? []).map((obj) => obj.Key ?? '').filter(Boolean);
  }

  // ──────────────────────────────────────────────────
  // STORAGE KEY HELPERS
  // ──────────────────────────────────────────────────

  /**
   * Generate a deterministic, namespaced S3 key for a document.
   *
   * Format: organizations/{orgId}/documents/{docId}/{filename}
   *
   * WHY INCLUDE orgId IN THE KEY?
   * 1. Namespacing: different orgs can have files with the same name
   * 2. Permissions: you can set IAM policies on org prefixes
   * 3. Auditing: easy to see all files for an org in S3
   * 4. Deletion: "delete all files for org X" = delete prefix
   */
  buildDocumentKey(organizationId: string, documentId: string, filename: string): string {
    // Sanitize filename to remove path traversal characters
    const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    return `organizations/${organizationId}/documents/${documentId}/${safeName}`;
  }
}
