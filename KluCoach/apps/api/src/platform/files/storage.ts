import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createHash, createHmac } from "node:crypto";
import { randomUUID } from "node:crypto";
import { prisma } from "@klunex-edu/database";
import { config } from "../../config.js";
import { validationError } from "../../lib/errors.js";

const ALLOWED = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
  "text/csv",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

const MAX_BYTES = 8 * 1024 * 1024;

export interface StorageProvider {
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
}

export class LocalStorageProvider implements StorageProvider {
  constructor(private root: string) {}
  async put(key: string, body: Buffer) {
    const dest = path.join(this.root, key);
    await mkdir(path.dirname(dest), { recursive: true });
    await writeFile(dest, body);
  }
  async get(key: string) {
    return readFile(path.join(this.root, key));
  }
}

function hmac(key: Buffer | string, data: string) {
  return createHmac("sha256", key).update(data, "utf8").digest();
}

function sha256Hex(data: Buffer | string) {
  return createHash("sha256").update(data).digest("hex");
}

/** S3-compatible PutObject/GetObject using AWS Signature Version 4. */
export class ObjectStorageProvider implements StorageProvider {
  constructor(
    private cfg: {
      endpoint: string;
      bucket: string;
      region: string;
      accessKey: string;
      secretKey: string;
    },
  ) {}

  private async signed(method: "PUT" | "GET", key: string, body?: Buffer, contentType?: string) {
    const endpoint = new URL(this.cfg.endpoint);
    const host = endpoint.host;
    const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, "");
    const dateStamp = amzDate.slice(0, 8);
    const payloadHash = sha256Hex(body ?? "");
    const canonicalUri = `${endpoint.pathname.replace(/\/$/, "")}/${this.cfg.bucket}/${key}`
      .replace(/\/{2,}/g, "/")
      .replace(/^\/?/, "/");
    const canonicalHeaders = `host:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
    const signedHeaders = "host;x-amz-content-sha256;x-amz-date";
    const canonical = `${method}\n${canonicalUri}\n\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;
    const credentialScope = `${dateStamp}/${this.cfg.region}/s3/aws4_request`;
    const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${credentialScope}\n${sha256Hex(canonical)}`;
    const kDate = hmac(`AWS4${this.cfg.secretKey}`, dateStamp);
    const kRegion = hmac(kDate, this.cfg.region);
    const kService = hmac(kRegion, "s3");
    const kSigning = hmac(kService, "aws4_request");
    const signature = createHmac("sha256", kSigning).update(stringToSign).digest("hex");
    const headers: Record<string, string> = {
      host,
      "x-amz-date": amzDate,
      "x-amz-content-sha256": payloadHash,
      authorization: `AWS4-HMAC-SHA256 Credential=${this.cfg.accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    };
    if (contentType) headers["content-type"] = contentType;
    const url = `${endpoint.origin}${canonicalUri}`;
    const res = await fetch(url, { method, headers, body: body ? new Uint8Array(body) : undefined });
    return res;
  }

  async put(key: string, body: Buffer, contentType: string) {
    const res = await this.signed("PUT", key, body, contentType);
    if (!res.ok) throw new Error("S3_PUT_FAILED");
  }

  async get(key: string) {
    const res = await this.signed("GET", key);
    if (!res.ok) throw new Error("S3_GET_FAILED");
    return Buffer.from(await res.arrayBuffer());
  }
}

export function getStorageProvider(): StorageProvider {
  if (config.storageProvider === "s3") {
    if (!config.s3Endpoint || !config.s3Bucket || !config.s3AccessKey || !config.s3SecretKey) {
      throw new Error("STORAGE_PROVIDER=s3 requires S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY");
    }
    return new ObjectStorageProvider({
      endpoint: config.s3Endpoint,
      bucket: config.s3Bucket,
      region: config.s3Region,
      accessKey: config.s3AccessKey,
      secretKey: config.s3SecretKey,
    });
  }
  return new LocalStorageProvider(config.fileStorageDir);
}

export async function storeFile(opts: {
  institutionId: string;
  uploadedById?: string;
  buffer: Buffer;
  mimeType: string;
  originalName: string;
}) {
  if (opts.buffer.length > MAX_BYTES) throw validationError("File exceeds 8 MB limit");
  const mime = opts.mimeType || "application/octet-stream";
  if (!ALLOWED.has(mime)) throw validationError("File type not allowed");
  const key = `${opts.institutionId}/${randomUUID()}`;
  await getStorageProvider().put(key, opts.buffer, mime);
  return prisma.fileObject.create({
    data: {
      institutionId: opts.institutionId,
      storageKey: key,
      mimeType: mime,
      sizeBytes: opts.buffer.length,
      originalName: opts.originalName.slice(0, 200),
      uploadedById: opts.uploadedById,
    },
  });
}
