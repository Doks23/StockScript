"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, XCircle, Trash2 } from "lucide-react";
import { updateRequestStatus, deleteJoinRequest } from "@/lib/actions";

type RequestItem = {
  id: string;
  userId: string;
  competitionId: string;
  status: string;
  createdAt: Date;
  user: { id: string; name: string; email: string };
  competition: { id: string; name: string };
};

export function CompetitionRequestList({ requests }: { requests: RequestItem[] }) {
  const [isPending, startTransition] = useTransition();
  const [processingId, setProcessingId] = useState<string | null>(null);

  const handleUpdate = (requestId: string, status: "APPROVED" | "REJECTED") => {
    setProcessingId(requestId);
    const formData = new FormData();
    formData.append("requestId", requestId);
    formData.append("status", status);
    startTransition(async () => {
      await updateRequestStatus(formData);
      setProcessingId(null);
    });
  };

  const handleDelete = (requestId: string) => {
    setProcessingId(requestId);
    const formData = new FormData();
    formData.append("requestId", requestId);
    startTransition(async () => {
      await deleteJoinRequest(formData);
      setProcessingId(null);
    });
  };

  return (
    <section className="rounded-[32px] border border-amber-200 bg-amber-50 p-6 shadow-soft">
      <h2 className="font-display text-2xl font-semibold text-ink mb-4">Pending Requests</h2>
      <div className="space-y-3">
        {requests.map((request) => {
          const busy = isPending && processingId === request.id;
          return (
            <div
              key={request.id}
              className="flex items-center justify-between rounded-[24px] border border-amber-100 bg-white px-4 py-3"
            >
              <div className="flex-1">
                <p className="font-medium text-ink">{request.user.name}</p>
                <p className="text-sm text-slate-500">{request.user.email}</p>
                <p className="text-xs text-slate-400 mt-1">
                  Requesting: {request.competition.name}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => handleUpdate(request.id, "APPROVED")}
                  disabled={busy}
                  className="inline-flex items-center gap-1 rounded-full bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 transition disabled:opacity-50"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  Approve
                </button>
                <button
                  onClick={() => handleUpdate(request.id, "REJECTED")}
                  disabled={busy}
                  className="inline-flex items-center gap-1 rounded-full bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700 transition disabled:opacity-50"
                >
                  <XCircle className="h-4 w-4" />
                  Reject
                </button>
                <button
                  onClick={() => handleDelete(request.id)}
                  disabled={busy}
                  title="Delete request"
                  className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:border-red-300 hover:text-red-600 transition disabled:opacity-50"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
