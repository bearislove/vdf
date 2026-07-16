import { NextResponse } from "next/server";
import {
  listImageProviders,
  listTextProviders,
  listVideoProviders,
  resolveImageProviderName,
  resolveTextProviderName,
  resolveVideoProviderName,
} from "@/lib/providers/registry";
export const dynamic = "force-dynamic";

export function GET() {
  const videoModel = process.env.DEFAULT_VIDEO_MODEL ?? "svd_xt.safetensors";
  const isSvd = /svd/i.test(videoModel);
  return NextResponse.json({
    videoModel,
    isSvd,
    defaultTextProvider: resolveTextProviderName(),
    defaultImageProvider: resolveImageProviderName(),
    defaultVideoProvider: resolveVideoProviderName(),
    providers: {
      text: listTextProviders(),
      image: listImageProviders(),
      video: listVideoProviders(),
    },
  });
}
