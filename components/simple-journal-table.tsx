"use client";

import React, { useState, useMemo, useRef, useEffect } from "react";
import { ArrowUp, ArrowDown, ArrowUpDown, CheckCircle2, Circle } from "lucide-react";
import { format } from "date-fns";
import type { GroupedTradeRow } from "@/lib/trade-utils";
import { SymbolChartLink } from "@/components/symbol-chart-link";
import { getTradeStatusUi } from "@/lib/trade-status";

const fmtPrice = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtPct = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;
const pnlColor = (n: number) => n > 0 ? "text-emerald-600" : n < 0 ? "text-red-500" : "text-slate-400";
// Same as the detailed journal - the two views are read side by side.
const fmtDate = (d: Date | string | null | undefined) =>
  d ? format(new Date(d), "dd MMM yy") : "—";

export const SIMPLE_JOURNAL_FONT_DEFAULT = 13;

type SortKey =
  | "symbol"
  | "entryDate"
  | "avgEntryPrice"
  | "avgExitPrice"
  | "stopLossPct"
  | "ageDays"
  | "allocationPct"
  | "pnlPct"
  | "impactPct"
  | "reviewed"
  | "avoidable";

function SortIcon({ active, dir }: { active: boolean; dir: "asc" | "desc" }) {
  if (!active) return <ArrowUpDown className="inline ml-0.5 h-2.5 w-2.5 opacity-30" />;
  return dir === "asc"
    ? <ArrowUp className="inline ml-0.5 h-2.5 w-2.5 opacity-80" />
    : <ArrowDown className="inline ml-0.5 h-2.5 w-2.5 opacity-80" />;
}

/**
 * A spreadsheet-style cell: plain text until you click it, saved when you click
 * away or press Enter (Shift+Enter for a new line, Escape to undo).
 */
function NotesCell({ tradeId, initial }: { tradeId: string; initial: string }) {
  const [value, setValue] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [state, setState] = useState<"idle" | "saving" | "error">("idle");
  const ref = useRef<HTMLTextAreaElement>(null);

  // Follow the server when the row reloads (filters, refresh) with new text.
  useEffect(() => {
    setValue(initial);
    setSaved(initial);
  }, [initial]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  async function commit() {
    const next = value.trim();
    if (next === saved) {
      setValue(saved);
      return;
    }
    setState("saving");
    try {
      const res = await fetch(`/api/trades/${tradeId}/notes`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: next }),
      });
      if (!res.ok) throw new Error("save failed");
      setSaved(next);
      setValue(next);
      setState("idle");
    } catch {
      setState("error");
    }
  }

  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      maxLength={2000}
      placeholder="Add a note…"
      title={state === "error" ? "Could not save - click away to retry" : "Click to edit; Enter saves"}
      onChange={(e) => {
        setValue(e.target.value);
        if (state === "error") setState("idle");
      }}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          e.currentTarget.blur();
        } else if (e.key === "Escape") {
          setValue(saved);
          e.currentTarget.blur();
        }
      }}
      className={`block w-full min-w-[260px] resize-none overflow-hidden rounded border bg-transparent px-1.5 py-1 text-[0.82em] leading-snug text-slate-600 outline-none transition placeholder:text-slate-300 hover:border-line focus:border-accent focus:bg-white ${
        state === "error"
          ? "border-red-300"
          : state === "saving"
            ? "border-amber-200 opacity-70"
            : "border-transparent"
      }`}
    />
  );
}

