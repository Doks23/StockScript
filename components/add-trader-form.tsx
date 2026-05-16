"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function AddTraderForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);

    const res = await fetch("/api/admin/users/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email }),
    });
    const data = await res.json();

    setBusy(false);

    if (!res.ok) {
      setError(data.error || "Failed to create trader.");
      return;
    }

    setName("");
    setEmail("");
    setOpen(false);
    router.refresh();
  }

  return (
    <div>
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-full bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accentDeep"
        >
          + Add Trader
        </button>
      ) : (
        <form
          onSubmit={handleSubmit}
          className="flex flex-wrap items-end gap-3 rounded-2xl border border-line bg-canvas p-4"
        >
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="form-input w-48"
              placeholder="Full name"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Email</label>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              required
              className="form-input w-56"
              placeholder="email@example.com"
            />
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={busy}
              className="rounded-full bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accentDeep disabled:opacity-50"
            >
              {busy ? "Creating..." : "Create"}
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setError("");
              }}
              className="rounded-full border border-line bg-white px-4 py-2 text-sm font-medium text-slate-600 hover:bg-canvas"
            >
              Cancel
            </button>
          </div>
          {error && <p className="w-full text-xs text-red-600">{error}</p>}
        </form>
      )}
    </div>
  );
}
