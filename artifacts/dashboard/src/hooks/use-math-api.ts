import { useQuery, useMutation } from "@tanstack/react-query";

export interface ComputeStep {
  step: number;
  label: string;
  expression: string;
}

export interface MathComputeResult {
  expression: string;
  operation: string;
  result: string;
  steps: ComputeStep[];
  isNumeric: boolean;
  numericValue?: number | null;
  historyId?: number | null;
}

export interface AIModel {
  id: string;
  label: string;
  sub?: string;
  recommended?: boolean;
  free?: boolean;
}

export function useAIModels() {
  return useQuery({
    queryKey: ["/api/ais"],
    queryFn: async () => {
      const res = await fetch("/api/ais", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch AI models");
      return res.json() as Promise<{ models: AIModel[] }>;
    },
  });
}

export function useFreeAIModels() {
  return useQuery({
    queryKey: ["/api/ais"],
    queryFn: async () => {
      const res = await fetch("/api/ais", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch free AI models");
      return res.json() as Promise<{ models: AIModel[] }>;
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useDiscuss(endpoint = "/api/discuss") {
  return useMutation({
    mutationFn: async ({ prompt, ai }: { prompt: string; ai: string }) => {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, ai }),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to get response");
      const data = await res.json() as { response?: string; reply?: string; message?: string; text?: string };
      return { response: data.response ?? data.reply ?? data.message ?? data.text ?? "" };
    },
  });
}

export function useMathCompute() {
  return useMutation({
    mutationFn: async ({ expression, operation }: { expression: string; operation?: string }) => {
      const body: Record<string, string> = { expression };
      if (operation) body.operation = operation;
      const res = await fetch("/api/math/compute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Computation failed" }));
        throw new Error(err.error ?? "Computation failed");
      }
      return res.json() as Promise<MathComputeResult>;
    },
  });
}

export function useUploadOCR(endpoint = "/api/upload-image") {
  return useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("image", file);
      const res = await fetch(endpoint, {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to extract text");
      const data = await res.json() as { text?: string; result?: string; content?: string };
      return { text: data.text ?? data.result ?? data.content ?? "" };
    },
  });
}
