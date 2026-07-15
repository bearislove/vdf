export interface SSEEvent {
  type: string;
  message?: string;
  path?: string;
  step?: number;
  total?: number;
}

export async function consumeSSE(
  response: Response,
  onEvent: (event: SSEEvent) => void | Promise<void>
): Promise<void> {
  if (!response.body) throw new Error("Response body is empty");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const consumeLine = async (line: string) => {
    if (!line.startsWith("data: ")) return;
    try {
      await onEvent(JSON.parse(line.slice(6)) as SSEEvent);
    } catch (error) {
      if (!(error instanceof SyntaxError)) throw error;
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) await consumeLine(line);
    if (done) break;
  }

  if (buffer) await consumeLine(buffer);
}
