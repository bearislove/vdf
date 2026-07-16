import OpenAI from "openai";
import type { LLMProvider, TextProviderName } from "@/lib/providers/types";

interface OpenAICompatibleProviderConfig {
  name: TextProviderName;
  apiKey: string;
  baseURL: string;
  model: string;
}

/**
 * LLM provider for any OpenAI-compatible endpoint (9Router, OpenAI, Ollama, ...).
 * Configured entirely via env: AI_BASE_URL, AI_API_KEY, AI_MODEL.
 */
export class OpenAICompatibleLLMProvider implements LLMProvider {
  readonly name: TextProviderName;
  private client: OpenAI | null = null;
  private readonly apiKey: string;
  private readonly baseURL: string;
  private readonly model: string;

  constructor(config: OpenAICompatibleProviderConfig) {
    this.name = config.name;
    this.apiKey = config.apiKey;
    this.baseURL = config.baseURL;
    this.model = config.model;
  }

  async chatComplete(system: string, user: string, opts?: { temperature?: number }): Promise<string> {
    this.client ??= new OpenAI({
      // Local OpenAI-compatible servers often do not require auth, but the SDK requires a non-empty value.
      apiKey: this.apiKey || "not-required",
      baseURL: this.baseURL,
    });
    const res = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: opts?.temperature,
    });
    return res.choices[0]?.message?.content ?? "";
  }
}
