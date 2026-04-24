"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

function toDateTimeValue(date: Date) {
  const timezoneOffset = date.getTimezoneOffset();
  return new Date(date.getTime() - timezoneOffset * 60 * 1000)
    .toISOString()
    .slice(0, 16);
}

export function CompetitionForm() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(formData: FormData) {
    setError("");
    setIsSubmitting(true);

    const payload = {
      name: String(formData.get("name") || ""),
      startDate: String(formData.get("startDate") || ""),
      endDate: String(formData.get("endDate") || ""),
      visibility: "PUBLIC",
    };

    const response = await fetch("/api/competitions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const result = await response.json();

    if (!response.ok) {
      setError(result.error || "Unable to create competition.");
      setIsSubmitting(false);
      return;
    }

    router.push(`/leaderboard?competitionId=${result.competition.id}`);
    router.refresh();
  }

  return (
    <form
      action={handleSubmit}
      className="grid gap-5 rounded-[32px] border border-white/70 bg-white/80 p-6 shadow-soft backdrop-blur lg:grid-cols-2"
    >
      <label className="form-field lg:col-span-2">
        Competition Name
        <input
          name="name"
          required
          defaultValue="May Momentum Cup"
          className="form-input"
        />
      </label>

      <label className="form-field">
        Start Date
        <input
          name="startDate"
          type="datetime-local"
          required
          defaultValue={toDateTimeValue(new Date())}
          className="form-input"
        />
      </label>

      <label className="form-field">
        End Date
        <input
          name="endDate"
          type="datetime-local"
          required
          defaultValue={toDateTimeValue(
            new Date(Date.now() + 1000 * 60 * 60 * 24 * 14),
          )}
          className="form-input"
        />
      </label>

      <div className="lg:col-span-2 flex flex-col gap-3">
        {error ? (
          <p className="rounded-2xl border border-loss/30 bg-loss/10 px-4 py-3 text-sm text-loss">
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={isSubmitting}
          className="inline-flex items-center justify-center rounded-2xl bg-accent px-4 py-3 font-medium text-white transition hover:-translate-y-0.5 hover:bg-accentDeep disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmitting ? "Creating competition..." : "Create competition"}
        </button>
      </div>
    </form>
  );
}
