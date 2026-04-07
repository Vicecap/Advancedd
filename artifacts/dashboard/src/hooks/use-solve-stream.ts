import { useState, useCallback, useRef } from "react";

interface StreamState {
  paragraphs: string[];
  answer: string | null;
  isStreaming: boolean;
  error: string | null;
}

async function* readSSE(response: Response): AsyncGenerator<Record<string, unknown>> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";

    for (const part of parts) {
      for (const line of part.split("\n")) {
        if (line.startsWith("data: ")) {
          try {
            yield JSON.parse(line.slice(6)) as Record<string, unknown>;
          } catch {
            // skip malformed lines
          }
        }
      }
    }
  }
}

export function useSolveStream() {
  const [state, setState] = useState<StreamState>({
    paragraphs: [],
    answer: null,
    isStreaming: false,
    error: null,
  });

  const abortRef = useRef<AbortController | null>(null);

  const startStream = useCallback(async (question: string, ai: string, topic: string, personality?: string, apiBase = "/api") => {
    setState({ paragraphs: [], answer: null, isStreaming: true, error: null });

    if (abortRef.current) abortRef.current.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      const url = `${apiBase}/solve-stream?question=${encodeURIComponent(question)}&ai=${encodeURIComponent(ai)}&topic=${encodeURIComponent(topic)}&personality=${encodeURIComponent(personality ?? "")}`;
      const response = await fetch(url, {
        credentials: "include",
        signal: ctrl.signal,
        headers: { Accept: "text/event-stream" },
      });

      if (!response.ok || !response.body) {
        setState(prev => ({ ...prev, error: "Failed to connect to solver", isStreaming: false }));
        return;
      }

      for await (const data of readSSE(response)) {
        if (ctrl.signal.aborted) break;

        if (data.error) {
          setState(prev => ({ ...prev, error: String(data.error), isStreaming: false }));
          return;
        }

        if (data.paragraph) {
          setState(prev => ({
            ...prev,
            paragraphs: [...prev.paragraphs, String(data.paragraph)],
          }));
        }

        if (data.done) {
          setState(prev => ({
            ...prev,
            answer: data.answer != null ? String(data.answer) : prev.answer,
            isStreaming: false,
          }));
          return;
        }
      }

      setState(prev => ({ ...prev, isStreaming: false }));
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setState(prev => ({ ...prev, error: "Stream connection lost", isStreaming: false }));
    }
  }, []);

  const stopStream = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      setState(prev => ({ ...prev, isStreaming: false }));
    }
  }, []);

  return { ...state, startStream, stopStream };
}
