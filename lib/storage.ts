import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

function sanitizeFilename(filename: string) {
  return filename.replace(/[^a-zA-Z0-9.-]/g, "-").toLowerCase();
}

function getS3Client() {
  const region = process.env.AWS_REGION;
  const bucket = process.env.AWS_S3_BUCKET;
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

  if (!region || !bucket || !accessKeyId || !secretAccessKey) {
    return null;
  }

  return {
    client: new S3Client({
      region,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    }),
    bucket,
  };
}

async function uploadFile(file: File, prefix: string) {
  const extensionSafeName = sanitizeFilename(file.name || "file.png");
  const fileKey = `${prefix}/${randomUUID()}-${extensionSafeName}`;
  const bytes = Buffer.from(await file.arrayBuffer());
  const s3 = getS3Client();

  if (s3) {
    await s3.client.send(
      new PutObjectCommand({
        Bucket: s3.bucket,
        Key: fileKey,
        Body: bytes,
        ContentType: file.type || "application/octet-stream",
      }),
    );

    const publicBaseUrl =
      process.env.AWS_S3_PUBLIC_BASE_URL ||
      `https://${s3.bucket}.s3.${process.env.AWS_REGION}.amazonaws.com`;

    return `${publicBaseUrl}/${fileKey}`;
  }

  const uploadsDirectory = path.join(process.cwd(), "public", "uploads");
  await mkdir(uploadsDirectory, { recursive: true });

  const filename = `${randomUUID()}-${extensionSafeName}`;
  const fullPath = path.join(uploadsDirectory, filename);
  await writeFile(fullPath, bytes);

  return `/uploads/${filename}`;
}

export async function uploadTradeImage(file: File) {
  return uploadFile(file, "trade-images");
}

export async function uploadAvatar(file: File) {
  return uploadFile(file, "avatars");
}
