import { OpenAICompatibleLLMProvider } from "@/lib/providers/llm/openai-compatible";
import { AgnesImageProvider } from "@/lib/providers/image/agnes";
import { ComfyUIImageProvider } from "@/lib/providers/image/comfyui";
import { AgnesVideoProvider } from "@/lib/providers/video/agnes";
import { ComfyUIVideoProvider } from "@/lib/providers/video/comfyui";
import { ProviderRegistry } from "@/lib/providers/provider-registry";
import type {
  GenerationProviderName,
  ImageProvider,
  ImageProviderCapabilities,
  LLMProvider,
  TextProviderCapabilities,
  TextProviderName,
  VideoProvider,
  VideoProviderCapabilities,
} from "@/lib/providers/types";

const textProviders = new ProviderRegistry<
  TextProviderName,
  LLMProvider,
  TextProviderCapabilities
>()
  .register(
    new OpenAICompatibleLLMProvider({
      name: "openai",
      apiKey: process.env.AI_API_KEY ?? "",
      baseURL: process.env.AI_BASE_URL ?? "https://api.openai.com/v1",
      model: process.env.AI_MODEL ?? "gpt-4o",
    }),
    { label: "OpenAI compatible", capabilities: { chatCompletion: true } }
  )
  .register(
    new OpenAICompatibleLLMProvider({
      name: "ollama",
      apiKey: process.env.OLLAMA_API_KEY ?? "ollama",
      baseURL: process.env.OLLAMA_BASE_URL ?? "http://localhost:11434/v1",
      model: process.env.OLLAMA_MODEL ?? "llama3.2",
    }),
    { label: "Ollama", capabilities: { chatCompletion: true } }
  )
  .register(
    new OpenAICompatibleLLMProvider({
      name: "agnes",
      apiKey: process.env.AGNES_AI_API_KEY ?? "",
      baseURL: process.env.AGNES_AI_BASE_URL ?? "https://apihub.agnes-ai.com/v1",
      model: process.env.AGNES_AI_TEXT_MODEL ?? "agnes-2.0-flash",
    }),
    { label: "Agnes AI", capabilities: { chatCompletion: true } }
  );

const imageProviders = new ProviderRegistry<
  GenerationProviderName,
  ImageProvider,
  ImageProviderCapabilities
>()
  .register(new AgnesImageProvider(), {
    label: "Agnes AI",
    capabilities: { referenceImages: true, maxReferenceImages: 4 },
  })
  .register(new ComfyUIImageProvider(), {
    label: "ComfyUI",
    capabilities: { referenceImages: false, maxReferenceImages: 0 },
  });

const videoProviders = new ProviderRegistry<
  GenerationProviderName,
  VideoProvider,
  VideoProviderCapabilities
>()
  .register(new AgnesVideoProvider(), {
    label: "Agnes AI",
    capabilities: { referenceImages: true, maxReferenceImages: 4, recovery: true },
  })
  .register(new ComfyUIVideoProvider(), {
    label: "ComfyUI",
    capabilities: { referenceImages: true, maxReferenceImages: 4, recovery: true },
  });

function configuredTextDefault(): TextProviderName {
  const configured = process.env.DEFAULT_TEXT_PROVIDER ?? process.env.DEFAULT_LLM_PROVIDER;
  return textProviders.resolveName(configured, "openai");
}

function configuredImageDefault(): GenerationProviderName {
  return imageProviders.resolveName(process.env.DEFAULT_IMAGE_PROVIDER, "agnes");
}

function configuredVideoDefault(): GenerationProviderName {
  return videoProviders.resolveName(process.env.DEFAULT_VIDEO_PROVIDER, "agnes");
}

function normalizeGenerationProviderName(requested: unknown): unknown {
  return typeof requested === "string" ? requested.toLowerCase() : requested;
}

export function resolveTextProviderName(requested?: unknown): TextProviderName {
  return textProviders.resolveName(requested, configuredTextDefault());
}

export function resolveImageProviderName(requested?: unknown): GenerationProviderName {
  return imageProviders.resolveName(normalizeGenerationProviderName(requested), configuredImageDefault());
}

export function resolveImageProviderForReferences(
  requested: unknown,
  referenceCount: number
): GenerationProviderName {
  const requestedName = resolveImageProviderName(requested);
  const requestedCapabilities = imageProviders.descriptor(requestedName).capabilities;
  if (
    referenceCount === 0 ||
    (requestedCapabilities.referenceImages && requestedCapabilities.maxReferenceImages >= referenceCount)
  ) {
    return requestedName;
  }

  const capableProvider = imageProviders.findByCapability(
    (capabilities) => capabilities.referenceImages && capabilities.maxReferenceImages >= referenceCount
  );
  if (!capableProvider) {
    throw new Error(`No image provider supports ${referenceCount} reference images`);
  }
  return capableProvider;
}

export function resolveVideoProviderName(requested?: unknown): GenerationProviderName {
  return videoProviders.resolveName(normalizeGenerationProviderName(requested), configuredVideoDefault());
}

export function serializeGenerationProviderName(name: GenerationProviderName): "AGNES" | "COMFYUI" {
  return name.toUpperCase() as "AGNES" | "COMFYUI";
}

export function getLLMProvider(requested?: unknown): LLMProvider {
  return textProviders.get(resolveTextProviderName(requested));
}

export function getImageProvider(name: GenerationProviderName): ImageProvider {
  return imageProviders.get(name);
}

export function getVideoProvider(name: GenerationProviderName): VideoProvider {
  return videoProviders.get(name);
}

export function listTextProviders() {
  return textProviders.list();
}

export function listImageProviders() {
  return imageProviders.list();
}

export function listVideoProviders() {
  return videoProviders.list();
}
