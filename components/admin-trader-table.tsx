"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Trader = {
  id: string;
  name: string;
  email: string;
  role: string;
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

function Toggle({
  enabled,
  loading,
  onClick,
}: {
  enabled: boolean;
  loading?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={loading}
      onClick={onClick}
      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
        enabled ? "bg-accent" : "bg-slate-300"
      }`}
    >
      <span
        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm transition-transform ${
          enabled ? "translate-x-[18px]" : "translate-x-[2px]"
        }`}
      />
    </button>
  );
}

export function AdminTraderTable({ traders }: { traders: Trader[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function callApi(
    userId: string,
    path: string,
    method: "POST" | "DELETE" | "PATCH",
    label: string,
    body?: object,
  ) {
    setBusy((b) => ({ ...b, [userId]: label }));
    setErrors((e) => ({ ...e, [userId]: "" }));

    const res = await fetch(path, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json();

    if (!res.ok) {
      setErrors((e) => ({ ...e, [userId]: data.error || `Failed to ${label}.` }));
    } else {
      router.refresh();
    }

    setBusy((b) => {
      const next = { ...b };
      delete next[userId];
      return next;
    });
  }

  if (traders.length === 0) {
    return <p className="py-12 text-center text-slate-400 italic">No traders registered yet.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-[13px]">
        <thead>
          <tr className="bg-ink text-white text-[11px] uppercase tracking-wider">
            <th className="px-5 py-3 text-left">Trader</th>
            <th className="px-5 py-3 text-left">Email</th>
            <th className="px-5 py-3 text-left">Verified</th>
            <th className="px-5 py-3 text-left">Status</th>
            <th className="px-5 py-3 text-left">Super Trader</th>
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
                <td className="px-5 py-4 text-slate-600 max-w-[200px] truncate">{trader.email}</td>
                <td className="px-5 py-4">
                  <div className="flex items-center gap-2">
                    <Toggle
                      enabled={!!trader.emailVerifiedAt}
                      loading={busy[trader.id] === "email"}
                      onClick={() =>
                        callApi(
                          trader.id,
                          `/api/admin/users/${trader.id}/email-verify`,
                          "POST",
                          "email",
                        )
                      }
                    />
                    <span
                      className={`text-xs font-medium ${
                        trader.emailVerifiedAt ? "text-emerald-600" : "text-amber-600"
                      }`}
                    >
                      {trader.emailVerifiedAt ? "Verified" : "Unverified"}
                    </span>
                  </div>
                </td>
                <td className="px-5 py-4">
                  <span
                    className={`inline-block rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-wider ${statusBadge[trader.approvalStatus] ?? "bg-slate-100 text-slate-600 border-slate-200"}`}
                  >
                    {trader.approvalStatus}
                  </span>
                </td>
                <td className="px-5 py-4">
                  <div className="flex items-center gap-2">
                    <Toggle
                      enabled={trader.role === "SUPER_TRADER"}
                      loading={busy[trader.id] === "role"}
                      onClick={() =>
                        callApi(trader.id, `/api/admin/users/${trader.id}/role`, "PATCH", "role", {
                          role: trader.role === "SUPER_TRADER" ? "TRADER" : "SUPER_TRADER",
                        })
                      }
                    />
                    <span
                      className={`text-xs font-medium ${
                        trader.role === "SUPER_TRADER" ? "text-violet-600" : "text-slate-500"
                      }`}
                    >
                      {trader.role === "SUPER_TRADER" ? "Enabled" : "Disabled"}
                    </span>
                  </div>
                </td>
                <td className="px-5 py-4">
                  <div className="flex items-center gap-2">
                    {trader.approvalStatus === "PENDING" && (
                      <>
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() =>
                            callApi(trader.id, `/api/admin/users/${trader.id}/approve`, "POST", "approve")
                          }
                          className="rounded-full bg-accent px-3 py-1 text-[11px] font-medium text-white hover:bg-accentDeep disabled:opacity-50"
                        >
                          {busy[trader.id] === "approve" ? "..." : "Approve"}
                        </button>
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() =>
                            callApi(trader.id, `/api/admin/users/${trader.id}/reject`, "POST", "reject")
                          }
                          className="rounded-full bg-amber-500 px-3 py-1 text-[11px] font-medium text-white hover:bg-amber-600 disabled:opacity-50"
                        >
                          {busy[trader.id] === "reject" ? "..." : "Reject"}
                        </button>
                      </>
                    )}
                    {trader.approvalStatus === "APPROVED" && (
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() =>
                          callApi(trader.id, `/api/admin/users/${trader.id}/reject`, "POST", "reject")
                        }
                        className="rounded-full bg-amber-500 px-3 py-1 text-[11px] font-medium text-white hover:bg-amber-600 disabled:opacity-50"
                      >
                        {busy[trader.id] === "reject" ? "..." : "Revoke"}
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => {
                        if (!confirm(`Reset password for "${trader.name}" to "Trader@123"?`)) return;
                        callApi(trader.id, `/api/admin/users/${trader.id}/reset-password`, "POST", "reset");
                      }}
                      className="rounded-full border border-slate-300 bg-white px-3 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                    >
                      {busy[trader.id] === "reset" ? "..." : "Reset Pwd"}
                    </button>
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => {
                        if (!confirm(`Delete trader "${trader.name}"? This cannot be undone.`)) return;
                        callApi(trader.id, `/api/admin/users/${trader.id}`, "DELETE", "delete");
                      }}
                      className="rounded-full border border-red-200 bg-white px-3 py-1 text-[11px] font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                    >
                      {busy[trader.id] === "delete" ? "..." : "Delete"}
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
