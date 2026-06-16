"use client";

import React, { useState, useMemo } from "react";
import { Edit2, ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";
import type { GroupedTradeRow } from "@/lib/trade-utils";

const fmtAmtIntl = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });
const fmtPriceIntl = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtPct = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;
const fmtPctNoSign = (n: number) => `${n.toFixed(1)}%`;
const fmtAmt = (n: number) => fmtAmtIntl.format(n);
const fmtPrice = (n: number) => fmtPriceIntl.format(n);
const fmtQty = (n: number) => Number.isInteger(n) ? n.toLocaleString("en-IN") : fmtAmtIntl.format(n);
const fmtDate = (d: Date | string | null | undefined) =>
  d ? format(new Date(d), "dd MMM yy") : "—";
const dateSortValue = (d: Date | string | null | undefined) => {
  if (!d) return 0;
  const time = new Date(d).getTime();
  return Number.isNaN(time) ? 0 : time;
};
const hasPnlData = (row: GroupedTradeRow) =>
  row.derivedStatus === "CLOSED" || row.exitQty > 0 || !!(row.closingPrice && row.closingPrice > 0);
const isPartiallyClosed = (row: GroupedTradeRow) =>
  row.derivedStatus === "OPEN" && row.exitQty > 0;

function splitAttr(value?: string | null) {
  if (!value) return [];
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function compactList(value?: string | null, max = 1) {
  const values = splitAttr(value);
  if (values.length === 0) return null;
  const shown = values.slice(0, max).join(", ");
  return values.length > max ? `${shown} +${values.length - max}` : shown;
}

function JournalAttributeChips({ trade }: { trade: GroupedTradeRow }) {
  const setup = compactList(trade.setup, 1);
  const exitTrigger = compactList(trade.exitTrigger, 1);
  const plan =
    trade.planFollowed === null
      ? null
      : trade.planFollowed
        ? "Plan Yes"
        : "Plan No";
  const chips = [
    setup ? { key: "setup", label: setup, className: "bg-emerald-50 text-emerald-700 border-emerald-100" } : null,
    plan ? { key: "plan", label: plan, className: trade.planFollowed ? "bg-blue-50 text-blue-700 border-blue-100" : "bg-rose-50 text-rose-700 border-rose-100" } : null,
    exitTrigger ? { key: "exit", label: exitTrigger, className: "bg-amber-50 text-amber-700 border-amber-100" } : null,
  ].filter((chip): chip is { key: string; label: string; className: string } => chip !== null);

  if (chips.length === 0) return null;

  return (
    <div className="mt-1 flex max-w-[240px] items-center gap-1 overflow-hidden whitespace-nowrap">
      {chips.map((chip) => (
        <span
          key={chip.key}
          title={chip.label}
          className={`min-w-0 max-w-[92px] truncate rounded border px-1.5 py-0.5 text-[8px] font-medium leading-3 ${chip.className}`}
        >
          {chip.label}
        </span>
      ))}
    </div>
  );
}

type SortKey =
  | "symbol"
  | "entryDate"
  | "exitDate"
  | "openCapital"
  | "stopLossPct"
  | "allocationPct"
  | "ageDays"
  | "avgEntryPrice"
  | "pnlPct"
  | "pnlAmount"
  | "impactPct";

function SortIcon({ active, dir }: { active: boolean; dir: "asc" | "desc" }) {
  if (!active) return <ArrowUpDown className="inline ml-0.5 h-2.5 w-2.5 opacity-30" />;
  return dir === "asc"
    ? <ArrowUp className="inline ml-0.5 h-2.5 w-2.5 opacity-80" />
    : <ArrowDown className="inline ml-0.5 h-2.5 w-2.5 opacity-80" />;
}

function SortTh({
  children,
  sKey,
  sortKey,
  sortDir,
  onSort,
  className = "",
}: {
  children: React.ReactNode;
  sKey: SortKey;
  sortKey: SortKey | null;
  sortDir: "asc" | "desc";
  onSort: (k: SortKey) => void;
  className?: string;
}) {
  return (
    <th
      className={`cursor-pointer select-none hover:bg-slate-700 transition-colors ${className}`}
      onClick={() => onSort(sKey)}
    >
      {children}
      <SortIcon active={sortKey === sKey} dir={sortDir} />
    </th>
  );
}

function StopLossInput({ tradeId, stopLoss, entryPrice, onUpdate }: { tradeId: string; stopLoss: number | null; entryPrice: number; onUpdate: () => void }) {
  const stopLossPct = stopLoss && entryPrice > 0 ? Math.abs(((stopLoss - entryPrice) / entryPrice) * 100) : null;
  const [value, setValue] = useState(stopLoss?.toString() || "");
  const [isEditing, setIsEditing] = useState(false);

  async function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      let absValue: number | null = null;
      const raw = value.trim();

      if (raw.endsWith("%")) {
        const pct = parseFloat(raw);
        if (!isNaN(pct) && entryPrice > 0) {
          absValue = entryPrice + (entryPrice * pct) / 100;
        }
      } else {
        const num = parseFloat(raw);
        if (!isNaN(num)) absValue = num;
      }

      if (absValue === null || absValue <= 0) {
        absValue = null;
      }

      try {
        const res = await fetch("/api/trades/update-stop-loss", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tradeId, stopLoss: absValue }),
        });
        if (res.ok) {
          setIsEditing(false);
          onUpdate();
        } else {
          alert("Failed to update stop loss.");
        }
      } catch {
        alert("Network error.");
      }
    } else if (e.key === "Escape") {
      setIsEditing(false);
      setValue(stopLoss?.toString() || "");
    }
  }

  if (!isEditing) {
    return (
      <button
        type="button"
        onClick={() => setIsEditing(true)}
        className={`cursor-pointer rounded text-[11px] tabular-nums transition ${
          stopLossPct !== null ? "text-red-500 font-medium" : "text-slate-600 italic hover:text-blue-600"
        }`}
        title={stopLoss ? `₹ ${fmtPrice(stopLoss)}` : undefined}
      >
        {stopLossPct !== null ? fmtPctNoSign(stopLossPct) : "set"}
      </button>
    );
  }

  return (
    <input
      autoFocus
      placeholder="abs or -5%"
      className="w-[82px] rounded border border-blue-400 bg-blue-50 px-1.5 py-0.5 text-[11px] tabular-nums text-slate-800 outline-none"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={handleKeyDown}
      onBlur={() => setIsEditing(false)}
    />
  );
}

