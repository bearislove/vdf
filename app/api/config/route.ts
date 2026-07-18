import { NextResponse } from "next/server";
import {
  listImageProviders,
  listTextProviders,
  listVideoProviders,
  resolveImageProviderName,
  resolveTextProviderName,
  resolveVideoProviderName,
} from "@/lib/providers/registry";
import { getAgnesCredentialCount } from "@/lib/providers/agnes-credentials";
export const dynamic = "force-dynamic";

export function GET() {
  const videoModel = process.env.DEFAULT_VIDEO_MODEL ?? "svd_xt.safetensors";
  return NextResponse.json({
    videoModel,
    defaultTextProvider: resolveTextProviderName(),
    defaultImageProvider: resolveImageProviderName(),
    defaultVideoProvider: resolveVideoProviderName(),
    videoConcurrency: {
      agnes: getAgnesCredentialCount(),
      comfyui: 1,
    },
    providers: {
      text: listTextProviders(),
      image: listImageProviders(),
      video: listVideoProviders(),
    },
  });
}
