"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { segmentOptions, tradeTypeOptions } from "@/lib/constants";
import { Plus, Trash2 } from "lucide-react";

type TxRow = { price: string; quantity: string; dateTime: string };

type TradeFormProps = {
  competitions: { id: string; name: string }[];
  initialData?: any;
};

function toLocalDT(val?: string | null, offsetMinutes = 0) {
  const date = val
    ? new Date(val)
    : new Date(Date.now() + offsetMinutes * 60 * 1000);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60 * 1000);
  return local.toISOString().slice(0, 16);
}

function buildInitialTxRows(
  txns: any[],
  tradeType: string,
  side: "entry" | "exit",
): TxRow[] {
  if (!txns || txns.length === 0)
    return [
      {
        price: "",
        quantity: "",
        dateTime: side === "entry" ? toLocalDT(null, -45) : "",
      },
    ];
  const entryType = tradeType === "LONG" ? "BUY" : "SELL";
  const sideType =
    side === "entry" ? entryType : entryType === "BUY" ? "SELL" : "BUY";
  const filtered = txns.filter((t: any) => t.type === sideType);
  if (filtered.length === 0)
    return [
      {
        price: "",
        quantity: "",
        dateTime: side === "entry" ? toLocalDT(null, -45) : "",
      },
    ];
  return filtered.map((t: any) => ({
    price: String(t.price),
    quantity: String(t.quantity),
    dateTime: toLocalDT(t.dateTime),
  }));
}

