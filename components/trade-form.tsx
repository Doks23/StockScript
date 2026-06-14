"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  exitTriggerOptions,
  growthAreaOptions,
  proficiencyOptions,
  segmentOptions,
  setupOptions,
  tradeTypeOptions,
} from "@/lib/constants";
import { Plus, Trash2 } from "lucide-react";

type TxRow = { price: string; quantity: string; dateTime: string };

type TransactionPayload = {
  type: string;
  price: number;
  quantity: number;
  dateTime: string;
};

type Transaction = {
  type: string;
  price: number;
  quantity: number;
  dateTime: string;
};

export type InitialTradeData = {
  id: string;
  status: string;
  tradeType: string;
  symbol: string;
  segment: string;
  tags: string;
  notes: string;
  stopLoss: number | null;
  charges: number;
  closingPrice: number | null;
  competitionId: string | null;
  setup: string | null;
  planFollowed: boolean | null;
  exitTrigger: string | null;
  proficiency: string | null;
  growthAreas: string | null;
  transactions: Transaction[];
};

type TradeFormProps = {
  competitions: { id: string; name: string }[];
  initialData?: InitialTradeData;
};

function toLocalDT(val?: string | null) {
  const date = val ? new Date(val) : new Date();
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60 * 1000);
  return local.toISOString().slice(0, 16);
}

function buildInitialTxRows(
  txns: Transaction[],
  tradeType: string,
  side: "entry" | "exit",
): TxRow[] {
  if (!txns || txns.length === 0)
    return [
      {
        price: "",
        quantity: "",
        dateTime: side === "entry" ? toLocalDT() : "",
      },
    ];
  const entryType = tradeType === "LONG" ? "BUY" : "SELL";
  const sideType =
    side === "entry" ? entryType : entryType === "BUY" ? "SELL" : "BUY";
  const filtered = txns.filter((t) => t.type === sideType);
  if (filtered.length === 0)
    return [
      {
        price: "",
        quantity: "",
        dateTime: side === "entry" ? toLocalDT() : "",
      },
    ];
  return filtered.map((t) => ({
    price: String(t.price),
    quantity: String(t.quantity),
    dateTime: toLocalDT(t.dateTime),
  }));
}

function getMultiSelectValues(formData: FormData, name: string) {
  return formData
    .getAll(name)
    .map((value) => String(value).trim())
    .filter(Boolean)
    .join(", ");
}

