import { attachment } from "@/lib/attachments";
import { assert } from "@/lib/errors";
import { failure, member } from "@/lib/http";
import { loadFile } from "@/lib/uploads";
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    await member();
    const file = await attachment((await context.params).id);
    assert(
      file.contentType.startsWith("image/") ||
        ["application/pdf", "text/plain"].includes(file.contentType),
      415,
      "Preview is not available for this file type. Download the file to open it.",
    );
    const bytes = await loadFile(file.storageKey);
    const headers: Record<string, string> = {
      "Content-Type": file.contentType,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
      "Accept-Ranges": "bytes",
    };
    if (file.contentType === "text/plain") {
      const truncated = bytes.length > 200000;
      return new Response(new Uint8Array(bytes.subarray(0, 200000)), {
        headers: { ...headers, "X-Preview-Truncated": String(truncated) },
      });
    }
    const range = request.headers.get("range");
    if (range) {
      const match = /^bytes=(\d+)-(\d*)$/.exec(range);
      if (!match)
        return new Response(null, {
          status: 416,
          headers: { ...headers, "Content-Range": `bytes */${bytes.length}` },
        });
      const start = Number(match[1]),
        end = Math.min(
          match[2] ? Number(match[2]) : bytes.length - 1,
          bytes.length - 1,
        );
      if (!Number.isSafeInteger(start) || start > end || start >= bytes.length)
        return new Response(null, {
          status: 416,
          headers: { ...headers, "Content-Range": `bytes */${bytes.length}` },
        });
      return new Response(new Uint8Array(bytes.subarray(start, end + 1)), {
        status: 206,
        headers: {
          ...headers,
          "Content-Range": `bytes ${start}-${end}/${bytes.length}`,
          "Content-Length": String(end - start + 1),
        },
      });
    }
    return new Response(new Uint8Array(bytes), {
      headers: { ...headers, "Content-Length": String(bytes.length) },
    });
  } catch (e) {
    return failure(e);
  }
}