export function SimpleJournalTable({
  rows,
  fontPx = SIMPLE_JOURNAL_FONT_DEFAULT,
}: {
  rows: GroupedTradeRow[];
  fontPx?: number;
}) {
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  const sortedRows = useMemo(() => {
    if (!sortKey) return rows;
    return [...rows].sort((a, b) => {
      let av = 0;
      let bv = 0;
      switch (sortKey) {
        case "symbol":
          const cmp = a.symbol.localeCompare(b.symbol);
          return sortDir === "asc" ? cmp : -cmp;
        case "entryDate":
          av = new Date(a.entryDate).getTime();
          bv = new Date(b.entryDate).getTime();
          break;
        case "avgEntryPrice": av = a.weightedEntryPrice; bv = b.weightedEntryPrice; break;
        case "avgExitPrice": av = a.exitPrice; bv = b.exitPrice; break;
        case "stopLossPct": av = a.stopLossPct ?? 0; bv = b.stopLossPct ?? 0; break;
        case "ageDays": av = a.ageDays; bv = b.ageDays; break;
        case "allocationPct": av = a.allocationPct; bv = b.allocationPct; break;
        case "pnlPct": av = a.pnlPct; bv = b.pnlPct; break;
        case "impactPct": av = a.impactPct; bv = b.impactPct; break;
        case "reviewed": av = a.reviewed ? 1 : 0; bv = b.reviewed ? 1 : 0; break;
        case "avoidable": av = a.avoidable ? 2 : a.avoidable === false ? 1 : 0; bv = b.avoidable ? 2 : b.avoidable === false ? 1 : 0; break;
      }
      return sortDir === "asc" ? av - bv : bv - av;
    });
  }, [rows, sortKey, sortDir]);

  function th(key: SortKey, label: string, className = "") {
    return (
      <th
        className={`cursor-pointer select-none whitespace-nowrap px-3 py-2.5 text-left text-[0.82em] font-semibold uppercase tracking-wider text-slate-500 transition-colors hover:bg-slate-100 ${className}`}
        onClick={() => handleSort(key)}
      >
        {label}
        <SortIcon active={sortKey === key} dir={sortDir} />
      </th>
    );
  }

  return (
    // Sizing the wrapper rather than each cell: the rows carry no font size of
    // their own, so one number here scales the whole table.
    <div className="overflow-x-auto sticky-head" style={{ fontSize: `${fontPx}px` }}>
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-line bg-slate-50">
            {th("symbol", "Symbol")}
            {th("entryDate", "Entry Date")}
            {th("avgEntryPrice", "Avg Entry")}
            {th("avgExitPrice", "Avg Exit")}
            {th("stopLossPct", "SL %")}
            {th("ageDays", "Age (d)")}
            {th("allocationPct", "Alloc %")}
            {th("pnlPct", "PNL %")}
            {th("impactPct", "Impact %")}
            {th("avoidable", "Avoidable")}
            {th("reviewed", "Reviewed")}
            <th className="whitespace-nowrap px-3 py-2.5 text-left text-[0.82em] font-semibold uppercase tracking-wider text-slate-500">
              Notes
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {sortedRows.map((row) => {
            const statusUi = getTradeStatusUi(row);
            return (
            <tr
              key={row.id}
              className={`border-l-4 ${statusUi.borderClass} ${statusUi.rowClass} transition-colors hover:bg-slate-50/60`}
            >
              <td className="whitespace-nowrap px-3 py-3 font-semibold text-ink">
                <span className="flex min-w-0 items-center gap-1.5">
                  <SymbolChartLink
                    symbol={row.symbol}
                    asTicker
                    className="transition hover:text-blue-600"
                  />
                  {statusUi.label && (
                    <span
                      className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[0.68em] font-semibold tracking-wide ${statusUi.chipClass}`}
                      title={statusUi.title}
                    >
                      {statusUi.label}
                    </span>
                  )}
                </span>
              </td>
              <td className="whitespace-nowrap px-3 py-3 text-slate-700">{fmtDate(row.entryDate)}</td>
              <td className="whitespace-nowrap px-3 py-3 text-slate-700">{fmtPrice.format(row.weightedEntryPrice)}</td>
              <td className="whitespace-nowrap px-3 py-3 text-slate-700">{row.exitPrice > 0 ? fmtPrice.format(row.exitPrice) : "—"}</td>
              <td className="whitespace-nowrap px-3 py-3 text-slate-700">{row.stopLossPct != null ? `${Math.abs(row.stopLossPct).toFixed(1)}%` : "—"}</td>
              <td className="whitespace-nowrap px-3 py-3 text-slate-700">{row.ageDays}</td>
              <td className="whitespace-nowrap px-3 py-3 text-slate-700">{row.allocationPct.toFixed(1)}%</td>
              <td className={`whitespace-nowrap px-3 py-3 font-medium ${pnlColor(row.pnlPct)}`}>{fmtPct(row.pnlPct)}</td>
              <td className={`whitespace-nowrap px-3 py-3 font-medium ${pnlColor(row.impactPct)}`}>{fmtPct(row.impactPct)}</td>
              <td className="whitespace-nowrap px-3 py-3">
                {row.avoidable ? (
                  <span
                    className="rounded-full border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[0.75em] font-semibold text-amber-700"
                    title="Marked avoidable in review"
                  >
                    {row.avoidableReason ?? "Yes"}
                  </span>
                ) : row.avoidable === false ? (
                  <span className="text-slate-400">No</span>
                ) : (
                  <span className="text-slate-300">—</span>
                )}
              </td>
              <td className="whitespace-nowrap px-3 py-3">
                {row.reviewed ? (
                  <span className="inline-flex items-center gap-1 text-emerald-600" title="Reviewed">
                    <CheckCircle2 className="h-4 w-4" />
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-slate-300" title="Not reviewed">
                    <Circle className="h-4 w-4" />
                  </span>
                )}
              </td>
              <td className="px-2 py-1.5">
                <NotesCell tradeId={row.id} initial={row.notes ?? ""} />
              </td>
            </tr>
            );
          })}
          {sortedRows.length === 0 && (
            <tr>
              <td colSpan={12} className="px-3 py-8 text-center text-slate-400">No trades found.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
