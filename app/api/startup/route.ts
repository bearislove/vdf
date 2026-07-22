import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { toErrorMessage } from "@/lib/utils/errors";
import { recoverVideoVariant } from "@/lib/video/recover-video-variant";

export const dynamic = "force-dynamic";

interface ReconciliationResult {
  recovered: string[];
  failed: string[];
}

let reconciliation: Promise<ReconciliationResult> | null = null;

/** One-shot on app start: reconcile variants left in a generating state by a previous process. */
async function reconcileStuckVariants(): Promise<ReconciliationResult> {
  const stuck = await prisma.videoVariant.findMany({
    where: { status: { in: ["GENERATING_IMAGE", "GENERATING_VIDEO", "QUEUED"] } },
    include: { scene: { include: { episode: { include: { film: true } } } } },
  });

  const recovered: string[] = [];
  const failed: string[] = [];

  for (const variant of stuck) {
    if (!variant.scene) continue;

    const markFailed = async (errorDetail: string) => {
      await prisma.videoVariant.update({
        where: { id: variant.id },
        data: { status: "FAILED", errorDetail, completedAt: new Date() },
      });
      failed.push(variant.id);
    };

    const result = await recoverVideoVariant(variant);
    if (result.status === "recovered") recovered.push(variant.id);
    else if (result.status === "no_prompt_id") await markFailed("App restarted before submit");
    else if (result.status === "not_found") await markFailed("Job history not found after restart");
    else if (result.status === "provider_error" || result.status === "no_output") failed.push(variant.id);
    // still_running / provider_unreachable / download_failed remain recoverable.
  }

  return { recovered, failed };
}

export async function GET() {
  const alreadyRan = reconciliation !== null;
  reconciliation ??= reconcileStuckVariants();
  try {
    const result = await reconciliation;
    return NextResponse.json({ ok: true, alreadyRan, ...result });
  } catch (error) {
    reconciliation = null;
    return NextResponse.json({ error: toErrorMessage(error) }, { status: 500 });
  }
}
