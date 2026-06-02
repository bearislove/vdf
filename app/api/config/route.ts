import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";

export function GET() {
  const videoModel = process.env.DEFAULT_VIDEO_MODEL ?? "svd_xt.safetensors";
  const isSvd = /svd/i.test(videoModel);
  return NextResponse.json({ videoModel, isSvd });
}
