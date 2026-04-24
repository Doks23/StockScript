"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { UserPlus } from "lucide-react";

export function AddParticipantForm({ competitionId }: { competitionId: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`/api/competitions/${competitionId}/participants`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to add participant.");
      } else {
        setSuccess(`${data.traderName} added successfully.`);
        setEmail("");
        router.refresh();
      }
    } catch {
      setError("Network error.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-4 flex flex-wrap items-center gap-2">
      <input
        type="email"
        value={email}
        onChange={(e) => { setEmail(e.target.value); setError(null); setSuccess(null); }}
        placeholder="Trader email address…"
        className="flex-1 min-w-[200px] rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-400"
        required
      />
      <button
        type="submit"
        disabled={loading}
        className="inline-flex items-center gap-2 rounded-full bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 transition disabled:opacity-50"
      >
        <UserPlus className="h-3.5 w-3.5" />
        {loading ? "Adding…" : "Add to Competition"}
      </button>
      {error && <p className="w-full text-xs text-red-500 mt-0.5">{error}</p>}
      {success && <p className="w-full text-xs text-emerald-600 mt-0.5">{success}</p>}
    </form>
  );
}
