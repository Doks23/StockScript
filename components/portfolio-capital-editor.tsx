"use client";

import { useState } from "react";
import { formatCurrency } from "@/lib/format";
import { useRouter } from "next/navigation";

export function PortfolioCapitalEditor({ initialCapital }: { initialCapital: number }) {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [capital, setCapital] = useState(initialCapital.toString());
  const [loading, setLoading] = useState(false);

  async function handleSave() {
    setLoading(true);
    const parsed = parseFloat(capital);
    if (!isNaN(parsed) && parsed > 0) {
      await fetch("/api/user/capital", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ capital: parsed }),
      });
      setIsEditing(false);
      router.refresh();
    }
    setLoading(false);
  }

  if (!isEditing) {
    return (
      <div className="flex items-center justify-between">
        <div>
          <p className="text-slate-500">Portfolio Capital</p>
          <p className="mt-2 text-xl font-display font-semibold text-ink">{formatCurrency(initialCapital)}</p>
        </div>
        <button
          onClick={() => setIsEditing(true)}
          className="rounded-lg bg-slate-100 px-3 py-1 text-sm font-medium text-slate-600 transition hover:bg-slate-200"
        >
          Edit
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-slate-500">Portfolio Capital</p>
      <div className="flex items-center gap-2">
        <input
          type="number"
          min="1"
          step="0.01"
          value={capital}
          onChange={(e) => setCapital(e.target.value)}
          className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-accent"
        />
        <button
          onClick={handleSave}
          disabled={loading}
          className="rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white transition hover:bg-accentDeep"
        >
          Save
        </button>
        <button
          onClick={() => {
            setIsEditing(false);
            setCapital(initialCapital.toString());
          }}
          disabled={loading}
          className="rounded-lg bg-slate-100 px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-200"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
