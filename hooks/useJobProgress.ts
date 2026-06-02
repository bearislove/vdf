"use client";

import { useEffect, useRef, useState } from "react";
import type { SSEProgressEvent } from "@/types/job";

export function useJobProgress(variantId: string | null, enabled = true) {
  const [event, setEvent] = useState<SSEProgressEvent | null>(null);
  const [done, setDone] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!variantId || !enabled) return;

    const es = new EventSource(`/api/jobs/${variantId}/stream`);
    eventSourceRef.current = es;

    es.onmessage = (e) => {
      try {
        const data: SSEProgressEvent = JSON.parse(e.data);
        setEvent(data);
        if (data.type === "done" || data.type === "error") {
          setDone(true);
          es.close();
        }
      } catch {
        // ignore parse errors
      }
    };

    es.onerror = () => {
      es.close();
    };

    return () => {
      es.close();
    };
  }, [variantId, enabled]);

  return { event, done };
}
