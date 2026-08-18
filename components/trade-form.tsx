"use client";

import { useState } from "react";
import type { Dispatch, SetStateAction } from "react";
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
import { ChevronDown, ChevronRight, Plus, Trash2 } from "lucide-react";

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
  reviewed: boolean;
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

/**
 * One editable row per day, not one per fill.
 *
 * A single order comes back from the broker as eight fills a few paise apart,
 * which turned this form into eight near-identical rows for one decision. Fills
 * from the same day collapse into one row at their quantity-weighted average
 * price, so the quantity on screen is the quantity traded that day - which is
 * also what makes a double import obvious, since a re-synced day reads as
 * doubled quantity rather than as more rows nobody counts.
 *
 * The fills are still there behind the count chip, and a day nobody touches is
 * submitted exactly as it was loaded. That last part is load-bearing: the Dhan
 * syncs de-duplicate on a per-fill fingerprint, so flattening a day into one
 * leg on every save would leave the next sync importing the whole order again.
 */
type LegGroup = {
  key: string;
  fills: TxRow[];
  expanded: boolean;
};

let nextGroupKey = 0;
const makeGroup = (fills: TxRow[]): LegGroup => ({
  key: `leg-${nextGroupKey++}`,
  fills,
  expanded: false,
});

const blankRow = (withDate: boolean): TxRow => ({
  price: "",
  quantity: "",
  dateTime: withDate ? toLocalDT() : "",
});

/** The single row a day is shown as: earliest time, weighted price, total qty. */
function groupDisplay(fills: TxRow[]): TxRow {
  if (fills.length === 1) return fills[0];

  let qty = 0;
  let amount = 0;
  for (const fill of fills) {
    const fillQty = Number(fill.quantity) || 0;
    qty += fillQty;
    amount += (Number(fill.price) || 0) * fillQty;
  }

  // "YYYY-MM-DDTHH:mm" sorts chronologically as text.
  const times = fills.map((fill) => fill.dateTime).filter(Boolean).sort();

  return {
    dateTime: times[0] ?? "",
    price: qty > 0 ? String(Number((amount / qty).toFixed(2))) : fills[0]?.price ?? "",
    quantity: String(Number(qty.toFixed(4))),
  };
}