function splitInitialValues(value?: string | null) {
  if (!value) return [];
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function TradeForm({ competitions, initialData }: TradeFormProps) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [status, setStatus] = useState<"OPEN" | "CLOSED">(
    (initialData?.status as "OPEN" | "CLOSED") || "OPEN",
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

    const transactions: TransactionPayload[] = [];

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

    const totalEntryQty = entryRows.reduce(
      (s, r) => s + (Number(r.quantity) || 0),
      0,
    );
    const totalExitQty = exitRows.reduce(
      (s, r) => s + (Number(r.quantity) || 0),
      0,
    );

    if (totalExitQty > totalEntryQty) {
      const label =
        tradeType === "LONG" ? "sell" : "buy";
      setError(
        `Exit qty (${totalExitQty}) exceeds entry qty (${totalEntryQty}). More ${label} than ${tradeType === "LONG" ? "buy" : "sell"}.`,
      );
      setIsSubmitting(false);
      return;
    }

    if (transactions.length === 0) {
      setError("At least one transaction is required.");
      setIsSubmitting(false);
      return;
    }

    const totalEntryAmt = entryRows.reduce(
      (s, r) => s + (Number(r.price) || 0) * (Number(r.quantity) || 0),
      0,
    );
    const totalEntryQ = entryRows.reduce(
      (s, r) => s + (Number(r.quantity) || 0),
      0,
    );
    const avgEntryPrice = totalEntryQ > 0 ? totalEntryAmt / totalEntryQ : 0;

    let stopLoss: number | null = null;
    const rawSl = String(formData.get("stopLoss") || "");
    if (rawSl.endsWith("%")) {
      const pct = parseFloat(rawSl);
      if (!isNaN(pct) && avgEntryPrice > 0) {
        stopLoss = avgEntryPrice + (avgEntryPrice * pct) / 100;
      }
    } else if (rawSl !== "") {
      const num = parseFloat(rawSl);
      if (!isNaN(num)) stopLoss = num;
    }

    const planFollowedValue = String(formData.get("planFollowed") || "");
    const payload = {
      symbol: String(formData.get("symbol") || ""),
      segment: String(formData.get("segment") || "EQUITY"),
      tradeType,
      status: String(formData.get("status") || "OPEN"),
      tags: String(formData.get("tags") || ""),
      notes: String(formData.get("notes") || ""),
      setup: getMultiSelectValues(formData, "setup"),
      planFollowed:
        planFollowedValue === ""
          ? null
          : planFollowedValue === "true",
      exitTrigger: getMultiSelectValues(formData, "exitTrigger"),
      proficiency: getMultiSelectValues(formData, "proficiency"),
      growthAreas: getMultiSelectValues(formData, "growthAreas"),
      stopLoss,
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
      className="flex flex-col gap-4 rounded-2xl border border-line bg-white p-3 shadow-sm sm:gap-5 sm:p-5"
    >
      {/* Header row */}
      <div className="grid grid-cols-2 gap-2 border-b border-slate-100 pb-4 sm:flex sm:flex-wrap sm:items-center sm:gap-3">
        <input
          name="symbol"
          placeholder="SYMBOL"
          required
          defaultValue={initialData?.symbol || ""}
          className="form-input col-span-2 uppercase font-bold text-lg sm:w-[140px]"
        />
        <select
          name="status"
          value={status}
          onChange={(e) => setStatus(e.target.value as "OPEN" | "CLOSED")}
          className="form-input bg-slate-50 sm:w-[110px]"
        >
          <option value="OPEN">🟢 OPEN</option>
          <option value="CLOSED">🔴 CLOSED</option>
        </select>
        <select
          name="tradeType"
          value={tradeType}
          onChange={(e) => setTradeType(e.target.value)}
          className="form-input bg-slate-50 sm:w-[100px]"
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
          className="form-input bg-slate-50 sm:w-[110px]"
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
            className="form-input bg-slate-50 sm:w-[160px]"
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
          className="form-input col-span-2 sm:flex-1 sm:min-w-[120px]"
        />
      </div>

      {/* Transactions grid */}
      <div className="grid gap-4 rounded-xl border border-slate-100 bg-slate-50/50 p-3 sm:gap-6 sm:p-4 lg:grid-cols-2">
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
          <div className="hidden sm:grid grid-cols-[3fr_2fr_2fr_auto] gap-2 text-[10px] text-slate-400 px-1">
            <span>Date & Time</span>
            <span>Price</span>
            <span>Qty</span>
            <span></span>
          </div>
          {entryRows.map((row, i) => (
            <div
              key={i}
              className="flex flex-col gap-1.5 sm:grid sm:grid-cols-[3fr_2fr_2fr_auto] sm:gap-2 sm:items-center bg-white rounded-lg border border-slate-100 p-2 sm:p-0 sm:bg-transparent sm:border-0"
            >
              <div className="flex items-center gap-2 sm:contents">
                <span className="text-[10px] text-slate-400 sm:hidden min-w-[60px]">Date & Time</span>
                <input
                  type="datetime-local"
                  value={row.dateTime}
                  onChange={(e) => updateEntryRow(i, "dateTime", e.target.value)}
                  required={i === 0}
                  className="form-input text-xs h-9 flex-1 sm:flex-none"
                />
              </div>
              <div className="flex items-center gap-2 sm:contents">
                <span className="text-[10px] text-slate-400 sm:hidden min-w-[60px]">Price</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="Price"
                  value={row.price}
                  onChange={(e) => updateEntryRow(i, "price", e.target.value)}
                  required={i === 0}
                  className="form-input text-sm h-9 flex-1 sm:flex-none"
                />
              </div>
              <div className="flex items-center gap-2 sm:contents">
                <span className="text-[10px] text-slate-400 sm:hidden min-w-[60px]">Qty</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="Qty"
                  value={row.quantity}
                  onChange={(e) => updateEntryRow(i, "quantity", e.target.value)}
                  required={i === 0}
                  className="form-input text-sm h-9 flex-1 sm:flex-none"
                />
              </div>
              <button
                type="button"
                onClick={() => removeEntryRow(i)}
                className="self-end sm:self-center text-slate-300 hover:text-red-400 transition sm:ml-0"
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
          <div className="hidden sm:grid grid-cols-[3fr_2fr_2fr_auto] gap-2 text-[10px] text-slate-400 px-1">
            <span>Date & Time</span>
            <span>Price</span>
            <span>Qty</span>
            <span></span>
          </div>
          {exitRows.map((row, i) => (
            <div
              key={i}
              className="flex flex-col gap-1.5 sm:grid sm:grid-cols-[3fr_2fr_2fr_auto] sm:gap-2 sm:items-center bg-white rounded-lg border border-slate-100 p-2 sm:p-0 sm:bg-transparent sm:border-0"
            >
              <div className="flex items-center gap-2 sm:contents">
                <span className="text-[10px] text-slate-400 sm:hidden min-w-[60px]">Date & Time</span>
                <input
                  type="datetime-local"
                  value={row.dateTime}
                  onChange={(e) => updateExitRow(i, "dateTime", e.target.value)}
                  required={status === "CLOSED" && i === 0}
                  className="form-input text-xs h-9 flex-1 sm:flex-none"
                />
              </div>
              <div className="flex items-center gap-2 sm:contents">
                <span className="text-[10px] text-slate-400 sm:hidden min-w-[60px]">Price</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="Price"
                  value={row.price}
                  onChange={(e) => updateExitRow(i, "price", e.target.value)}
                  required={status === "CLOSED" && i === 0}
                  className="form-input text-sm h-9 flex-1 sm:flex-none"
                />
              </div>
              <div className="flex items-center gap-2 sm:contents">
                <span className="text-[10px] text-slate-400 sm:hidden min-w-[60px]">Qty</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="Qty"
                  value={row.quantity}
                  onChange={(e) => updateExitRow(i, "quantity", e.target.value)}
                  required={status === "CLOSED" && i === 0}
                  className="form-input text-sm h-9 flex-1 sm:flex-none"
                />
              </div>
              <button
                type="button"
                onClick={() => removeExitRow(i)}
                className="self-end sm:self-center text-slate-300 hover:text-red-400 transition sm:ml-0"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Stop Loss, Charges, EOD Closing Price */}
      <div className="grid grid-cols-2 gap-3 sm:flex sm:flex-wrap sm:items-center sm:gap-4">
        <label className="flex flex-col gap-1.5 text-xs text-slate-500 sm:flex-row sm:items-center sm:gap-2 sm:text-sm">
          Stop Loss
          <input
            name="stopLoss"
            type="text"
            placeholder="abs or -5%"
            defaultValue={
              initialData?.stopLoss
                ? String(initialData.stopLoss)
                : ""
            }
            className="form-input h-9 w-full sm:w-[110px]"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-xs text-slate-500 sm:flex-row sm:items-center sm:gap-2 sm:text-sm">
          Charges
          <input
            name="charges"
            type="number"
            step="0.01"
            min="0"
            defaultValue={initialData?.charges ?? "0"}
            className="form-input h-9 w-full sm:w-[100px]"
          />
        </label>
        <label
          className="col-span-2 flex flex-col gap-1.5 text-xs text-slate-500 sm:col-span-1 sm:flex-row sm:items-center sm:gap-2 sm:text-sm"
          title="End of day Mark to Market"
        >
          EOD Closing Price
          <input
            name="closingPrice"
            type="number"
            step="0.01"
            min="0"
            defaultValue={initialData?.closingPrice ?? ""}
            className="form-input h-9 w-full sm:w-[100px]"
          />
        </label>
      </div>

      {/* Notes / Rationale */}
      <textarea
        name="notes"
        rows={2}
        placeholder="Setup rationale, reflection notes..."
        defaultValue={initialData?.notes || ""}
        className="form-input resize-y text-sm"
      />

      {/* Setup, Plan, Exit Trigger, Proficiency, Growth Areas */}
      <div className="grid gap-3 rounded-xl border border-slate-100 bg-white p-3 sm:grid-cols-2 lg:grid-cols-5">
        <label className="flex flex-col gap-1.5 text-xs text-slate-500">
          Setup
          <select
            name="setup"
            multiple
            defaultValue={splitInitialValues(initialData?.setup)}
            className="form-input min-h-[88px] bg-slate-50 text-sm"
          >
            {setupOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-xs text-slate-500">
          Plan Followed?
          <select
            name="planFollowed"
            defaultValue={
              initialData?.planFollowed === null ||
              initialData?.planFollowed === undefined
                ? ""
                : String(initialData.planFollowed)
            }
            className="form-input h-9 bg-slate-50 text-sm"
          >
            <option value="">Not set</option>
            <option value="true">Yes</option>
            <option value="false">No</option>
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-xs text-slate-500">
          Exit Trigger
          <select
            name="exitTrigger"
            multiple
            defaultValue={splitInitialValues(initialData?.exitTrigger)}
            className="form-input min-h-[88px] bg-slate-50 text-sm"
          >
            {exitTriggerOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-xs text-slate-500">
          Proficiency
          <select
            name="proficiency"
            multiple
            defaultValue={splitInitialValues(initialData?.proficiency)}
            className="form-input min-h-[88px] bg-slate-50 text-sm"
          >
            {proficiencyOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-xs text-slate-500">
          Growth Areas
          <select
            name="growthAreas"
            multiple
            defaultValue={splitInitialValues(initialData?.growthAreas)}
            className="form-input min-h-[88px] bg-slate-50 text-sm"
          >
            {growthAreaOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-2 flex flex-col-reverse gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
        {error ? (
          <p className="text-sm font-medium text-red-500">{error}</p>
        ) : (
          <div />
        )}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center">
          {initialData && (
            <Link
              href={`/trades/${encodeURIComponent(initialData.symbol)}`}
              className="w-full rounded-xl border border-line bg-white px-8 py-3 text-center text-sm font-medium text-slate-600 transition hover:bg-canvas sm:w-auto sm:py-2.5"
            >
              Cancel
            </Link>
          )}
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-xl bg-accent px-8 py-3 text-sm font-medium text-white transition hover:bg-accentDeep disabled:opacity-60 sm:w-auto sm:py-2.5"
          >
            {isSubmitting
              ? "Saving..."
              : initialData
                ? "Save changes"
                : "Log Trade"}
          </button>
        </div>
      </div>
    </form>
  );
}