function ClosingPriceInput({ tradeId, initialValue, onUpdate }: { tradeId: string; initialValue: number | null; onUpdate: () => void }) {
  const [value, setValue] = useState(initialValue?.toString() || "");
  const [isEditing, setIsEditing] = useState(false);

  async function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      try {
        const res = await fetch("/api/trades/update-closing-price", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tradeId, closingPrice: value }),
        });
        if (res.ok) {
          setIsEditing(false);
          onUpdate();
        } else {
          alert("Failed to update price.");
        }
      } catch {
        alert("Network error.");
      }
    } else if (e.key === "Escape") {
      setIsEditing(false);
      setValue(initialValue?.toString() || "");
    }
  }

  if (!isEditing) {
    return (
      <button
        type="button"
        onClick={() => setIsEditing(true)}
        className="cursor-pointer rounded text-[11px] tabular-nums text-slate-600 italic hover:text-blue-600 transition"
      >
        {value || "set"}
      </button>
    );
  }

  return (
    <input
      autoFocus
      className="w-[70px] rounded border border-blue-400 bg-blue-50 px-1.5 py-0.5 text-[11px] tabular-nums text-slate-800 outline-none"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={handleKeyDown}
      onBlur={() => setIsEditing(false)}
    />
  );
}

export function JournalTable({ rows = [], showAmounts = true, onRefresh }: { rows: GroupedTradeRow[]; showAmounts?: boolean; onRefresh?: () => void }) {

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
  const [merging, setMerging] = useState(false);
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
      if (sortKey === "symbol") {
        const cmp = a.symbol.localeCompare(b.symbol);
        return sortDir === "asc" ? cmp : -cmp;
      }
      let av = 0;
      let bv = 0;
      switch (sortKey) {
        case "entryDate":
          av = dateSortValue(a.entryLegs[0]?.dateTime);
          bv = dateSortValue(b.entryLegs[0]?.dateTime);
          break;
        case "exitDate":
          av = dateSortValue(a.exitDateTime);
          bv = dateSortValue(b.exitDateTime);
          break;
        case "openCapital": av = a.openCapital; bv = b.openCapital; break;
        case "stopLossPct": av = a.stopLossPct ?? 0; bv = b.stopLossPct ?? 0; break;
        case "allocationPct": av = a.allocationPct; bv = b.allocationPct; break;
        case "ageDays": av = a.ageDays; bv = b.ageDays; break;
        case "pnlPct": av = a.pnlPct; bv = b.pnlPct; break;
        case "pnlAmount": av = a.pnlAmount; bv = b.pnlAmount; break;
        case "avgEntryPrice": av = a.weightedEntryPrice; bv = b.weightedEntryPrice; break;
        case "impactPct": av = a.impactPct; bv = b.impactPct; break;
      }
      return sortDir === "asc" ? av - bv : bv - av;
    });
  }, [rows, sortKey, sortDir]);

  const totals = useMemo(() => {
    const closedRows = rows.filter((r) => r.derivedStatus === "CLOSED");
    const openRows = rows.filter((r) => r.derivedStatus === "OPEN");
    const realizedPnl = closedRows.reduce((s, r) => s + r.realizedPnl, 0) +
      openRows.reduce((s, r) => s + r.realizedPnl, 0);
    const unrealizedPnl = openRows.reduce((s, r) => s + r.unrealizedPnl, 0);
    const totalCapital = rows.reduce((s, r) => s + r.capital, 0);
    const totalAlloc = openRows.reduce((s, r) => s + r.allocationPct, 0);
    const totalImpact = rows.reduce((s, r) => s + r.impactPct, 0);
    const totalPnl = realizedPnl + unrealizedPnl;
    const totalPnlPct = totalCapital > 0 ? (totalPnl / totalCapital) * 100 : 0;
    return { realizedPnl, unrealizedPnl, totalPnl, totalPnlPct, totalAlloc, totalImpact };
  }, [rows]);

  const allSelected = rows.length > 0 && rows.every((r) => selectedIds.has(r.id));
  const someSelected = selectedIds.size > 0;
  const selectedRows = rows.filter((r) => selectedIds.has(r.id));
  const canMerge = selectedRows.length >= 2 && new Set(selectedRows.map((r) => r.symbol)).size === 1;

  function toggleAll() {
    setSelectedIds(allSelected ? new Set() : new Set(rows.map((r) => r.id)));
  }
  function toggleOne(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function handleDeleteSelected() {
    if (!confirm(`Delete ${selectedIds.size} trade(s)? This cannot be undone.`)) return;
    const ids = [...selectedIds];
    setDeletingIds(new Set(ids));
    try {
      const res = await fetch("/api/trades/bulk-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      if (res.ok) { setSelectedIds(new Set()); onRefresh?.(); }
      else { const d = await res.json(); alert(d.error || "Failed to delete."); }
    } catch { alert("Network error."); }
    finally { setDeletingIds(new Set()); }
  }

  async function handleMerge() {
    if (!canMerge) return;
    if (!confirm(`Merge ${selectedIds.size} "${selectedRows[0].symbol}" trades into one?`)) return;
    setMerging(true);
    try {
      const res = await fetch("/api/trades/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [...selectedIds] }),
      });
      if (res.ok) { setSelectedIds(new Set()); onRefresh?.(); }
      else { const d = await res.json(); alert(d.error || "Failed to merge."); }
    } catch { alert("Network error."); }
    finally { setMerging(false); }
  }

  const pnlColor = (n: number) => n > 0 ? "text-emerald-600" : n < 0 ? "text-red-500" : "text-slate-400";

  return (
    <div className="space-y-2">
      {/* Summary bar */}
      {rows.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1 px-4 py-2.5 rounded-xl bg-canvas border border-line text-[12px]">
          <span className="text-slate-400 font-medium">{rows.length} trades</span>
          <div className="flex items-center gap-1">
            <span className="text-slate-500">Alloc:</span>
            <span className="font-semibold text-slate-700">{fmtPctNoSign(totals.totalAlloc)}</span>
          </div>
          {(totals.realizedPnl !== 0 || totals.unrealizedPnl !== 0) && (
            <div className="flex items-center gap-1">
              <span className="text-slate-500">R:</span>
              <span className={`font-semibold ${pnlColor(totals.realizedPnl)}`}>
                {showAmounts ? `${totals.realizedPnl >= 0 ? "+" : ""}${fmtAmt(totals.realizedPnl)}` : "•••"}
              </span>
            </div>
          )}
          {totals.unrealizedPnl !== 0 && (
            <div className="flex items-center gap-1">
              <span className="text-slate-500">U:</span>
              <span className={`font-semibold ${pnlColor(totals.unrealizedPnl)}`}>
                {showAmounts ? `${totals.unrealizedPnl >= 0 ? "+" : ""}${fmtAmt(totals.unrealizedPnl)}` : "•••"}
              </span>
            </div>
          )}
          <div className="flex items-center gap-1">
            <span className="text-slate-500">Impact:</span>
            <span className={`font-semibold ${pnlColor(totals.totalImpact)}`}>
              {fmtPct(totals.totalImpact)}
            </span>
          </div>
        </div>
      )}

      {/* Bulk action bar */}
      {someSelected && (
        <div className="flex items-center gap-3 px-4 py-2 rounded-xl bg-slate-800 text-white text-[12px]">
          <span className="text-slate-300">{selectedIds.size} selected</span>
          <button onClick={handleDeleteSelected} disabled={deletingIds.size > 0}
            className="px-3 py-1 rounded bg-red-600 hover:bg-red-700 transition disabled:opacity-50 font-medium">
            Delete
          </button>
          {canMerge && (
            <button onClick={handleMerge} disabled={merging}
              className="px-3 py-1 rounded bg-blue-500 hover:bg-blue-600 transition disabled:opacity-50 font-medium">
              {merging ? "Merging…" : "Merge"}
            </button>
          )}
          {selectedIds.size >= 2 && !canMerge && (
            <span className="text-slate-400 italic">Same symbol required to merge</span>
          )}
          <button onClick={() => setSelectedIds(new Set())} className="ml-auto text-slate-400 hover:text-white transition text-xs">
            Clear
          </button>
        </div>
      )}

      {/* Mobile card list */}
      <div className="space-y-2 lg:hidden">
        {sortedRows.map((t) => {
          const isClosed = t.derivedStatus === "CLOSED";
          const isSelected = selectedIds.has(t.id);
          const isDeleting = deletingIds.has(t.id);
          const isPartial = isPartiallyClosed(t);
          const accent = !isClosed
            ? "border-l-blue-400"
            : t.pnlAmount > 0
            ? "border-l-emerald-500"
            : t.pnlAmount < 0
            ? "border-l-red-400"
            : "border-l-slate-200";
          const firstEntry = t.entryLegs[0];
          const lastExit = t.exitLegs?.[t.exitLegs.length - 1];
          const showPnl = hasPnlData(t);
          return (
            <div
              key={t.id}
              className={`rounded-2xl border border-line border-l-4 ${accent} ${isPartial ? "bg-amber-50/50" : "bg-white"} p-3 shadow-sm ${
                isSelected ? "ring-2 ring-blue-300" : ""
              } ${isDeleting ? "opacity-40" : ""}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleOne(t.id)}
                    className="h-4 w-4 shrink-0 rounded border-slate-300 accent-slate-700"
                  />
                  <span
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded text-[10px] font-bold ${
                      t.tradeType === "LONG"
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-red-100 text-red-600"
                    }`}
                  >
                    {t.tradeType === "LONG" ? "L" : "S"}
                  </span>
                  <Link
                    href={`/trades/${encodeURIComponent(t.symbol)}`}
                    className="truncate text-[13px] font-semibold uppercase tracking-wide text-slate-800"
                  >
                    {t.symbol}
                  </Link>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                      isClosed
                        ? "bg-slate-100 text-slate-500"
                        : "bg-blue-100 text-blue-700"
                    }`}
                  >
                    {isClosed ? "CLOSED" : "OPEN"}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {!isClosed && (
                    <div className="flex items-center gap-1 rounded-full bg-slate-50 px-2 py-0.5 text-[11px] text-slate-500">
                      <span className="text-[10px] uppercase tracking-wider text-slate-400">
                        EOD
                      </span>
                      <ClosingPriceInput
                        tradeId={t.id}
                        initialValue={t.closingPrice}
                        onUpdate={() => onRefresh?.()}
                      />
                    </div>
                  )}
                  <Link
                    href={`/trades/${encodeURIComponent(t.symbol)}/edit/${t.id}`}
                    className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                  >
                    <Edit2 size={14} />
                  </Link>
                </div>
              </div>

              <div className="ml-8">
                <JournalAttributeChips trade={t} />
              </div>

              <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-[12px]">
                <div className="flex justify-between">
                  <span className="text-slate-400">Avg Entry</span>
                  <span className="font-medium tabular-nums text-slate-700">
                    {t.weightedEntryPrice > 0 ? fmtPrice(t.weightedEntryPrice) : "—"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Exit</span>
                  <span className="font-medium tabular-nums text-slate-700">
                    {lastExit?.price ? fmtPrice(lastExit.price) : "—"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Qty</span>
                  <span className="font-medium tabular-nums text-slate-700">
                    {showAmounts ? fmtQty(t.entryLegs.reduce((s, l) => s + (l.qty || 0), 0)) : "•••"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Alloc</span>
                  <span className="font-medium tabular-nums text-slate-700">
                    {fmtPctNoSign(t.allocationPct)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Age</span>
                  <span
                    className={`font-medium tabular-nums ${
                      t.ageDays > 30 ? "text-amber-600" : "text-slate-700"
                    }`}
                  >
                    {t.ageDays}d
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">SL</span>
                  <StopLossInput
                    tradeId={t.id}
                    stopLoss={t.stopLoss}
                    entryPrice={t.weightedEntryPrice}
                    onUpdate={() => onRefresh?.()}
                  />
                </div>
              </div>

              <div className="mt-3 flex items-start justify-between border-t border-line pt-2.5">
                <div className="flex flex-col">
                  <span className="text-[10px] uppercase tracking-wider text-slate-400">
                    P&amp;L
                  </span>
                  {!showPnl ? (
                    <span className="text-base font-semibold tabular-nums text-slate-300">—</span>
                  ) : t.derivedStatus === "CLOSED" ? (
                    <span className={`text-base font-semibold tabular-nums ${pnlColor(t.realizedPnl)}`}>
                      {fmtPct(t.pnlPct)}
                    </span>
                  ) : t.unrealizedPnl !== 0 && t.realizedPnl === 0 ? (
                    <span className={`text-base font-semibold tabular-nums ${pnlColor(t.unrealizedPnl)}`}>
                      {fmtPct(t.unrealizedPnl / t.capital * 100)}
                      <span className="text-[9px] text-slate-400 ml-1">MTM</span>
                    </span>
                  ) : (
                    <span className="tabular-nums leading-tight">
                      <span className={`block text-base font-semibold ${pnlColor(t.realizedPnl)}`}>
                        {fmtPct(t.realizedPnl / (t.capital || 1) * 100)}
                      </span>
                      {t.unrealizedPnl !== 0 && (
                        <span className={`block text-[11px] ${pnlColor(t.unrealizedPnl)} opacity-60`}>
                          {`U: ${fmtPct(t.unrealizedPnl / (t.capital || 1) * 100)}`}
                        </span>
                      )}
                    </span>
                  )}
                </div>
                <div className="flex flex-col items-end">
                  <span className="text-[10px] uppercase tracking-wider text-slate-400">
                    Amount
                  </span>
                  {!showAmounts ? (
                    <span className="text-base font-semibold tabular-nums text-slate-300">•••</span>
                  ) : !showPnl ? (
                    <span className="text-base font-semibold tabular-nums text-slate-300">—</span>
                  ) : t.derivedStatus === "CLOSED" ? (
                    <span className={`text-base font-semibold tabular-nums ${pnlColor(t.realizedPnl)}`}>
                      {`${t.realizedPnl >= 0 ? "+" : ""}${fmtAmt(t.realizedPnl)}`}
                    </span>
                  ) : t.unrealizedPnl !== 0 && t.realizedPnl === 0 ? (
                    <span className={`text-base font-semibold tabular-nums ${pnlColor(t.unrealizedPnl)}`}>
                      {`${t.unrealizedPnl >= 0 ? "+" : ""}${fmtAmt(t.unrealizedPnl)}`}
                      <span className="text-[9px] text-slate-400 ml-1">MTM</span>
                    </span>
                  ) : (
                    <span className="tabular-nums leading-tight text-right">
                      <span className={`block text-base font-semibold ${pnlColor(t.realizedPnl)}`}>
                        {`${t.realizedPnl >= 0 ? "+" : ""}${fmtAmt(t.realizedPnl)}`}
                      </span>
                      {t.unrealizedPnl !== 0 && (
                        <span className={`block text-[11px] ${pnlColor(t.unrealizedPnl)} opacity-60`}>
                          {`U: ${t.unrealizedPnl >= 0 ? "+" : ""}${fmtAmt(t.unrealizedPnl)}`}
                        </span>
                      )}
                    </span>
                  )}
                </div>
                <div className="flex flex-col items-end">
                  <span className="text-[10px] uppercase tracking-wider text-slate-400">
                    Impact
                  </span>
                  <span
                    className={`text-base font-semibold tabular-nums ${pnlColor(t.impactPct)}`}
                  >
                    {showPnl
                      ? fmtPct(t.impactPct)
                      : "—"}
                  </span>
                </div>
              </div>

            </div>
          );
        })}
        {rows.length === 0 && (
          <div className="rounded-2xl border border-dashed border-line bg-white py-12 text-center text-sm text-slate-400">
            No trades found. Import a CSV or add a trade manually.
          </div>
        )}
      </div>

      <div className="hidden w-full overflow-x-auto scrollbar-hide lg:block">
        <table className="w-full whitespace-nowrap text-right text-[12px] text-slate-700">
          <thead>
            <tr className="bg-slate-100 text-slate-600 text-[11px] uppercase tracking-wider border-b border-line">
              <th className="px-2 py-3 text-center w-8">
                <input type="checkbox" checked={allSelected} onChange={toggleAll}
                  className="h-3.5 w-3.5 rounded border-slate-400 accent-slate-500 cursor-pointer" />
              </th>
              <SortTh sKey="symbol" sortKey={sortKey} sortDir={sortDir} onSort={handleSort}
                className="px-3 py-3 text-left min-w-[130px]">Symbol</SortTh>
              <th className="px-3 py-3 text-center" colSpan={3}>Entry</th>
              <th className="px-3 py-3 text-center border-l border-slate-300" colSpan={3}>Exit</th>
              <SortTh sKey="openCapital" sortKey={sortKey} sortDir={sortDir} onSort={handleSort}
                className="px-3 py-3 text-center border-l border-slate-300">Open Cap ₹</SortTh>
              <SortTh sKey="stopLossPct" sortKey={sortKey} sortDir={sortDir} onSort={handleSort}
                className="px-3 py-3 text-center border-l border-slate-300">SL %</SortTh>
              <SortTh sKey="allocationPct" sortKey={sortKey} sortDir={sortDir} onSort={handleSort}
                className="px-3 py-3 text-center">Alloc %</SortTh>
              <SortTh sKey="ageDays" sortKey={sortKey} sortDir={sortDir} onSort={handleSort}
                className="px-3 py-3 text-center">Age</SortTh>
              <SortTh sKey="avgEntryPrice" sortKey={sortKey} sortDir={sortDir} onSort={handleSort}
                className="px-3 py-3 text-center border-l border-slate-300">Avg Entry ₹</SortTh>
              <SortTh sKey="pnlPct" sortKey={sortKey} sortDir={sortDir} onSort={handleSort}
                className="px-3 py-3 text-center border-l border-slate-300">P&amp;L %</SortTh>
              <SortTh sKey="pnlAmount" sortKey={sortKey} sortDir={sortDir} onSort={handleSort}
                className="px-3 py-3 text-center">P&amp;L ₹</SortTh>
              <SortTh sKey="impactPct" sortKey={sortKey} sortDir={sortDir} onSort={handleSort}
                className="px-3 py-3 text-center">Impact %</SortTh>
              <th className="px-3 py-3 text-center text-[10px] text-slate-400">EOD</th>
              <th className="px-2 py-3 text-center w-8"></th>
            </tr>
            <tr className="bg-white text-slate-400 text-[10px] border-b border-line">
              <th />
              <th className="px-3 py-1.5 text-left">L / S</th>
              <th className="px-3 py-1.5">Qty</th>
              <th className="px-3 py-1.5">Price</th>
              <SortTh sKey="entryDate" sortKey={sortKey} sortDir={sortDir} onSort={handleSort}
                className="px-3 py-1.5">Date</SortTh>
              <th className="px-3 py-1.5 border-l border-slate-300">Qty</th>
              <th className="px-3 py-1.5">Price</th>
              <SortTh sKey="exitDate" sortKey={sortKey} sortDir={sortDir} onSort={handleSort}
                className="px-3 py-1.5">Date</SortTh>
              <th className="px-3 py-1.5 border-l border-slate-300" />
              <th className="px-3 py-1.5 border-l border-slate-300" />
              <th className="px-3 py-1.5" /><th className="px-3 py-1.5" />
              <th className="px-3 py-1.5 border-l border-slate-300" />
              <th className="px-3 py-1.5 border-l border-slate-300" />
              <th className="px-3 py-1.5" /><th className="px-3 py-1.5" />
              <th className="px-3 py-1.5 border-l border-slate-300" />
              <th />
            </tr>
          </thead>

          <tbody className="divide-y divide-line">
            {sortedRows.map((t) => {
              const isClosed = t.derivedStatus === "CLOSED";
              const isDeleting = deletingIds.has(t.id);
              const isSelected = selectedIds.has(t.id);
              const showPnl = hasPnlData(t);
              const maxLegs = Math.max(t.entryLegs.length, t.exitLegs?.length || 0, 1);

              const isPartial = isPartiallyClosed(t);
              const borderColor = !isClosed
                ? "border-l-4 border-l-blue-400"
                : t.pnlAmount > 0
                ? "border-l-4 border-l-emerald-500"
                : t.pnlAmount < 0
                ? "border-l-4 border-l-red-400"
                : "border-l-4 border-l-slate-200";

              const rowBg = isSelected
                ? "bg-blue-50"
                : isPartial
                ? "bg-amber-50/40"
                : !isClosed
                ? "bg-blue-50/20"
                : "bg-white";

              return (
                <React.Fragment key={t.id}>
                  {Array.from({ length: maxLegs }).map((_, idx) => {
                    const eLeg = t.entryLegs[idx];
                    const xLeg = t.exitLegs?.[idx];
                    const isFirst = idx === 0;

                    return (
                      <tr key={`${t.id}-${idx}`}
                        className={`${rowBg} hover:bg-slate-50 transition-colors ${isDeleting ? "opacity-40" : ""} ${isFirst ? borderColor : "border-l-4 border-l-transparent"}`}>

                        {isFirst && (
                          <td className="px-2 py-3 text-center align-middle" rowSpan={maxLegs}>
                            <input type="checkbox" checked={isSelected} onChange={() => toggleOne(t.id)}
                              className="h-3.5 w-3.5 rounded border-slate-300 accent-slate-700 cursor-pointer" />
                          </td>
                        )}

                        {isFirst && (
                          <td className="px-3 py-3 text-left align-middle" rowSpan={maxLegs}>
                            <div className="flex items-center gap-1.5">
                              <span className={`shrink-0 w-4 h-4 flex items-center justify-center rounded text-[9px] font-bold ${
                                t.tradeType === "LONG" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-600"
                              }`}>
                                {t.tradeType === "LONG" ? "L" : "S"}
                              </span>
                              <Link href={`/trades/${encodeURIComponent(t.symbol)}`}
                                className="font-semibold text-slate-800 hover:text-blue-600 transition text-[12px] uppercase tracking-wide">
                                {t.symbol}
                              </Link>
                            </div>
                            <JournalAttributeChips trade={t} />
                          </td>
                        )}

                        <td className="px-3 py-3 text-right tabular-nums text-slate-600">
                          {!showAmounts
                            ? <span className="text-slate-300">•••</span>
                            : eLeg?.qty ? fmtQty(eLeg.qty) : <span className="text-slate-300">—</span>}
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums text-slate-700 font-medium">
                          {eLeg?.price ? fmtPrice(eLeg.price) : <span className="text-slate-300">—</span>}
                        </td>
                        <td className="px-3 py-3 text-right text-slate-500 text-[11px]">
                          {eLeg?.dateTime ? fmtDate(eLeg.dateTime) : <span className="text-slate-300">—</span>}
                        </td>

                        <td className="px-3 py-3 text-right tabular-nums text-slate-600 border-l border-slate-100">
                          {!showAmounts
                            ? <span className="text-slate-300">•••</span>
                            : xLeg?.qty > 0 ? fmtQty(xLeg.qty) : <span className="text-slate-300">—</span>}
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums text-slate-700 font-medium">
                          {xLeg?.price > 0 ? fmtPrice(xLeg.price) : <span className="text-slate-300">—</span>}
                        </td>
                        <td className="px-3 py-3 text-right text-slate-500 text-[11px]">
                          {xLeg?.dateTime ? fmtDate(xLeg.dateTime) : <span className="text-slate-300">—</span>}
                        </td>

                        {isFirst && (
                          <>
                            <td className="px-3 py-3 text-right tabular-nums text-slate-600 align-middle border-l border-slate-100" rowSpan={maxLegs}>
                              {!showAmounts
                                ? <span className="text-slate-300">•••</span>
                                : t.openCapital > 0 ? fmtAmt(t.openCapital) : <span className="text-slate-300">—</span>}
                            </td>
                            <td className="px-3 py-3 text-right align-middle border-l border-slate-100" rowSpan={maxLegs}>
                              <StopLossInput
                                tradeId={t.id}
                                stopLoss={t.stopLoss}
                                entryPrice={t.weightedEntryPrice}
                                onUpdate={() => onRefresh?.()}
                              />
                            </td>
                            <td className="px-3 py-3 text-right tabular-nums text-slate-600 align-middle" rowSpan={maxLegs}>
                              {fmtPctNoSign(t.allocationPct)}
                            </td>
                            <td className="px-3 py-3 text-right tabular-nums align-middle" rowSpan={maxLegs}>
                              <span className={t.ageDays > 30 ? "text-amber-600 font-medium" : "text-slate-500"}>
                                {t.ageDays}
                              </span>
                            </td>
                            <td className="px-3 py-3 text-right tabular-nums text-slate-700 font-medium align-middle border-l border-slate-100" rowSpan={maxLegs}>
                              {t.weightedEntryPrice > 0 ? fmtPrice(t.weightedEntryPrice) : <span className="text-slate-300">—</span>}
                            </td>
                            <td className={`px-3 py-3 text-right align-middle border-l border-slate-100 ${pnlColor(t.pnlAmount)}`} rowSpan={maxLegs}>
                              {!showPnl ? (
                                <span className="text-slate-300">—</span>
                              ) : t.derivedStatus === "CLOSED" || (t.unrealizedPnl === 0) ? (
                                <span className="font-semibold tabular-nums">{fmtPct(t.pnlPct)}</span>
                              ) : t.realizedPnl === 0 ? (
                                <span className="font-semibold tabular-nums">
                                  {fmtPct(t.unrealizedPnl / (t.capital || 1) * 100)}
                                  <span className="text-[9px] text-slate-400 ml-0.5">MTM</span>
                                </span>
                              ) : (
                                <span className="tabular-nums leading-tight">
                                  <span className={`block font-semibold text-[11px] ${pnlColor(t.realizedPnl)}`}>
                                    {fmtPct(t.realizedPnl / (t.capital || 1) * 100)}
                                  </span>
                                  <span className={`block text-[10px] ${pnlColor(t.unrealizedPnl)} opacity-60`}>
                                    U:{fmtPct(t.unrealizedPnl / (t.capital || 1) * 100)}
                                  </span>
                                </span>
                              )}
                            </td>
                            <td className={`px-3 py-3 text-right align-middle tabular-nums ${pnlColor(t.pnlAmount)}`} rowSpan={maxLegs}>
                              {!showAmounts ? (
                                <span className="text-slate-300">•••</span>
                              ) : !showPnl ? (
                                <span className="text-slate-300">—</span>
                              ) : t.derivedStatus === "CLOSED" || (t.unrealizedPnl === 0) ? (
                                <span className="font-semibold">{`${t.realizedPnl >= 0 ? "+" : ""}${fmtAmt(t.realizedPnl)}`}</span>
                              ) : t.realizedPnl === 0 ? (
                                <span className="font-semibold">
                                  {`${t.unrealizedPnl >= 0 ? "+" : ""}${fmtAmt(t.unrealizedPnl)}`}
                                  <span className="text-[9px] text-slate-400 ml-0.5">MTM</span>
                                </span>
                              ) : (
                                <span className="tabular-nums leading-tight">
                                  <span className={`block font-semibold text-[11px] ${pnlColor(t.realizedPnl)}`}>
                                    {`${t.realizedPnl >= 0 ? "+" : ""}${fmtAmt(t.realizedPnl)}`}
                                  </span>
                                  <span className={`block text-[10px] ${pnlColor(t.unrealizedPnl)} opacity-60`}>
                                    U:{`${t.unrealizedPnl >= 0 ? "+" : ""}${fmtAmt(t.unrealizedPnl)}`}
                                  </span>
                                </span>
                              )}
                            </td>
                            <td className={`px-3 py-3 text-right tabular-nums font-medium align-middle ${pnlColor(t.impactPct)}`} rowSpan={maxLegs}>
                              {showPnl
                                ? fmtPct(t.impactPct)
                                : <span className="text-slate-300">—</span>}
                            </td>
                            <td className="px-3 py-3 text-right tabular-nums align-middle border-l border-slate-100" rowSpan={maxLegs}>
                               <ClosingPriceInput
                                  tradeId={t.id}
                                  initialValue={t.closingPrice}
                                  onUpdate={() => onRefresh?.()}
                                />
                            </td>
                            <td className="px-2 py-3 text-center align-middle" rowSpan={maxLegs}>
                              <Link href={`/trades/${encodeURIComponent(t.symbol)}/edit/${t.id}`}
                                className="text-slate-400 hover:text-slate-700 transition" title="Edit">
                                <Edit2 size={12} />
                              </Link>
                            </td>
                          </>

                        )}
                      </tr>
                    );
                  })}
                </React.Fragment>
              );
            })}

            {rows.length === 0 && (
              <tr>
                <td colSpan={16} className="py-16 text-center text-slate-400 text-sm">
                  No trades found. Import a CSV or add a trade manually.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
