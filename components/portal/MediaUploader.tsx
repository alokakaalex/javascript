"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { formatBytes } from "@/lib/expansion/format";
import { buttonClass } from "./ui";

interface Job {
  key: string;
  name: string;
  size: number;
  progress: number;
  error?: string;
  done?: boolean;
}

const ACCEPT = "image/jpeg,image/png,image/webp,image/gif,image/avif,video/mp4,video/quicktime,video/webm";

// Uploads each file with its own request so large videos show progress and
// one failure doesn't lose the rest.
function upload(propertyId: number, file: File, onProgress: (pct: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/properties/${propertyId}/media`);
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    xhr.setRequestHeader("X-File-Name", encodeURIComponent(file.name));
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolve();
      let message = `Upload failed (${xhr.status}).`;
      try {
        message = JSON.parse(xhr.responseText).error ?? message;
      } catch {
        // Non-JSON error body.
      }
      reject(new Error(message));
    };
    xhr.onerror = () => reject(new Error("Network error — check your connection and try again."));
    xhr.send(file);
  });
}

export default function MediaUploader({ propertyId }: { propertyId: number }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [dragging, setDragging] = useState(false);
  const busy = jobs.some((j) => !j.done && !j.error);

  const update = (key: string, patch: Partial<Job>) =>
    setJobs((prev) => prev.map((j) => (j.key === key ? { ...j, ...patch } : j)));

  async function start(files: FileList | File[]) {
    const list = Array.from(files);
    if (list.length === 0) return;
    const batch = list.map((f, i) => ({ key: `${Date.now()}-${i}-${f.name}`, name: f.name, size: f.size, progress: 0 }));
    setJobs((prev) => [...prev.filter((j) => !j.done), ...batch]);
    for (let i = 0; i < list.length; i++) {
      const job = batch[i];
      try {
        await upload(propertyId, list[i], (progress) => update(job.key, { progress }));
        update(job.key, { done: true, progress: 100 });
        router.refresh();
      } catch (error) {
        update(job.key, { error: (error as Error).message });
      }
    }
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div className="space-y-3">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          start(e.dataTransfer.files);
        }}
        className={`flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-6 py-8 text-center text-sm ${
          dragging ? "border-sky-400 bg-sky-50 dark:bg-sky-950" : "border-zinc-300 dark:border-zinc-700"
        }`}
      >
        <p className="text-zinc-600 dark:text-zinc-400">Drag photos and videos here, or</p>
        <button type="button" className={buttonClass.secondary} onClick={() => inputRef.current?.click()} disabled={busy}>
          Choose files
        </button>
        <p className="text-xs text-zinc-500">JPEG, PNG, WebP, GIF, AVIF · MP4, MOV, WebM</p>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          multiple
          className="hidden"
          onChange={(e) => e.target.files && start(e.target.files)}
        />
      </div>
      {jobs.length > 0 ? (
        <ul className="space-y-2">
          {jobs.map((j) => (
            <li key={j.key} className="text-sm">
              <div className="flex justify-between gap-3">
                <span className="truncate text-zinc-700 dark:text-zinc-300">{j.name}</span>
                <span className={`shrink-0 text-xs ${j.error ? "text-rose-600" : "text-zinc-500"}`}>
                  {j.error ? "Failed" : j.done ? "Uploaded" : `${j.progress}% of ${formatBytes(j.size)}`}
                </span>
              </div>
              {j.error ? (
                <p className="text-xs text-rose-600 dark:text-rose-400">{j.error}</p>
              ) : (
                <div className="mt-1 h-1.5 overflow-hidden rounded bg-zinc-200 dark:bg-zinc-800">
                  <div
                    className={`h-full ${j.done ? "bg-emerald-500" : "bg-sky-500"} transition-all`}
                    style={{ width: `${j.progress}%` }}
                  />
                </div>
              )}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
