import { useState, useCallback } from "react";

export interface UploadProgress {
  stage: "idle" | "requesting" | "uploading" | "saving" | "done" | "error";
  percent: number;
  error: string | null;
}

export interface ResourceMeta {
  title: string;
  board: "zimsec" | "cambridge";
  category: "past_papers" | "green_books" | "textbooks";
  subject: string;
  year?: number;
  description?: string;
}

export function useResourceUpload() {
  const [progress, setProgress] = useState<UploadProgress>({
    stage: "idle",
    percent: 0,
    error: null,
  });

  const upload = useCallback(async (file: File, meta: ResourceMeta) => {
    setProgress({ stage: "requesting", percent: 0, error: null });

    try {
      const urlRes = await fetch("/api/v1/documents/upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: file.name,
          size: file.size,
          contentType: file.type || "application/pdf",
        }),
      });

      if (!urlRes.ok) {
        const err = await urlRes.json().catch(() => ({ error: "Failed to get upload URL" }));
        throw new Error(err.error ?? "Upload URL request failed");
      }

      const { uploadURL, objectPath } = await urlRes.json() as { uploadURL: string; objectPath: string };

      setProgress({ stage: "uploading", percent: 10, error: null });

      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", uploadURL);
        xhr.setRequestHeader("Content-Type", file.type || "application/pdf");

        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            const pct = Math.round(10 + (e.loaded / e.total) * 80);
            setProgress({ stage: "uploading", percent: pct, error: null });
          }
        };

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve();
          else reject(new Error(`Upload failed with status ${xhr.status}`));
        };
        xhr.onerror = () => reject(new Error("Network error during upload"));
        xhr.send(file);
      });

      setProgress({ stage: "saving", percent: 92, error: null });

      const saveRes = await fetch("/api/v1/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          ...meta,
          objectPath,
          fileName: file.name,
          fileSize: file.size,
          mimeType: file.type || "application/pdf",
        }),
      });

      if (!saveRes.ok) {
        const err = await saveRes.json().catch(() => ({ error: "Failed to save resource" }));
        throw new Error(err.error ?? "Save failed");
      }

      const { resource } = await saveRes.json() as { resource: { id: number } };
      setProgress({ stage: "done", percent: 100, error: null });
      return resource;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Upload failed";
      setProgress({ stage: "error", percent: 0, error: msg });
      throw err;
    }
  }, []);

  const reset = useCallback(() => {
    setProgress({ stage: "idle", percent: 0, error: null });
  }, []);

  return { upload, progress, reset };
}
