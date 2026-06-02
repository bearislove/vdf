import { NextResponse } from "next/server";

const COMFYUI_URL = process.env.COMFYUI_URL ?? "http://localhost:8188";

export async function GET() {
  try {
    const res = await fetch(`${COMFYUI_URL}/system_stats`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error("ComfyUI not OK");
    const data = await res.json();
    return NextResponse.json({
      connected: true,
      version: data?.system?.comfyui_version ?? "unknown",
    });
  } catch {
    return NextResponse.json({ connected: false });
  }
}
