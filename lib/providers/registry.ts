import type { GenerationProviderName, ImageProvider, LLMProvider, VideoProvider } from "@/lib/providers/types";
import { OpenAICompatibleLLMProvider } from "@/lib/providers/llm/openai-compatible";
import { AgnesImageProvider } from "@/lib/providers/image/agnes";
import { ComfyUIImageProvider } from "@/lib/providers/image/comfyui";
import { AgnesVideoProvider } from "@/lib/providers/video/agnes";
import { ComfyUIVideoProvider } from "@/lib/providers/video/comfyui";

/** Precedence: explicit request value > env default > agnes */
function resolveProviderName(requested: unknown, envDefault: string | undefined): GenerationProviderName {
  if (requested === "agnes" || requested === "comfyui") return requested;
  return envDefault === "comfyui" ? "comfyui" : "agnes";
}

export function resolveImageProviderName(requested?: unknown): GenerationProviderName {
  return resolveProviderName(requested, process.env.DEFAULT_IMAGE_PROVIDER);
}

/** Chỉ Agnes hỗ trợ ảnh tham chiếu — có ảnh thì luôn dùng Agnes để giữ đúng chủ thể trong ảnh người dùng upload */
export function resolveImageProviderForReferences(
  requested: unknown,
  referenceCount: number
): GenerationProviderName {
  if (referenceCount > 0) return "agnes";
  return resolveImageProviderName(requested);
}

export function resolveVideoProviderName(requested?: unknown): GenerationProviderName {
  return resolveProviderName(requested, process.env.DEFAULT_VIDEO_PROVIDER);
}

const imageProviders: Record<GenerationProviderName, ImageProvider> = {
  comfyui: new ComfyUIImageProvider(),
  agnes: new AgnesImageProvider(),
};

const videoProviders: Record<GenerationProviderName, VideoProvider> = {
  comfyui: new ComfyUIVideoProvider(),
  agnes: new AgnesVideoProvider(),
};

let llmProvider: LLMProvider | null = null;

export function getImageProvider(name: GenerationProviderName): ImageProvider {
  return imageProviders[name];
}

export function getVideoProvider(name: GenerationProviderName): VideoProvider {
  return videoProviders[name];
}

export function getLLMProvider(): LLMProvider {
  llmProvider ??= new OpenAICompatibleLLMProvider();
  return llmProvider;
}
