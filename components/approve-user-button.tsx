"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ApproveUserButton({ userId }: { userId: string }) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        disabled={isSubmitting}
        onClick={async () => {
          setIsSubmitting(true);
          setError("");

          const response = await fetch(`/api/admin/users/${userId}/approve`, {
            method: "POST",
          });
          const result = await response.json();

          if (!response.ok) {
            setError(result.error || "Unable to approve trader.");
            setIsSubmitting(false);
            return;
          }

          router.refresh();
        }}
        className="inline-flex items-center justify-center rounded-full bg-[#a7770e] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#8e6500] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isSubmitting ? "Approving..." : "Approve trader"}
      </button>
      {error ? <p className="text-xs text-loss">{error}</p> : null}
    </div>
  );
}
