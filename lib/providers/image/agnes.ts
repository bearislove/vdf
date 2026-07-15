import { agnesGenerateImage } from "@/lib/providers/agnes";
import type { ImageGenHooks, ImageGenInput, ImageProvider } from "@/lib/providers/types";

export class AgnesImageProvider implements ImageProvider {
  readonly name = "agnes" as const;

  async generateImage(input: ImageGenInput, hooks: ImageGenHooks): Promise<void> {
    hooks.onStatus("Đang gửi tới Agnes AI...");
    try {
      const buffer = await agnesGenerateImage({
        prompt: input.prompt,
        width: input.width,
        height: input.height,
        model: input.model,
        referenceImagePaths: input.referenceImagePaths,
      });
      await hooks.onDone(buffer);
    } catch (e) {
      hooks.onError(String(e));
    }
  }
}
