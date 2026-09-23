import fs from "node:fs";
import { Readable } from "node:stream";
import { NextRequest } from "next/server";
import { mediaFile } from "@/lib/server/mediaStore";
import { viewableMedia } from "@/lib/server/properties";
import { currentUser } from "@/lib/server/session";

// Serves a photo or video only to users whose role may see that
// property's media. Supports Range requests so videos can seek.
export async function GET(request: NextRequest, ctx: RouteContext<"/api/media/[id]">) {
  const user = await currentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const { id } = await ctx.params;
  const media = viewableMedia(user, id);
  const file = media ? mediaFile(media.propertyId, media.id) : null;
  if (!media || !file) return new Response("Not found", { status: 404 });

  const headers = new Headers({
    "Content-Type": media.mime,
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, max-age=3600",
    "X-Content-Type-Options": "nosniff",
    "Content-Disposition": `${request.nextUrl.searchParams.has("download") ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(media.originalName)}`,
  });

  const range = request.headers.get("range")?.match(/^bytes=(\d*)-(\d*)$/);
  if (range && (range[1] || range[2])) {
    let start: number;
    let end: number;
    if (range[1]) {
      start = Number(range[1]);
      end = range[2] ? Math.min(Number(range[2]), file.size - 1) : file.size - 1;
    } else {
      // Suffix range: the last N bytes.
      start = Math.max(file.size - Number(range[2]), 0);
      end = file.size - 1;
    }
    if (start > end || start >= file.size) {
      return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${file.size}` } });
    }
    headers.set("Content-Range", `bytes ${start}-${end}/${file.size}`);
    headers.set("Content-Length", String(end - start + 1));
    const stream = Readable.toWeb(fs.createReadStream(file.path, { start, end })) as ReadableStream;
    return new Response(stream, { status: 206, headers });
  }

  headers.set("Content-Length", String(file.size));
  return new Response(Readable.toWeb(fs.createReadStream(file.path)) as ReadableStream, { headers });
}
