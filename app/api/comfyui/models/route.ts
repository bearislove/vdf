import { NextRequest, NextResponse } from "next/server";

const COMFYUI_URL = process.env.COMFYUI_URL ?? "http://localhost:8188";

const MODEL_TYPES = ["checkpoints", "loras", "vae", "controlnet", "diffusion_models"] as const;

export async function GET(req: NextRequest) {
  const type = req.nextUrl.searchParams.get("type") as (typeof MODEL_TYPES)[number] | null;

  if (type && MODEL_TYPES.includes(type)) {
    try {
      const res = await fetch(`${COMFYUI_URL}/models/${type}`, {
        signal: AbortSignal.timeout(10000),
      });
      const data = await res.json();
      return NextResponse.json(data);
    } catch {
      return NextResponse.json([], { status: 503 });
    }
  }

  const results: Record<string, string[]> = {};
  await Promise.all(
    MODEL_TYPES.map(async (t) => {
      try {
        const res = await fetch(`${COMFYUI_URL}/models/${t}`, {
          signal: AbortSignal.timeout(10000),
        });
        results[t] = await res.json();
      } catch {
        results[t] = [];
      }
    })
  );
  return NextResponse.json(results);
}
