// Creates the bucket and its CORS rule (browsers upload/download with presigned
// URLs). Idempotent, and works with any S3-compatible store: SeaweedFS here,
// Cloudflare R2 or AWS S3 if you point STORAGE_ENDPOINT elsewhere.
import { createRequire } from 'node:module';

const require = createRequire('/app/apps/api/package.json');
const { S3Client, CreateBucketCommand, PutBucketCorsCommand, HeadBucketCommand } = require('@aws-sdk/client-s3');

const env = (k) => {
  if (!process.env[k]) throw new Error(`${k} is not set`);
  return process.env[k];
};
const bucket = env('STORAGE_BUCKET');
const s3 = new S3Client({
  region: process.env.STORAGE_REGION ?? 'us-east-1',
  endpoint: env('STORAGE_ENDPOINT'),
  forcePathStyle: true,
  credentials: { accessKeyId: env('STORAGE_ACCESS_KEY_ID'), secretAccessKey: env('STORAGE_SECRET_ACCESS_KEY') },
});

for (let attempt = 1; ; attempt++) {
  try {
    await s3.send(new HeadBucketCommand({ Bucket: bucket }));
    console.log(`bucket ${bucket} exists`);
    break;
  } catch (err) {
    const status = err?.$metadata?.httpStatusCode;
    if (status === 404) {
      await s3.send(new CreateBucketCommand({ Bucket: bucket }));
      console.log(`bucket ${bucket} created`);
      break;
    }
    if (attempt >= 30) throw err;
    await new Promise((r) => setTimeout(r, 2000)); // storage still starting
  }
}

try {
  await s3.send(
    new PutBucketCorsCommand({
      Bucket: bucket,
      CORSConfiguration: {
        CORSRules: [
          {
            AllowedOrigins: [env('APP_URL')],
            AllowedMethods: ['GET', 'PUT', 'HEAD'],
            AllowedHeaders: ['*'],
            ExposeHeaders: ['ETag'],
            MaxAgeSeconds: 3600,
          },
        ],
      },
    }),
  );
  console.log(`CORS set for ${env('APP_URL')}`);
} catch (err) {
  // Some stores configure CORS server-wide instead (SeaweedFS: -s3.allowedOrigins)
  console.warn(`bucket CORS not set (${err.name}); relying on server-wide CORS`);
}
