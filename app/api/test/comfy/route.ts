import { NextRequest, NextResponse } from "next/server";
import { newClientId, submitPrompt, listenToPrompt, downloadOutput } from "@/lib/comfyui/client";
import { buildTestImgWorkflow } from "@/lib/comfyui/workflows/test-img";
import { exportsDir, ensureDir } from "@/lib/storage";
import path from "path";
import fs from "fs";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const prompt = body.prompt ?? "a beautiful sunset over rice fields, cinematic";
  const model = body.model ?? "realisticVisionV51.safetensors";
  const steps = body.steps ?? 8;

  const workflow = buildTestImgWorkflow({ prompt, model, width: 512, height: 512, steps, seed: 42 });
  const clientId = newClientId();

  try {
    const promptId = await submitPrompt(workflow, clientId);

    const result = await new Promise<{ success: boolean; file?: string; error?: string }>((resolve) => {
      const cleanup = listenToPrompt(promptId, clientId, async (event) => {
        if (event.type === "done") {
          const COMFYUI_URL = process.env.COMFYUI_URL ?? "http://localhost:8188";
          const history = await fetch(`${COMFYUI_URL}/history/${promptId}`).then((r) => r.json());
          const item = history[promptId];

          if (!item?.status?.completed || item?.status?.status_str === "error") {
            resolve({ success: false, error: "ComfyUI error" });
            return;
          }

          for (const [, out] of Object.entries(item.outputs ?? {}) as [string, { images?: Array<{ filename: string; subfolder: string; type: string }> }][]) {
            if (out?.images?.length) {
              const img = out.images[0];
              const buf = await downloadOutput(img.filename, img.subfolder, img.type);
              const dir = exportsDir();
              ensureDir(dir);
              const outPath = path.join(dir, `test_${Date.now()}.png`);
              fs.writeFileSync(outPath, buf);
              resolve({ success: true, file: outPath });
              return;
            }
          }
          resolve({ success: false, error: "No output images" });
        } else if (event.type === "error") {
          resolve({ success: false, error: event.error });
        }
      });

      setTimeout(() => {
        cleanup();
        resolve({ success: false, error: "Timeout after 120s" });
      }, 120000);
    });

    return NextResponse.json({ promptId, clientId, ...result });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
