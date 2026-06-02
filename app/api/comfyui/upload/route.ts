import { NextRequest, NextResponse } from "next/server";

const COMFYUI_URL = process.env.COMFYUI_URL ?? "http://localhost:8188";

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  try {
    const res = await fetch(`${COMFYUI_URL}/upload/image`, {
      method: "POST",
      body: formData,
      signal: AbortSignal.timeout(30000),
    });
    const data = await res.json();
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 503 });
  }
}
