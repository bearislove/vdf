import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import { Readable } from "stream";
import { resolveStoragePath } from "@/lib/storage";

const ALLOWED_MIME: Record<string, string> = {
  ".mp4": "video/mp4",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".wav": "audio/wav",
};

function parseRange(rangeHeader: string, fileSize: number): [number, number] {
  const [, rangeStr] = rangeHeader.split("=");
  const [startStr, endStr] = rangeStr.split("-");
  const start = parseInt(startStr, 10);
  const end = endStr ? parseInt(endStr, 10) : fileSize - 1;
  return [start, Math.min(end, fileSize - 1)];
}

export async function GET(
  req: NextRequest,
  { params }: { params: { path: string[] } }
) {
  let resolved: string;
  try {
    resolved = resolveStoragePath(path.join(...params.path));
  } catch {
    return new NextResponse("Forbidden", { status: 403 });
  }

  if (!fs.existsSync(resolved)) {
    return new NextResponse("Not Found", { status: 404 });
  }

  const ext = path.extname(resolved).toLowerCase();
  const mime = ALLOWED_MIME[ext];
  if (!mime) return new NextResponse("Forbidden", { status: 403 });

  const stat = fs.statSync(resolved);
  const range = req.headers.get("range");

  if (range && mime.startsWith("video/")) {
    const [start, end] = parseRange(range, stat.size);
    const chunkSize = end - start + 1;
    const stream = fs.createReadStream(resolved, { start, end });
    return new NextResponse(Readable.toWeb(stream) as ReadableStream, {
      status: 206,
      headers: {
        "Content-Type": mime,
        "Content-Range": `bytes ${start}-${end}/${stat.size}`,
        "Accept-Ranges": "bytes",
        "Content-Length": String(chunkSize),
      },
    });
  }

  const stream = fs.createReadStream(resolved);
  return new NextResponse(Readable.toWeb(stream) as ReadableStream, {
    headers: {
      "Content-Type": mime,
      "Content-Length": String(stat.size),
      "Accept-Ranges": "bytes",
    },
  });
}
