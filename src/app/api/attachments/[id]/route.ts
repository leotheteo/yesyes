import { db } from "@/lib/db";
import { assert } from "@/lib/errors";
import { failure, json, member, origin } from "@/lib/http";
import { loadFile, removeFile } from "@/lib/uploads";
import { attachment } from "@/lib/attachments";
type Context = { params: Promise<{ id: string }> };
export async function GET(_request: Request, context: Context) {
  try {
    await member();
    const { id } = await context.params;
    const file = await attachment(id);
    const buffer = await loadFile(file.storageKey);
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": file.contentType,
        "Content-Length": String(buffer.length),
        "Content-Disposition": `attachment; filename="download"; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "sandbox",
      },
    });
  } catch (e) {
    return failure(e);
  }
}
export async function DELETE(request: Request, context: Context) {
  try {
    origin(request);
    await member();
    const { id } = await context.params;
    const file = await db.$transaction(async (tx) => {
      await tx.household.update({
        where: { id: "family" },
        data: { revision: { increment: 1 } },
      });
      const file = await tx.attachment.findUnique({ where: { id } });
      assert(file, 404, "File is already removed. Refresh the event.");
      await tx.attachment.delete({ where: { id } });
      return file;
    });
    await removeFile(file.storageKey);
    return json({ ok: true });
  } catch (e) {
    return failure(e);
  }
}
