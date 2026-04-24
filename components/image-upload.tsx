"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

export function ImageUpload({ tradeId }: { tradeId: string }) {
  const router = useRouter();
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const previews = useMemo(
    () =>
      files.map((file) => ({
        name: file.name,
        url: URL.createObjectURL(file),
      })),
    [files],
  );

  useEffect(() => {
    return () => {
      previews.forEach((preview) => URL.revokeObjectURL(preview.url));
    };
  }, [previews]);

  async function handleUpload() {
    if (!files.length) {
      setError("Choose at least one chart image.");
      return;
    }

    setError("");
    setIsSubmitting(true);

    const formData = new FormData();
    formData.append("tradeId", tradeId);
    files.forEach((file) => formData.append("files", file));

    const response = await fetch("/api/upload-image", {
      method: "POST",
      body: formData,
    });
    const result = await response.json();

    if (!response.ok) {
      setError(result.error || "Upload failed.");
      setIsSubmitting(false);
      return;
    }

    setFiles([]);
    router.refresh();
  }

  return (
    <div className="rounded-[24px] border border-slate-200 bg-white p-4">
      <div className="flex flex-col gap-3">
        <label className="form-field">
          Upload chart screenshots
          <input
            type="file"
            accept="image/*"
            multiple
            onChange={(event) => {
              setFiles(Array.from(event.target.files || []));
            }}
            className="form-input file:mr-3 file:rounded-full file:border-0 file:bg-ink file:px-3 file:py-2 file:text-sm file:font-medium file:text-white"
          />
        </label>

        {previews.length ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {previews.map((preview) => (
              <div
                key={preview.url}
                className="overflow-hidden rounded-2xl border border-slate-200 bg-canvas"
              >
                <div className="relative aspect-[4/3]">
                  <Image
                    src={preview.url}
                    alt={preview.name}
                    fill
                    unoptimized
                    className="object-cover"
                  />
                </div>
                <p className="truncate px-3 py-2 text-sm text-slate-600">{preview.name}</p>
              </div>
            ))}
          </div>
        ) : null}

        {error ? <p className="text-sm text-loss">{error}</p> : null}

        <button
          type="button"
          onClick={handleUpload}
          disabled={isSubmitting || !files.length}
          className="inline-flex items-center justify-center rounded-2xl bg-ink px-4 py-3 text-sm font-medium text-white transition hover:bg-accentDeep disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmitting ? "Uploading..." : "Attach images"}
        </button>
      </div>
    </div>
  );
}
