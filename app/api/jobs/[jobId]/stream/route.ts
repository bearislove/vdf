import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _: NextRequest,
  { params }: { params: { jobId: string } }
) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      let done = false;
      let polls = 0;
      const maxPolls = 300; // 5 min at 1s interval

      while (!done && polls < maxPolls) {
        const variant = await prisma.videoVariant.findUnique({
          where: { id: params.jobId },
        });

        if (!variant) {
          send({ type: "error", message: "Variant not found" });
          break;
        }

        if (variant.status === "DONE") {
          send({
            type: "done",
            videoPath: variant.videoPath,
            thumbnailPath: variant.thumbnailPath,
            lastFramePath: variant.lastFramePath,
          });
          done = true;
        } else if (variant.status === "FAILED") {
          send({ type: "error", message: variant.errorDetail ?? "Generation failed" });
          done = true;
        } else if (
          variant.status === "GENERATING_VIDEO" ||
          variant.status === "GENERATING_IMAGE"
        ) {
          const pct =
            variant.progressTotal > 0
              ? Math.round((variant.progressStep / variant.progressTotal) * 100)
              : 0;
          send({
            type: "progress",
            step: variant.progressStep,
            total: variant.progressTotal,
            pct,
            node: variant.currentNode,
            message: variant.statusMessage,
          });
        } else {
          send({ type: "status", message: "Queued..." });
        }

        polls++;
        await new Promise((r) => setTimeout(r, 1000));
      }

      if (!done) {
        send({ type: "error", message: "Stream timeout" });
      }

      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
