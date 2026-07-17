import OpenAI from "openai";
import { getNextAgnesCredential } from "@/lib/providers/agnes-credentials";
import type { LLMProvider } from "@/lib/providers/types";

export class AgnesLLMProvider implements LLMProvider {
  readonly name = "agnes" as const;
  private readonly baseURL: string;
  private readonly model: string;

  constructor(config: { baseURL: string; model: string }) {
    this.baseURL = config.baseURL;
    this.model = config.model;
  }

  async chatComplete(system: string, user: string, opts?: { temperature?: number }): Promise<string> {
    const credential = getNextAgnesCredential("text");
    const client = new OpenAI({
      apiKey: credential.apiKey,
      baseURL: this.baseURL,
    });
    const res = await client.chat.completions.create({
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
