import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
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
  const dest = path.join(config.fileStorageDir, key);
  await mkdir(path.dirname(dest), { recursive: true });
  await writeFile(dest, opts.buffer);
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
