import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileTypeFromBuffer } from "file-type";
import { assert } from "./errors";
export const MAX_FILE = 25 * 1024 * 1024;
export const uploadDir = () =>
  path.resolve(
    /* turbopackIgnore: true */ process.env.UPLOAD_DIR || "./uploads",
  );
export function storagePath(key: string) {
  assert(/^[a-f0-9-]{36}$/.test(key), 400, "Invalid file reference.");
  return path.join(/* turbopackIgnore: true */ uploadDir(), key);
}
const allowed = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
]);
export async function inspectFile(buffer: Buffer, filename: string) {
  assert(
    buffer.length > 0 && buffer.length <= MAX_FILE,
    413,
    "Choose a nonempty file no larger than 25 MB.",
  );
  const detected = await fileTypeFromBuffer(buffer);
  if (detected && allowed.has(detected.mime)) return detected.mime;
  if (/\.txt$/i.test(filename) && !buffer.includes(0)) {
    try {
      new TextDecoder("utf-8", { fatal: true }).decode(buffer);
      return "text/plain";
    } catch {}
  }
  assert(
    false,
    400,
    "Use PNG, JPG, WebP, GIF, PDF, DOCX, XLSX, PPTX, or UTF-8 TXT files.",
  );
}
export async function limitedForm(request: Request) {
  const cap = MAX_FILE + 128 * 1024;
  assert(
    Number(request.headers.get("content-length") || 0) <= cap,
    413,
    "File must be 25 MB or smaller.",
  );
  const reader = request.body?.getReader();
  assert(reader, 400, "Choose a file to upload.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    size += part.value.length;
    if (size > cap) {
      await reader.cancel();
      assert(false, 413, "File must be 25 MB or smaller.");
    }
    chunks.push(part.value);
  }
  return new Response(Buffer.concat(chunks), {
    headers: { "Content-Type": request.headers.get("content-type") || "" },
  }).formData();
}
export async function saveFile(key: string, buffer: Buffer) {
  await mkdir(uploadDir(), { recursive: true, mode: 0o700 });
  await writeFile(storagePath(key), buffer, { flag: "wx", mode: 0o600 });
}
export const removeFile = (key: string) =>
  unlink(storagePath(key)).catch((e) => {
    if (e.code !== "ENOENT") throw e;
  });
export const loadFile = (key: string) =>
  readFile(/* turbopackIgnore: true */ storagePath(key));