function buildInitialGroups(
  txns: Transaction[],
  tradeType: string,
  side: "entry" | "exit",
): LegGroup[] {
  const entryType = tradeType === "LONG" ? "BUY" : "SELL";
  const sideType =
    side === "entry" ? entryType : entryType === "BUY" ? "SELL" : "BUY";
  const filtered = (txns ?? []).filter((t) => t.type === sideType);

  if (filtered.length === 0) return [makeGroup([blankRow(side === "entry")])];

  const groups: LegGroup[] = [];
  const byDay = new Map<string, LegGroup>();

  for (const tx of filtered) {
    const row: TxRow = {
      price: String(tx.price),
      quantity: String(tx.quantity),
      dateTime: toLocalDT(tx.dateTime),
    };
    const day = row.dateTime.slice(0, 10);
    const existing = day ? byDay.get(day) : undefined;

    if (existing) {
      existing.fills.push(row);
      continue;
    }

    const group = makeGroup([row]);
    groups.push(group);
    if (day) byDay.set(day, group);
  }

  return groups;
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

/**
 * Handlers are written once against a setter, because the entry and exit
 * columns differ only in which state they edit.
 */
function legHandlers(setGroups: Dispatch<SetStateAction<LegGroup[]>>) {
  const edit = (key: string, change: (group: LegGroup) => LegGroup) =>
    setGroups((groups) =>
      groups.map((group) => (group.key === key ? change(group) : group)),
    );

  return {
    add: () => setGroups((groups) => [...groups, makeGroup([blankRow(false)])]),

    removeGroup: (key: string) =>
      setGroups((groups) => groups.filter((group) => group.key !== key)),

    toggle: (key: string) =>
      edit(key, (group) => ({ ...group, expanded: !group.expanded })),

    // Editing the day's own row means the user is stating one number for the
    // whole day, so the fills behind it give way to that single leg.
    updateGroup: (key: string, field: keyof TxRow, value: string) =>
      edit(key, (group) => ({
        ...group,
        expanded: false,
        fills: [{ ...groupDisplay(group.fills), [field]: value }],
      })),

    updateFill: (key: string, index: number, field: keyof TxRow, value: string) =>
      edit(key, (group) => ({
        ...group,
        fills: group.fills.map((fill, i) =>
          i === index ? { ...fill, [field]: value } : fill,
        ),
      })),

    removeFill: (key: string, index: number) =>
      setGroups((groups) =>
        groups
          .map((group) =>
            group.key === key
              ? { ...group, fills: group.fills.filter((_, i) => i !== index) }
              : group,
          )
          .filter((group) => group.fills.length > 0),
      ),
  };
}

type LegHandlers = ReturnType<typeof legHandlers>;

const FIELD_LABELS: [keyof TxRow, string][] = [
  ["dateTime", "Date & Time"],
  ["price", "Price"],
  ["quantity", "Qty"],
];

function LegFields({
  row,
  required,
  onChange,
  compact = false,
}: {
  row: TxRow;
  required: boolean;
  onChange: (field: keyof TxRow, value: string) => void;
  compact?: boolean;
}) {
  return (
    <>
      {FIELD_LABELS.map(([field, label]) => (
        <div key={field} className="flex items-center gap-2 sm:contents">
          <span className="min-w-[60px] text-[10px] text-slate-400 sm:hidden">{label}</span>
          <input
            type={field === "dateTime" ? "datetime-local" : "number"}
            {...(field === "dateTime" ? {} : { step: "0.01", min: "0" })}
            placeholder={label}
            value={row[field]}
            onChange={(e) => onChange(field, e.target.value)}
            required={required}
            className={`form-input h-9 flex-1 sm:flex-none ${
              field === "dateTime" ? "text-xs" : "text-sm"
            } ${compact ? "bg-slate-50" : ""}`}
          />
        </div>
      ))}
    </>
  );
}

const LEG_GRID =
  "flex flex-col gap-1.5 rounded-lg border border-slate-100 bg-white p-2 sm:grid sm:grid-cols-[3fr_2fr_2fr_auto_auto] sm:items-center sm:gap-2 sm:border-0 sm:bg-transparent sm:p-0";

function LegEditor({
  title,
  titleClass,
  addClass,
  groups,
  handlers,
  requireFirst,
}: {
  title: string;
  titleClass: string;
  addClass: string;
  groups: LegGroup[];
  handlers: LegHandlers;
  requireFirst: boolean;
}) {
  return (
    <div className="space-y-2">
      <div className="mb-1 flex items-center justify-between">
        <span className={`text-xs font-bold tracking-wider ${titleClass}`}>{title}</span>
        <button
          type="button"
          onClick={handlers.add}
          className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-semibold transition ${addClass}`}
        >
          <Plus className="h-3 w-3" /> Add
        </button>
      </div>

      <div className="hidden grid-cols-[3fr_2fr_2fr_auto_auto] gap-2 px-1 text-[10px] text-slate-400 sm:grid">
        <span>Date & Time</span>
        <span>Price</span>
        <span>Qty</span>
        <span />
        <span />
      </div>

      {groups.map((group, index) => {
        const display = groupDisplay(group.fills);
        const fillCount = group.fills.length;

        return (
          <div key={group.key} className="space-y-1.5">
            <div className={LEG_GRID}>
              <LegFields
                row={display}
                required={requireFirst && index === 0}
                onChange={(field, value) => handlers.updateGroup(group.key, field, value)}
              />

              {fillCount > 1 ? (
                <button
                  type="button"
                  onClick={() => handlers.toggle(group.key)}
                  aria-expanded={group.expanded}
                  className="inline-flex shrink-0 items-center gap-0.5 self-start rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500 transition hover:bg-slate-200 hover:text-slate-700 sm:self-center"
                >
                  {group.expanded ? (
                    <ChevronDown className="h-3 w-3" />
                  ) : (
                    <ChevronRight className="h-3 w-3" />
                  )}
                  {fillCount} fills
                </button>
              ) : (
                <span className="hidden sm:block" />
              )}

              <button
                type="button"
                onClick={() => handlers.removeGroup(group.key)}
                aria-label="Remove"
                className="self-end text-slate-300 transition hover:text-red-400 sm:ml-0 sm:self-center"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>

            {group.expanded && fillCount > 1 && (
              <div className="space-y-1.5 rounded-lg border border-slate-200 bg-white p-2">
                <p className="text-[10px] text-slate-400">
                  The fills behind this day. Editing one keeps the rest; editing the row
                  above replaces all {fillCount}.
                </p>
                {group.fills.map((fill, fillIndex) => (
                  <div key={fillIndex} className={LEG_GRID}>
                    <LegFields
                      row={fill}
                      required={false}
                      compact
                      onChange={(field, value) =>
                        handlers.updateFill(group.key, fillIndex, field, value)
                      }
                    />
                    <span className="hidden sm:block" />
                    <button
                      type="button"
                      onClick={() => handlers.removeFill(group.key, fillIndex)}
                      aria-label="Remove fill"
                      className="self-end text-slate-300 transition hover:text-red-400 sm:self-center"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
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

  const [entryGroups, setEntryGroups] = useState<LegGroup[]>(() =>
    buildInitialGroups(
      initialData?.transactions ?? [],
      initialData?.tradeType ?? "LONG",
      "entry",
    ),
  );
  const [exitGroups, setExitGroups] = useState<LegGroup[]>(() =>
    buildInitialGroups(
      initialData?.transactions ?? [],
      initialData?.tradeType ?? "LONG",
      "exit",
    ),
  );

  const entryRows = entryGroups.flatMap((group) => group.fills);
  const exitRows = exitGroups.flatMap((group) => group.fills);

  const entryLegs = legHandlers(setEntryGroups);
  const exitLegs = legHandlers(setExitGroups);

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
      reviewed: formData.get("reviewed") === "on",
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

    router.push(`/trades?saved=${initialData?.id ? "updated" : "created"}`);
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
        <LegEditor
          title={`ENTRY ${tradeType === "LONG" ? "(BUY)" : "(SELL)"}`}
          titleClass="text-emerald-600"
          addClass="border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
          groups={entryGroups}
          handlers={entryLegs}
          requireFirst
        />
        <LegEditor
          title={`EXIT ${tradeType === "LONG" ? "(SELL)" : "(BUY)"}`}
          titleClass="text-amber-600"
          addClass="border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100"
          groups={exitGroups}
          handlers={exitLegs}
          requireFirst={status === "CLOSED"}
        />
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
        <label className="col-span-2 flex cursor-pointer select-none items-center gap-2 text-sm font-medium text-slate-600 sm:col-span-1">
          <input
            name="reviewed"
            type="checkbox"
            defaultChecked={!!initialData?.reviewed}
            className="h-4 w-4 rounded border-slate-300 accent-accent"
          />
          Reviewed
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
              href="/trades"
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