export function TradeForm({ competitions, initialData }: TradeFormProps) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [status, setStatus] = useState<"OPEN" | "CLOSED">(
    initialData?.status || "OPEN",
  );
  const [tradeType, setTradeType] = useState<string>(
    initialData?.tradeType || "LONG",
  );

  const [entryRows, setEntryRows] = useState<TxRow[]>(() =>
    buildInitialTxRows(
      initialData?.transactions ?? [],
      initialData?.tradeType ?? "LONG",
      "entry",
    ),
  );
  const [exitRows, setExitRows] = useState<TxRow[]>(() =>
    buildInitialTxRows(
      initialData?.transactions ?? [],
      initialData?.tradeType ?? "LONG",
      "exit",
    ),
  );

  function addEntryRow() {
    setEntryRows((r) => [...r, { price: "", quantity: "", dateTime: "" }]);
  }
  function removeEntryRow(i: number) {
    setEntryRows((r) => r.filter((_, idx) => idx !== i));
  }
  function updateEntryRow(i: number, field: keyof TxRow, value: string) {
    setEntryRows((r) =>
      r.map((row, idx) => (idx === i ? { ...row, [field]: value } : row)),
    );
  }

  function addExitRow() {
    setExitRows((r) => [...r, { price: "", quantity: "", dateTime: "" }]);
  }
  function removeExitRow(i: number) {
    setExitRows((r) => r.filter((_, idx) => idx !== i));
  }
  function updateExitRow(i: number, field: keyof TxRow, value: string) {
    setExitRows((r) =>
      r.map((row, idx) => (idx === i ? { ...row, [field]: value } : row)),
    );
  }

  async function handleSubmit(formData: FormData) {
    setError("");
    setIsSubmitting(true);

    const entryType = tradeType === "LONG" ? "BUY" : "SELL";
    const exitType = tradeType === "LONG" ? "SELL" : "BUY";

    const transactions: any[] = [];

    for (const row of entryRows) {
      if (!row.price || !row.quantity || !row.dateTime) continue;
      transactions.push({
        type: entryType,
        price: Number(row.price),
        quantity: Number(row.quantity),
        dateTime: new Date(row.dateTime).toISOString(),
      });
    }

    for (const row of exitRows) {
      if (!row.price || !row.quantity || !row.dateTime) continue;
      transactions.push({
        type: exitType,
        price: Number(row.price),
        quantity: Number(row.quantity),
        dateTime: new Date(row.dateTime).toISOString(),
      });
    }

    if (transactions.length === 0) {
      setError("At least one transaction is required.");
      setIsSubmitting(false);
      return;
    }

    const payload = {
      symbol: String(formData.get("symbol") || ""),
      segment: String(formData.get("segment") || "EQUITY"),
      tradeType,
      status: String(formData.get("status") || "OPEN"),
      tags: String(formData.get("tags") || ""),
      notes: String(formData.get("notes") || ""),
      stopLoss: formData.get("stopLoss")
        ? Number(formData.get("stopLoss"))
        : null,
      charges: Number(formData.get("charges") || 0),
      closingPrice: formData.get("closingPrice")
        ? Number(formData.get("closingPrice"))
        : null,
      transactions,
    };

    const url = initialData?.id
      ? `/api/trades/${initialData.id}`
      : "/api/trades";
    const method = initialData?.id ? "PUT" : "POST";

    const response = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const result = await response.json();

    if (!response.ok) {
      setError(result.error || "Unable to save trade.");
      setIsSubmitting(false);
      return;
    }

    router.push(`/trades/${encodeURIComponent(result.trade.symbol)}`);
    router.refresh();
  }

  return (
    <form
      action={handleSubmit}
      className="flex flex-col gap-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
    >
      {/* Header row */}
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 pb-4">
        <input
          name="symbol"
          placeholder="SYMBOL"
          required
          defaultValue={initialData?.symbol || ""}
          className="form-input uppercase w-[140px] font-bold text-lg"
        />
        <select
          name="status"
          value={status}
          onChange={(e) => setStatus(e.target.value as "OPEN" | "CLOSED")}
          className="form-input w-[110px] bg-slate-50"
        >
          <option value="OPEN">🟢 OPEN</option>
          <option value="CLOSED">🔴 CLOSED</option>
        </select>
        <select
          name="tradeType"
          value={tradeType}
          onChange={(e) => setTradeType(e.target.value)}
          className="form-input w-[100px] bg-slate-50"
        >
          {tradeTypeOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <select
          name="segment"
          defaultValue={initialData?.segment || "EQUITY"}
          className="form-input w-[110px] bg-slate-50"
        >
          {segmentOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        {competitions.length > 0 && (
          <select
            name="competitionId"
            defaultValue={initialData?.competitionId || ""}
            className="form-input w-[160px] bg-slate-50"
          >
            <option value="">No Competition</option>
            {competitions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        )}
        <input
          name="tags"
          placeholder="Tags (e.g. breakout)"
          defaultValue={initialData?.tags || ""}
          className="form-input flex-1 min-w-[120px]"
        />
      </div>

      {/* Transactions grid */}
      <div className="grid lg:grid-cols-2 gap-6 bg-slate-50/50 rounded-xl p-4 border border-slate-100">
        {/* ENTRY transactions */}
        <div className="space-y-2">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-bold text-emerald-600 tracking-wider">
              ENTRY {tradeType === "LONG" ? "(BUY)" : "(SELL)"}
            </span>
            <button
              type="button"
              onClick={addEntryRow}
              className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[10px] font-semibold text-emerald-700 hover:bg-emerald-100 transition"
            >
              <Plus className="h-3 w-3" /> Add
            </button>
          </div>
          <div className="grid grid-cols-[3fr_2fr_2fr_auto] gap-2 text-[10px] text-slate-400 px-1">
            <span>Date & Time</span>
            <span>Price</span>
            <span>Qty</span>
            <span></span>
          </div>
          {entryRows.map((row, i) => (
            <div
              key={i}
              className="grid grid-cols-[3fr_2fr_2fr_auto] gap-2 items-center"
            >
              <input
                type="datetime-local"
                value={row.dateTime}
                onChange={(e) => updateEntryRow(i, "dateTime", e.target.value)}
                required={i === 0}
                className="form-input text-xs h-9"
              />
              <input
                type="number"
                step="0.01"
                min="0"
                placeholder="Price"
                value={row.price}
                onChange={(e) => updateEntryRow(i, "price", e.target.value)}
                required={i === 0}
                className="form-input text-sm h-9"
              />
              <input
                type="number"
                step="0.01"
                min="0"
                placeholder="Qty"
                value={row.quantity}
                onChange={(e) => updateEntryRow(i, "quantity", e.target.value)}
                required={i === 0}
                className="form-input text-sm h-9"
              />
              <button
                type="button"
                onClick={() => removeEntryRow(i)}
                className="text-slate-300 hover:text-red-400 transition"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>

        {/* EXIT transactions */}
        <div className="space-y-2">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-bold text-amber-600 tracking-wider">
              EXIT {tradeType === "LONG" ? "(SELL)" : "(BUY)"}
            </span>
            <button
              type="button"
              onClick={addExitRow}
              className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-[10px] font-semibold text-amber-700 hover:bg-amber-100 transition"
            >
              <Plus className="h-3 w-3" /> Add
            </button>
          </div>
          <div className="grid grid-cols-[3fr_2fr_2fr_auto] gap-2 text-[10px] text-slate-400 px-1">
            <span>Date & Time</span>
            <span>Price</span>
            <span>Qty</span>
            <span></span>
          </div>
          {exitRows.map((row, i) => (
            <div
              key={i}
              className="grid grid-cols-[3fr_2fr_2fr_auto] gap-2 items-center"
            >
              <input
                type="datetime-local"
                value={row.dateTime}
                onChange={(e) => updateExitRow(i, "dateTime", e.target.value)}
                required={status === "CLOSED" && i === 0}
                className="form-input text-xs h-9"
              />
              <input
                type="number"
                step="0.01"
                min="0"
                placeholder="Price"
                value={row.price}
                onChange={(e) => updateExitRow(i, "price", e.target.value)}
                required={status === "CLOSED" && i === 0}
                className="form-input text-sm h-9"
              />
              <input
                type="number"
                step="0.01"
                min="0"
                placeholder="Qty"
                value={row.quantity}
                onChange={(e) => updateExitRow(i, "quantity", e.target.value)}
                required={status === "CLOSED" && i === 0}
                className="form-input text-sm h-9"
              />
              <button
                type="button"
                onClick={() => removeExitRow(i)}
                className="text-slate-300 hover:text-red-400 transition"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Auxiliary fields */}
      <div className="flex flex-wrap gap-4 items-center">
        <label className="flex items-center gap-2 text-sm text-slate-500 whitespace-nowrap">
          Stop Loss
          <input
            name="stopLoss"
            type="number"
            step="0.01"
            min="0"
            defaultValue={initialData?.stopLoss ?? ""}
            className="form-input w-[100px] h-9"
          />
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-500 whitespace-nowrap">
          Charges
          <input
            name="charges"
            type="number"
            step="0.01"
            min="0"
            defaultValue={initialData?.charges ?? "0"}
            className="form-input w-[100px] h-9"
          />
        </label>
        <label
          className="flex items-center gap-2 text-sm text-slate-500 whitespace-nowrap"
          title="End of day Mark to Market"
        >
          EOD Closing Price
          <input
            name="closingPrice"
            type="number"
            step="0.01"
            min="0"
            defaultValue={initialData?.closingPrice ?? ""}
            className="form-input w-[100px] h-9"
          />
        </label>
      </div>

      <textarea
        name="notes"
        rows={2}
        placeholder="Setup rationale, reflection notes..."
        defaultValue={initialData?.notes || ""}
        className="form-input resize-y text-sm"
      />

      <div className="flex items-center justify-between mt-2 pt-4 border-t border-slate-100">
        {error ? (
          <p className="text-sm text-red-500 font-medium">{error}</p>
        ) : (
          <div />
        )}
        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded-xl bg-slate-900 px-8 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-60"
        >
          {isSubmitting
            ? "Saving..."
            : initialData
              ? "Save changes"
              : "Log Trade"}
        </button>
      </div>
    </form>
  );
}
