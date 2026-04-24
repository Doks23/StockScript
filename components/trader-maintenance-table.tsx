"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Trader = {
  id: string;
  name: string;
  email: string;
  approvalStatus: string;
  isActive: boolean;
  emailVerifiedAt: Date | null;
  createdAt: Date;
};

const statusBadge: Record<string, string> = {
  APPROVED: "bg-emerald-100 text-emerald-700 border-emerald-200",
  REJECTED: "bg-red-100 text-red-700 border-red-200",
  PENDING: "bg-amber-100 text-amber-700 border-amber-200",
};

export function TraderMaintenanceTable({ traders }: { traders: Trader[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function callApi(
    userId: string,
    path: string,
    method: "POST" | "DELETE",
    label: string,
  ) {
    setBusy((b) => ({ ...b, [userId]: label }));
    setErrors((e) => ({ ...e, [userId]: "" }));

    const res = await fetch(path, { method });
    const data = await res.json();

    if (!res.ok) {
      setErrors((e) => ({ ...e, [userId]: data.error || `Unable to ${label}.` }));
    } else {
      router.refresh();
    }

    setBusy((b) => {
      const next = { ...b };
      delete next[userId];
      return next;
    });
  }

  function approve(id: string) {
    callApi(id, `/api/admin/users/${id}/approve`, "POST", "approve");
  }
  function reject(id: string) {
    callApi(id, `/api/admin/users/${id}/reject`, "POST", "reject");
  }
  function remove(id: string, name: string) {
    if (!confirm(`Delete trader "${name}"? This cannot be undone.`)) return;
    callApi(id, `/api/admin/users/${id}`, "DELETE", "delete");
  }

  if (traders.length === 0) {
    return (
      <p className="py-12 text-center text-slate-400 italic">No traders registered yet.</p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-[13px]">
        <thead>
          <tr className="bg-accent text-white text-[11px] uppercase tracking-wider">
            <th className="px-5 py-3 text-left">Trader</th>
            <th className="px-5 py-3 text-left">Email</th>
            <th className="px-5 py-3 text-left">Email Verified</th>
            <th className="px-5 py-3 text-left">Status</th>
            <th className="px-5 py-3 text-left">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {traders.map((trader) => {
            const isBusy = !!busy[trader.id];
            const err = errors[trader.id];
            return (
              <tr key={trader.id} className="hover:bg-slate-50 transition-colors">
                <td className="px-5 py-4 font-semibold text-slate-800">{trader.name}</td>
                <td className="px-5 py-4 text-slate-600">{trader.email}</td>
                <td className="px-5 py-4 text-slate-600">
                  {trader.emailVerifiedAt ? (
                    <span className="text-emerald-600">Verified</span>
                  ) : (
                    <span className="text-amber-600">Pending</span>
                  )}
                </td>
                <td className="px-5 py-4">
                  <span
                    className={`inline-block rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-wider ${statusBadge[trader.approvalStatus] ?? "bg-slate-100 text-slate-600 border-slate-200"}`}
                  >
                    {trader.approvalStatus}
                  </span>
                </td>
                <td className="px-5 py-4">
                  <div className="flex flex-wrap items-center gap-2">
                    {trader.approvalStatus !== "APPROVED" && (
                      <button
                        type="button"
                        disabled={isBusy || !trader.emailVerifiedAt}
                        title={!trader.emailVerifiedAt ? "Email not verified" : undefined}
                        onClick={() => approve(trader.id)}
                        className="rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {busy[trader.id] === "approve" ? "Approving…" : "Approve"}
                      </button>
                    )}
                    {trader.approvalStatus !== "REJECTED" && (
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => reject(trader.id)}
                        className="rounded-full bg-amber-500 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {busy[trader.id] === "reject" ? "Rejecting…" : "Reject"}
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => remove(trader.id, trader.name)}
                      className="rounded-full bg-red-500 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {busy[trader.id] === "delete" ? "Deleting…" : "Delete"}
                    </button>
                  </div>
                  {err && <p className="mt-1 text-xs text-red-600">{err}</p>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
