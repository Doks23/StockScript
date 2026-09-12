"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import {
  RefreshCw,
  Search,
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Download,
  Eye,
  EyeOff,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import {
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  CartesianGrid,
  BarChart,
  Bar,
} from "recharts";
import {
  BREAKEVEN_TRIGGERS,
  excursionsToCsv,
  summarizeExcursions,
  withBreakeven,
  type BreakevenTrigger,
  type ExcursionResult,
  type ExcursionView,
} from "@/lib/trade-excursions";
import { formatCurrency, formatPrice } from "@/lib/format";
import { DhanTokenField, useDhanToken } from "@/components/dhan-token-field";
import { runExcursionRefresh, type RefreshProgress } from "@/lib/excursion-refresh";

const PROFIT = "#157f5b";
const LOSS = "#b33f40";

type Problem = { symbol: string; reason: string; quoteSymbol?: string | null };

/** A result as stored on the trade, with when it was measured. */
type StoredResult = ExcursionResult & { measuredAt?: string };

/** What GET /api/trades/excursions returns: stored results, no Dhan involved. */
type ExcursionResponse = {
  results: StoredResult[];
  years: number[];
  /** Positions a refresh would measure: new or changed closed trades, moved open ones. */
  missing: number;
};

type Props = {
  initialYear?: number;
};

/** "17 Aug 09:22" - the minute an extreme printed, in the viewer's (IST) clock. */
const fmtAt = (iso: string | null) => (iso ? format(new Date(iso), "dd MMM HH:mm") : "");

const fmtR = (value: number | null, digits = 2) => {
  if (value === null || !Number.isFinite(value)) return "—";
  return value.toFixed(digits);
};

const fmtPct = (value: number | null, digits = 1) => {
  if (value === null || !Number.isFinite(value)) return "—";
  return `${value.toFixed(digits)}%`;
};

const fmtAmount = (value: number | null) =>
  value === null || !Number.isFinite(value) ? "—" : formatCurrency(value);

const OUTCOME_FILTERS: ("ALL" | ExcursionResult["outcome"])[] = [
  "ALL",
  "WIN",
  "LOSS",
  "BREAKEVEN",
  "OPEN",
];

// ─────────────────────────────────────────────────────────────────────
// Table sorting - click a header, click again to flip
// ─────────────────────────────────────────────────────────────────────

type SortKey =
  | "date"
  | "symbol"
  | "entry"
  | "stop"
  | "exit"
  | "slPct"
  | "mfePct"
  | "mfeR"
  | "maePct"
  | "maeR"
  | "maeFullR"
  | "actualR"
  | "capture"
  | "outcome";

type SortState = { key: SortKey; dir: "asc" | "desc" };

const SORT_VALUE: Record<SortKey, (row: ExcursionView) => number | string | null> = {
  date: (row) => new Date(row.entryDate).getTime(),
  symbol: (row) => row.symbol,
  entry: (row) => row.firstEntryPrice,
  stop: (row) => row.stopLoss,
  exit: (row) => row.lastExitPrice,
  slPct: (row) => row.slPct,
  mfePct: (row) => row.mfePct,
  mfeR: (row) => row.mfeR,
  maePct: (row) => row.maePct,
  maeR: (row) => row.maeR,
  maeFullR: (row) => row.maeFullR,
  actualR: (row) => row.actualR,
  capture: (row) => row.capturePct,
  outcome: (row) => row.outcome,
};

/** The divider that opens each column group in the table. */
const GROUP_EDGE = "border-l border-line";
/** Columns behind "Show details": Result, Type, Exit, SL, MFE at, MAE at, MAE full, BE at, Bars. */
const DETAIL_COLUMNS = 9;
/** #, Date, Symbol, Entry, SL% + MFE%, MFE(R), Exit(R), Captured + MAE%, MAE(R). */
const MAIN_COLUMNS = 11;

/** Rows with no value for the column sort last, whichever way it is ordered. */
function compareRows(a: ExcursionView, b: ExcursionView, sort: SortState) {
  const va = SORT_VALUE[sort.key](a);
  const vb = SORT_VALUE[sort.key](b);
  if (va === null && vb === null) return 0;
  if (va === null) return 1;
  if (vb === null) return -1;
  const order =
    typeof va === "string" || typeof vb === "string"
      ? String(va).localeCompare(String(vb))
      : va - vb;
  return sort.dir === "asc" ? order : -order;
}

function SortHeader({
  label,
  sortKey,
  sort,
  onSort,
  align = "right",
  title,
  className = "",
}: {
  label: string;
  sortKey: SortKey;
  sort: SortState;
  onSort: (key: SortKey) => void;
  align?: "left" | "right";
  title?: string;
  className?: string;
}) {
  const active = sort.key === sortKey;
  const Icon = active ? (sort.dir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <th
      className={`px-3 py-2.5 font-semibold ${align === "left" ? "text-left" : "text-right"} ${className}`}
      title={title}
      aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={`inline-flex items-center gap-1 transition hover:text-ink ${
          align === "right" ? "flex-row-reverse" : ""
        } ${active ? "text-ink" : ""}`}
      >
        {label}
        <Icon className={`h-3 w-3 ${active ? "" : "opacity-40"}`} />
      </button>
    </th>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Pieces
// ─────────────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string;
  sub?: string;
  color?: string;
}) {
  return (
    <div className="rounded-xl border border-line bg-white p-3.5">
      <span className="text-[10px] font-medium uppercase tracking-wider text-slate-400">{label}</span>
      <div className={`mt-1 text-xl font-semibold tabular-nums ${color ?? "text-slate-800"}`}>{value}</div>
      {sub && <div className="mt-0.5 text-[11px] text-slate-400">{sub}</div>}
    </div>
  );
}

function outcomeClass(outcome: ExcursionResult["outcome"]) {
  return outcome === "WIN"
    ? "text-emerald-600"
    : outcome === "LOSS"
      ? "text-red-500"
      : outcome === "OPEN"
        ? "text-sky-600"
        : "text-slate-400";
}

/** What a trade was measured on, and anything the time checks had to do. */
function barsNote(row: ExcursionResult): { label: string; tone: string; title: string } {
  if (row.priceMismatch) {
    return {
      label: "mismatch",
      tone: "bg-red-50 text-red-600",
      title:
        "Your entry price never traded on the entry day in these bars - the series is split/bonus adjusted or mapped to the wrong company. Left out of the stats.",
    };
  }
  const notes: string[] = [];
  const side = (check: ExcursionResult["entryTimeCheck"], name: string) => {
    if (check === "shifted") {
      notes.push(`${name} time was stored 5h30m late and was moved to the minute your fill price traded`);
    } else if (check === "unverified") {
      notes.push(`your ${name} price did not trade near the stored ${name} time, so that whole day was used`);
    }
  };
  side(row.entryTimeCheck, "entry");
  side(row.exitTimeCheck, "exit");

  const scale = row.priceScale ?? 1;
  const scaleLabel = scale === 1 ? "" : ` ×${Number(scale.toFixed(3))}`;
  if (scale !== 1) {
    notes.push(
      `Dhan's bars for this period are adjusted for a later split or bonus, so they were multiplied by ${Number(
        scale.toFixed(3),
      )} to get back to the prices you traded at`,
    );
  }

  const unverified = row.entryTimeCheck === "unverified" || row.exitTimeCheck === "unverified";
  const shifted = row.entryTimeCheck === "shifted" || row.exitTimeCheck === "shifted";
  return {
    label: `${unverified ? "1m ~day" : shifted ? "1m*" : "1m"}${scaleLabel}`,
    tone: unverified ? "bg-amber-50 text-amber-700" : "bg-sky-50 text-sky-700",
    title:
      notes.length === 0
        ? "Dhan minute bars, from your entry minute to your exit minute."
        : `Dhan minute bars. ${notes.join("; ")}.`,
  };
}

/** Winners and losers per R bucket, half-open [from, to). */
function buildDistribution(results: ExcursionResult[], metric: "mfeR" | "maeR") {
  const isMfe = metric === "mfeR";
  const uppers = isMfe ? [0.5, 1, 2, 3, 5] : [0.25, 0.5, 0.75, 1, 1.5];
  const labels = isMfe
    ? ["0–0.5R", "0.5–1R", "1–2R", "2–3R", "3–5R", "5R+"]
    : ["0–0.25R", "0.25–0.5R", "0.5–0.75R", "0.75–1R", "1–1.5R", "1.5R+"];
  const bins = labels.map((label) => ({ label, winners: 0, losers: 0 }));

  for (const r of results) {
    const value = r[metric];
    if (!r.covered || value === null || !Number.isFinite(value)) continue;
    let idx = uppers.findIndex((upper) => value < upper);
    if (idx === -1) idx = labels.length - 1;
    if (r.outcome === "WIN") bins[idx].winners++;
    else if (r.outcome === "LOSS") bins[idx].losers++;
  }
  return bins;
}

type PeakPoint = {
  symbol: string;
  actualR: number;
  mfeR: number;
  capturePct: number | null;
  outcome: ExcursionResult["outcome"];
};

function PeakTooltip({ active, payload }: { active?: boolean; payload?: any[] }) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload as PeakPoint;
  return (
    <div className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs shadow-sm">
      <div className="font-semibold text-slate-700">{point.symbol}</div>
      <div className="tabular-nums text-slate-500">Peak {fmtR(point.mfeR)}R</div>
      <div className={`tabular-nums font-semibold ${point.outcome === "WIN" ? "text-emerald-600" : "text-red-500"}`}>
        Booked {fmtR(point.actualR)}R
        {point.capturePct != null ? ` · kept ${fmtPct(point.capturePct)}` : ""}
      </div>
    </div>
  );
}

/** Open/closed that survives a reload - per viewer, in this browser only. */
function useStoredToggle(key: string, initial = true): [boolean, () => void] {
  const [open, setOpen] = useState(initial);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(key);
      if (saved !== null) setOpen(saved === "1");
    } catch {
      // Private mode or blocked storage: the default stands.
    }
  }, [key]);

  const toggle = useCallback(() => {
    setOpen((current) => {
      const next = !current;
      try {
        window.localStorage.setItem(key, next ? "1" : "0");
      } catch {
        // Not remembered, but the section still folds.
      }
      return next;
    });
  }, [key]);

  return [open, toggle];
}

/** A heading that folds its content away, styled like the table's. */
function CollapsibleSection({
  title,
  open,
  onToggle,
  children,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-slate-500 transition hover:text-ink"
      >
        {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        {title}
      </button>
      {open && children}
    </section>
  );
}

function ChartCard({
  title,
  note,
  children,
}: {
  title: string;
  note: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-line bg-white p-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">{title}</h3>
        <div className="flex items-center gap-3 text-[11px] text-slate-500">
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full" style={{ background: PROFIT }} /> Winners
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full" style={{ background: LOSS }} /> Losers
          </span>
        </div>
      </div>
      {children}
      <p className="mt-2 text-[11px] leading-relaxed text-slate-400">{note}</p>
    </div>
  );
}

function DistributionChart({ data }: { data: { label: string; winners: number; losers: number }[] }) {
  return (
    <div className="h-44">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 2, right: 4, left: -24, bottom: 0 }} barGap={0}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 9, fill: "#94a3b8" }} tickLine={false} axisLine={false} interval={0} />
          <YAxis allowDecimals={false} tick={{ fontSize: 9, fill: "#94a3b8" }} tickLine={false} axisLine={false} />
          <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }} />
          <Bar dataKey="winners" name="Winners" fill={PROFIT} radius={[2, 2, 0, 0]} maxBarSize={16} />
          <Bar dataKey="losers" name="Losers" fill={LOSS} radius={[2, 2, 0, 0]} maxBarSize={16} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Panel
// ─────────────────────────────────────────────────────────────────────

export function MaeMfePanel({ initialYear }: Props) {
  const [data, setData] = useState<ExcursionResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [year, setYear] = useState<number | null>(initialYear ?? null);
  const [setup, setSetup] = useState<string>("all");
  const [outcome, setOutcome] = useState<(typeof OUTCOME_FILTERS)[number]>("ALL");
  const [sort, setSort] = useState<SortState>({ key: "date", dir: "desc" });
  /** The supporting columns stay out of the way until asked for. */
  const [showDetails, setShowDetails] = useState(false);
  // Each block folds away; the choice is remembered in this browser.
  const [summaryOpen, toggleSummary] = useStoredToggle("mae-mfe.summary");
  const [insightsOpen, toggleInsights] = useStoredToggle("mae-mfe.insights");
  const [tableOpen, toggleTable] = useStoredToggle("mae-mfe.table");
  const [chartsOpen, toggleCharts] = useStoredToggle("mae-mfe.charts");
  /** How far in your favour, from the first entry, before the stop goes to breakeven. */
  const [trigger, setTrigger] = useState<BreakevenTrigger>(2);
  const [query, setQuery] = useState("");

  const [progress, setProgress] = useState<RefreshProgress | null>(null);
  const [updating, setUpdating] = useState(false);
  const [refreshProblems, setRefreshProblems] = useState<Problem[]>([]);
  const { accessToken, setAccessToken, expiresAt, remember, forget } = useDhanToken();
  /** Each load gets a number; a response that returns after a newer load started is dropped. */
  const runRef = useRef(0);

  /** What is stored on the trades - instant, no Dhan, no token. */
  const load = useCallback(async (targetYear: number | null) => {
    const run = ++runRef.current;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/trades/excursions${targetYear == null ? "" : `?year=${targetYear}`}`,
        { cache: "no-store" },
      );
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error ?? "Could not load MAE / MFE.");
      if (run !== runRef.current) return;
      setData(body as ExcursionResponse);
    } catch (err) {
      if (run === runRef.current) setError((err as Error).message);
    } finally {
      if (run === runRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(year);
  }, [load, year]);

  /**
   * Measure on Dhan whatever is not stored yet - new or changed closed trades,
   * and every open position - store it on the trades, then read it back.
   */
  const update = useCallback(async () => {
    const token = accessToken.trim();
    if (!token) return;
    setUpdating(true);
    setError(null);
    setProgress(null);
    setRefreshProblems([]);
    try {
      const { problems } = await runExcursionRefresh(token, "pending", setProgress);
      remember(token);
      setRefreshProblems(problems);
      await load(year);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setUpdating(false);
      setProgress(null);
    }
  }, [accessToken, remember, load, year]);

  const toggleSort = useCallback((key: SortKey) => {
    setSort((current) =>
      current.key === key
        ? { key, dir: current.dir === "asc" ? "desc" : "asc" }
        : { key, dir: key === "symbol" ? "asc" : "desc" },
    );
  }, []);

  const years = data?.years ?? [];

  const setups = useMemo(() => {
    if (!data) return [];
    return Array.from(
      new Set(data.results.map((r) => r.setup).filter((s): s is string => Boolean(s))),
    ).sort();
  }, [data]);

  // Every number below reads MAE at the chosen breakeven trigger.
  const views = useMemo(
    () => (data ? data.results.map((r) => withBreakeven(r, trigger)) : []),
    [data, trigger],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return views.filter((r) => {
      if (year !== null && new Date(r.entryDate).getFullYear() !== year) return false;
      if (setup !== "all" && r.setup !== setup) return false;
      if (outcome !== "ALL" && r.outcome !== outcome) return false;
      if (q && !r.symbol.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [views, year, setup, outcome, query]);

  const sorted = useMemo(() => [...filtered].sort((a, b) => compareRows(a, b, sort)), [filtered, sort]);

  // What the breakeven setting is doing right now, so a switch that moves only a
  // handful of rows is visibly doing something.
  const breakevenEffect = useMemo(() => {
    const stale = data ? data.results.some((r) => !r.preBreakeven) : false;
    const covered = filtered.filter((r) => r.covered);
    return {
      stale,
      total: covered.length,
      reached: covered.filter((r) => r.breakevenAt !== null).length,
      lowered: covered.filter(
        (r) => r.maeFullR !== null && r.maeR !== null && r.maeFullR - r.maeR > 0.005,
      ).length,
    };
  }, [data, filtered]);

  /** The table as it stands - filters, sort and breakeven trigger - saved as CSV. */
  const downloadCsv = useCallback(() => {
    const blob = new Blob([excursionsToCsv(sorted, trigger)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `SS_MAE-MFE_BE${trigger}R_${format(new Date(), "yyyy-MM-dd")}.csv`;
    link.click();
    // Revoked on the next tick: some browsers start the download asynchronously.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }, [sorted, trigger]);

  // From what is on screen, so the cards move with the setup / outcome / search
  // filters the way the charts and table already do.
  // Stats and charts judge finished trades; open ones are only in the table.
  const closedFiltered = useMemo(() => filtered.filter((r) => r.outcome !== "OPEN"), [filtered]);

  const summary = useMemo(
    () => (closedFiltered.length > 0 ? summarizeExcursions(closedFiltered) : null),
    [closedFiltered],
  );

  const maeDistribution = useMemo(() => buildDistribution(closedFiltered, "maeR"), [closedFiltered]);
  const mfeDistribution = useMemo(() => buildDistribution(closedFiltered, "mfeR"), [closedFiltered]);

  const peak = useMemo(() => {
    const winners: PeakPoint[] = [];
    const losers: PeakPoint[] = [];
    let top = 1;
    for (const r of filtered) {
      if (!r.covered || r.actualR === null || r.mfeR === null) continue;
      const point: PeakPoint = {
        symbol: r.symbol,
        actualR: r.actualR,
        mfeR: r.mfeR,
        capturePct: r.capturePct,
        outcome: r.outcome,
      };
      top = Math.max(top, r.mfeR, r.actualR);
      if (r.outcome === "WIN") winners.push(point);
      else if (r.outcome === "LOSS") losers.push(point);
    }
    return { winners, losers, top: Math.ceil(top) };
  }, [filtered]);

  const insights = useMemo(() => {
    if (!summary || summary.winners + summary.losers === 0) return null;
    const items: { tone: "good" | "warn" | "bad"; text: string }[] = [];
    const winnersCount = summary.winners;
    const losersCount = summary.losers;

    if (winnersCount > 0) {
      const keptShare = summary.winnersAboveHalfMfe / winnersCount;
      if (keptShare < 0.25) {
        items.push({
          tone: "bad",
          text: `Only ${Math.round(keptShare * 100)}% of winners kept more than half their peak move — most of your winners give back a large part of the run before you exit. Review your exit plan (trail or take-profit) before the next winner.`,
        });
      } else if (keptShare < 0.5) {
        items.push({
          tone: "warn",
          text: `${Math.round(keptShare * 100)}% of winners captured more than half of their MFE — a meaningful share of peak profit is given back. Consider a tighter trail than your current exit.`,
        });
      } else {
        items.push({
          tone: "good",
          text: `${Math.round(keptShare * 100)}% of winners kept more than half their peak move — exits are efficient.`,
        });
      }
    }

    if (summary.winnersHitStop > 0) {
      items.push({
        tone: "warn",
        text: `${summary.winnersHitStop} winner(s) touched your stop level and still recovered — the stop is being tested on trades that work. A slightly wider stop or a later entry could keep these on the right side.`,
      });
    }

    // Reached the breakeven trigger, yet the trade as a whole closed red: the
    // breakeven stop was never placed, not honoured, or slipped.
    const gaveBackBreakeven = filtered.filter(
      (r) => r.breakevenAt !== null && r.outcome === "LOSS",
    ).length;
    if (gaveBackBreakeven > 0) {
      items.push({
        tone: "bad",
        text: `${gaveBackBreakeven} trade(s) reached +${trigger}R — your breakeven point — and still closed red. The stop never made it to breakeven, or slipped past it; that is the most expensive habit on the chart.`,
      });
    }

    const bigHeatWinners = filtered.filter(
      (r) =>
        r.outcome === "WIN" &&
        r.maeR !== null &&
        r.maeR >= 0.75 &&
        r.actualR !== null &&
        r.actualR < 0.5,
    ).length;
    if (bigHeatWinners > 0) {
      items.push({
        tone: "warn",
        text: `${bigHeatWinners} winner(s) went ≥0.75R against you yet closed under 0.5R — deep heat for a small gain. Check timing or reduce size on these.`,
      });
    }

    if (losersCount > 0 && winnersCount > 0 && summary.avgLoserMaeR !== null) {
      if (summary.avgLoserMaeR > 1.15) {
        items.push({
          tone: "bad",
          text: `Losers average ${fmtR(summary.avgLoserMaeR)}R of heat — well past the 1R stop. Stops are being moved, skipped or gapped through; a loss bigger than planned is the costliest leak there is.`,
        });
      } else if (summary.avgLoserMaeR >= 0.9) {
        items.push({
          tone: "good",
          text: `Losers average ${fmtR(summary.avgLoserMaeR)}R of heat — they are stopped out at the stop, not knifed past it. Stop discipline is working.`,
        });
      } else {
        items.push({
          tone: "warn",
          text: `Losers average only ${fmtR(summary.avgLoserMaeR)}R of heat — trades are being cut before reaching the stop. If some later recover, the stop may sit inside normal noise.`,
        });
      }
    }

    if (summary.heatRatio !== null) {
      if (summary.heatRatio >= 1) {
        items.push({
          tone: "bad",
          text: `Heat ratio ${fmtR(summary.heatRatio)}x — every ₹1 earned cost at least ₹1 of open drawdown. Widen targets or tighten entries; the account is absorbing risk the results do not justify.`,
        });
      } else if (summary.heatRatio <= 0.5) {
        items.push({
          tone: "good",
          text: `Heat ratio ${fmtR(summary.heatRatio)}x — more than ₹2 of return for every ₹1 of open drawdown. Risk-to-heat is healthy.`,
        });
      }
    }

    return items;
  }, [summary, filtered, trigger]);

  const tokenCard = (
    <div className="rounded-xl border border-line bg-white p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
        <div className="flex-1">
          <DhanTokenField
            id="mae-mfe-dhan-token"
            accessToken={accessToken}
            onChange={setAccessToken}
            expiresAt={expiresAt}
            onForget={forget}
          />
        </div>
        <button
          onClick={() => void update()}
          disabled={updating || !accessToken.trim()}
          className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full bg-accent px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:opacity-90 disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${updating ? "animate-spin" : ""}`} />
          {updating
            ? progress
              ? `Measuring… ${progress.measured} done, ${progress.remaining} symbol${progress.remaining === 1 ? "" : "s"} left`
              : "Measuring…"
            : "Update from Dhan"}
        </button>
      </div>
      <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
        Measured on Dhan 1-minute bars, from the minute you entered to the minute you exited, and
        saved on each trade: a closed trade is measured once, open positions are refreshed after
        every Dhan sync and EOD price update. Update measures whatever is new or changed (the Dhan
        account needs the Data API).
      </p>
      {data && data.missing > 0 && (
        <p className="mt-2 text-[11px] font-medium text-amber-700">
          {data.missing} trade{data.missing === 1 ? " is" : "s are"} not measured yet, or changed
          since — new or edited closed trades, and open positions whose fills moved. Click Update
          from Dhan to measure {data.missing === 1 ? "it" : "them"}.
        </p>
      )}
    </div>
  );

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-400">
        <RefreshCw className="h-4 w-4 animate-spin" />
        Loading saved MAE / MFE…
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-600">
          {error}
          <button
            onClick={() => void load(year)}
            className="ml-3 inline-flex items-center gap-1 font-medium underline underline-offset-2"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Retry
          </button>
        </div>
        {tokenCard}
      </div>
    );
  }

  if (!data) return tokenCard;

  if (data.results.length === 0) {
    return (
      <div className="space-y-4">
        {tokenCard}
        <div className="flex flex-col items-center gap-1 py-12 text-sm text-slate-400">
          {data.missing > 0 ? (
            <span>
              Nothing measured yet — paste your Dhan token above and click Update from Dhan.
            </span>
          ) : year !== null ? (
            <>
              <span className="font-medium text-slate-600">No closed positions for {year}.</span>
              <span>Switch year or compute across all years.</span>
            </>
          ) : (
            <span>No closed positions to analyse.</span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {tokenCard}

      {/* Filters */}
      <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium uppercase tracking-wider text-slate-400">Year</span>
          <button
            onClick={() => setYear(null)}
            className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
              year === null
                ? "bg-accent text-white shadow-sm"
                : "border border-line bg-white text-slate-500 hover:border-accent hover:text-accent"
            }`}
          >
            All
          </button>
          {years.map((y) => (
            <button
              key={y}
              onClick={() => setYear(y)}
              className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
                year === y
                  ? "bg-accent text-white shadow-sm"
                  : "border border-line bg-white text-slate-500 hover:border-accent hover:text-accent"
              }`}
            >
              {y}
            </button>
          ))}
        </div>

        <select
          value={setup}
          onChange={(e) => setSetup(e.target.value)}
          className="rounded-full border border-line bg-white px-3 py-1.5 text-xs font-medium text-slate-600 focus:border-accent focus:outline-none"
        >
          <option value="all">All setups</option>
          {setups.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>

        <div className="flex items-center gap-1 rounded-full border border-line bg-white p-1">
          {OUTCOME_FILTERS.map((key) => (
            <button
              key={key}
              onClick={() => setOutcome(key)}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                outcome === key
                  ? key === "WIN"
                    ? "bg-emerald-600 text-white shadow-sm"
                    : key === "LOSS"
                      ? "bg-red-500 text-white shadow-sm"
                      : "bg-slate-700 text-white shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {key === "ALL"
                ? "All results"
                : key === "WIN"
                  ? "Winners"
                  : key === "LOSS"
                    ? "Losers"
                    : key === "OPEN"
                      ? "Open"
                      : "Breakeven"}
            </button>
          ))}
        </div>

        <div
          className="flex items-center gap-1 rounded-full border border-line bg-white p-1"
          title="MAE counts only until the trade first moves this far in your favour from the first entry — the point your stop goes to breakeven"
        >
          <span className="pl-2 pr-1 text-[11px] font-medium text-slate-400">Breakeven at</span>
          {BREAKEVEN_TRIGGERS.map((value) => (
            <button
              key={value}
              onClick={() => setTrigger(value)}
              className={`rounded-full px-2.5 py-1 text-xs font-semibold transition ${
                trigger === value ? "bg-slate-700 text-white shadow-sm" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {value}R
            </button>
          ))}
        </div>

        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search symbol…"
            className="w-44 rounded-full border border-line bg-white py-1.5 pl-8 pr-3 text-xs font-medium text-slate-700 placeholder:text-slate-400 focus:border-accent focus:outline-none"
          />
        </div>
      </div>

      {breakevenEffect.stale ? (
        <p className="text-[11px] font-medium text-amber-700">
          These results were measured before the breakeven setting existed, so changing it does
          nothing yet — click Update from Dhan to apply it.
        </p>
      ) : (
        <p className="text-[11px] text-slate-500">
          At +{trigger}R: {breakevenEffect.reached} of {breakevenEffect.total} trades reached
          breakeven · MAE is lower than the whole-trade MAE on {breakevenEffect.lowered}. Trades that
          never got there keep their full MAE — their risk was live to the exit.
        </p>
      )}

      {/* Legend */}
      <p className="text-xs leading-relaxed text-slate-500">
        <span className="font-semibold text-slate-600">MAE</span> = worst move against you from entry until
        the trade first reached +{trigger}R (where the stop goes to breakeven), in R of the initial stop — a
        stopped-out trade reads ≈1.0. Dips after that are no longer risk to the initial stop; they show up in
        Captured. · <span className="font-semibold text-slate-600">MFE</span>{" "}
        = best favourable move while open ·{" "}
        <span className="font-semibold text-slate-600">Captured</span> = realized ÷ MFE — the share of the
        peak move kept. Your own fill prices always count as part of the range.
      </p>

      {summary && (
        <CollapsibleSection title="Summary" open={summaryOpen} onToggle={toggleSummary}>
        <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
          <StatCard
            label="Capture rate"
            value={fmtPct(summary.capturePct)}
            sub={`${summary.winners} winning / ${summary.losers} losing trades`}
            color="text-accent"
          />
          <StatCard
            label="Avg winner MFE"
            value={`${fmtR(summary.avgWinnerMfeR)}R`}
            sub={`${fmtAmount(summary.avgWinnerMfeAmount)} peak`}
          />
          <StatCard
            label="Avg winner MAE"
            value={`${fmtR(summary.avgWinnerMaeR)}R`}
            sub={`${fmtAmount(summary.avgWinnerMaeAmount)} heat`}
            color="text-amber-600"
          />
          <StatCard
            label="Heat ratio"
            value={summary.heatRatio === null ? "—" : `${fmtR(summary.heatRatio)}x`}
            sub="Σ winner MAE ₹ ÷ Σ winner profit ₹ — <0.5 clean, >1 you sweat for the win"
            color={summary.heatRatio !== null && summary.heatRatio >= 1 ? "text-red-500" : summary.heatRatio !== null && summary.heatRatio >= 0.5 ? "text-amber-600" : "text-emerald-600"}
          />
          <StatCard
            label="Winners that hit stop"
            value={`${summary.winnersHitStop} / ${summary.winnersWithStop}`}
            sub="winners with a stop set that reached ≥98% of it"
            color={summary.winnersHitStop > 0 ? "text-amber-600" : "text-emerald-600"}
          />
          <StatCard
            label="Winners kept half of peak"
            value={`${summary.winnersAboveHalfMfe} / ${summary.winners}`}
            sub="winners that captured >50% of their MFE"
            color={summary.winners > 0 && summary.winnersAboveHalfMfe / summary.winners < 0.5 ? "text-amber-600" : "text-emerald-600"}
          />
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
          <StatCard
            label="MFE ÷ MAE (win)"
            value={fmtR(summary.mfeMaeRatio)}
            sub="avg winner MFE(R) ÷ avg winner MAE(R) — >2 healthy, <1 fights before working"
          />
          <StatCard
            label="Avg loser MAE"
            value={`${fmtR(summary.avgLoserMaeR)}R`}
            sub="≈1 = stopped out"
            color="text-red-500"
          />
          <StatCard
            label="Stopped out"
            value={fmtPct(summary.stoppedOutRate)}
            sub="losers with a stop set that reached ≥98% of it"
            color="text-red-500"
          />
          <StatCard
            label="Captured (aggregate)"
            value={fmtPct(summary.captureAggregatePct)}
            sub="Σ realized ÷ Σ MFE across winners"
          />
        </div>

      {summary.withoutStop > 0 && (
        <p className="text-[11px] text-amber-700">
          {summary.withoutStop} trade{summary.withoutStop === 1 ? " has" : "s have"} no stop set, so
          {summary.withoutStop === 1 ? " its" : " their"} R uses a 3% default stop. They are left out
          of the stop-hit counts.
        </p>
      )}
        </div>
        </CollapsibleSection>
      )}

      {/* What to work on */}
      {insights && insights.length > 0 && (
        <CollapsibleSection
          title="What to work on — from your own excursion data"
          open={insightsOpen}
          onToggle={toggleInsights}
        >
        <div className="rounded-xl border border-line bg-white p-4">
          <ul className="flex flex-col gap-2">
            {insights.map((insight, idx) => (
              <li key={idx} className="flex items-start gap-2 text-xs leading-relaxed">
                <span
                  className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white ${
                    insight.tone === "good"
                      ? "bg-emerald-500"
                      : insight.tone === "warn"
                        ? "bg-amber-500"
                        : "bg-red-500"
                  }`}
                >
                  {insight.tone === "good" ? "✓" : "!"}
                </span>
                <span className={insight.tone === "good" ? "text-slate-600" : "text-slate-700"}>
                  {insight.text}
                </span>
              </li>
            ))}
          </ul>
        </div>
        </CollapsibleSection>
      )}

      {/* Symbols Dhan could not measure - listed, never filled in from elsewhere */}
      {refreshProblems.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-800 space-y-2">
          {refreshProblems.map((problem) => (
            <div key={problem.symbol} className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                <span className="font-semibold">{problem.symbol}</span> — {problem.reason}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Per-trade table: the trade, then MFE, then MAE; the rest behind "Show details" */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={toggleTable}
            aria-expanded={tableOpen}
            className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-slate-500 transition hover:text-ink"
          >
            {tableOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            Per-trade breakdown
          </button>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] text-slate-400">
              {filtered.length.toLocaleString("en-IN")} of {data.results.length.toLocaleString("en-IN")} trades
              {tableOpen ? " · click a column to sort" : ""}
            </span>
            {tableOpen && (
            <button
              type="button"
              onClick={() => setShowDetails((shown) => !shown)}
              className="inline-flex items-center gap-1.5 rounded-full border border-line bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:border-accent hover:text-accent"
              title="Result, side, last exit, SL %, where MFE and MAE printed, full-trade MAE, when breakeven was reached, and the data check"
            >
              {showDetails ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              {showDetails ? "Hide details" : "Show details"}
            </button>
            )}
            <button
              type="button"
              onClick={downloadCsv}
              disabled={sorted.length === 0}
              className="inline-flex items-center gap-1.5 rounded-full border border-line bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:border-accent hover:text-accent disabled:opacity-50"
              title="Date, stock, entry, SL, MFE and MAE for these rows, in this order"
            >
              <Download className="h-3.5 w-3.5" /> Download CSV
            </button>
          </div>
        </div>
        {tableOpen && (
        <div className="overflow-x-auto rounded-xl border border-line bg-white">
          <table className={`${showDetails ? "min-w-[1480px]" : "min-w-[860px]"} w-full text-xs`}>
            <thead>
              <tr className="border-b border-line bg-slate-50 text-[10px] font-semibold uppercase tracking-wider">
                <th colSpan={5} className="px-3 py-1.5 text-left text-slate-400">
                  Trade
                </th>
                <th colSpan={4} className={`${GROUP_EDGE} px-3 py-1.5 text-center text-emerald-700`}>
                  MFE — how far it ran for you
                </th>
                <th colSpan={2} className={`${GROUP_EDGE} px-3 py-1.5 text-center text-red-600`}>
                  MAE — heat before +{trigger}R
                </th>
                {showDetails && (
                  <th colSpan={DETAIL_COLUMNS} className={`${GROUP_EDGE} px-3 py-1.5 text-left text-slate-400`}>
                    Details
                  </th>
                )}
              </tr>
              <tr className="border-b border-line bg-slate-100 text-slate-600">
                <th className="px-3 py-2.5 text-right font-semibold" title="Row number, in the current sort">
                  #
                </th>
                <SortHeader label="Date" sortKey="date" sort={sort} onSort={toggleSort} align="left" />
                <SortHeader label="Symbol" sortKey="symbol" sort={sort} onSort={toggleSort} align="left" />
                <SortHeader label="Entry" sortKey="entry" sort={sort} onSort={toggleSort} title="First entry price" />
                <SortHeader label="SL%" sortKey="slPct" sort={sort} onSort={toggleSort} title="Stop distance as % of entry — the initial risk every R is measured against" />
                <SortHeader label="MFE%" sortKey="mfePct" sort={sort} onSort={toggleSort} className={GROUP_EDGE} title="Best move while open, % of entry" />
                <SortHeader label="MFE(R)" sortKey="mfeR" sort={sort} onSort={toggleSort} title="Best move while open, x stop distance" />
                <SortHeader label="Exit(R)" sortKey="actualR" sort={sort} onSort={toggleSort} title="What you booked, x stop distance. Open trades: booked plus unrealized at the last EOD price, so far" />
                <SortHeader label="Captured" sortKey="capture" sort={sort} onSort={toggleSort} title="Booked ÷ MFE — the share of the peak move kept" />
                <SortHeader label="MAE%" sortKey="maePct" sort={sort} onSort={toggleSort} className={GROUP_EDGE} title={`Worst move against you before reaching +${trigger}R, % of entry`} />
                <SortHeader label="MAE(R)" sortKey="maeR" sort={sort} onSort={toggleSort} title={`Worst move against you before reaching +${trigger}R, x stop distance`} />
                {showDetails && (
                  <>
                    <SortHeader label="Result" sortKey="outcome" sort={sort} onSort={toggleSort} className={GROUP_EDGE} />
                    <th className="px-3 py-2.5 text-right font-semibold">Type</th>
                    <SortHeader label="Exit" sortKey="exit" sort={sort} onSort={toggleSort} title="Last exit price" />
                    <SortHeader label="SL" sortKey="stop" sort={sort} onSort={toggleSort} title="Stop loss price" />
                    <th className="px-3 py-2.5 text-right font-semibold" title="The price that set the MFE, and the minute it printed">
                      MFE at
                    </th>
                    <th className="px-3 py-2.5 text-right font-semibold" title={`The price that set the MAE before +${trigger}R, and the minute it printed`}>
                      MAE at
                    </th>
                    <SortHeader label="MAE full(R)" sortKey="maeFullR" sort={sort} onSort={toggleSort} title="Worst point over the whole trade, including after breakeven, x stop distance" />
                    <th className="px-3 py-2.5 text-right font-semibold" title={`The minute the trade first reached +${trigger}R from the first entry. — means it never did, so MAE runs to the exit`}>
                      BE at
                    </th>
                    <th
                      className="px-3 py-2.5 text-center font-semibold"
                      title="1m = Dhan minute bars from your entry minute to your exit minute; 1m* = a stored time was 5h30m off and was corrected; 1m ~day = a stored time could not be matched, so that whole day was used; mismatch = the bars do not match your fill price"
                    >
                      Bars
                    </th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {sorted.map((row, index) => {
                const note = barsNote(row);
                return (
                  <tr key={row.id} className="border-b border-slate-100 odd:bg-white even:bg-slate-50 hover:bg-slate-100/50">
                    <td className="px-3 py-2 text-right tabular-nums text-slate-400">{index + 1}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-left tabular-nums text-slate-500">
                      {format(new Date(row.entryDate), "dd MMM yy")}
                    </td>
                    <td className="px-3 py-2 text-left font-medium text-slate-700">
                      {row.symbol}
                      {row.outcome === "OPEN" && (
                        <div
                          className="text-[10px] font-normal text-sky-600"
                          title="Still held: measured from entry to the last refresh, and refreshed after each Dhan sync and EOD price update"
                        >
                          open{row.measuredAt ? ` · as of ${fmtAt(row.measuredAt)}` : ""}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-600">{formatPrice(row.firstEntryPrice)}</td>
                    <td
                      className={`px-3 py-2 text-right tabular-nums ${row.usedDefaultStopLoss ? "italic text-slate-400" : "text-slate-600"}`}
                      title={row.usedDefaultStopLoss ? "No stop set — a 3% default stop is used for R" : undefined}
                    >
                      {fmtPct(row.slPct)}
                    </td>
                    <td className={`${GROUP_EDGE} px-3 py-2 text-right tabular-nums text-emerald-600`}>{fmtPct(row.mfePct)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-emerald-600">{fmtR(row.mfeR)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-700">{fmtR(row.actualR)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-700">{fmtPct(row.capturePct)}</td>
                    <td className={`${GROUP_EDGE} px-3 py-2 text-right tabular-nums text-red-500`}>{fmtPct(row.maePct)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-red-500">{fmtR(row.maeR)}</td>
                    {showDetails && (
                      <>
                        <td className={`${GROUP_EDGE} px-3 py-2 text-right font-semibold tabular-nums ${outcomeClass(row.outcome)}`}>
                          {row.outcome}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          <span
                            className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                              row.tradeType === "LONG" ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"
                            }`}
                          >
                            {row.tradeType}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-slate-600">
                          {row.lastExitPrice === null ? "—" : formatPrice(row.lastExitPrice)}
                        </td>
                        <td
                          className={`px-3 py-2 text-right tabular-nums ${row.usedDefaultStopLoss ? "italic text-slate-400" : "text-slate-600"}`}
                          title={row.usedDefaultStopLoss ? "No stop set — a 3% default stop is used for R" : undefined}
                        >
                          {row.stopLoss === null ? "—" : formatPrice(row.stopLoss)}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                          <div className="text-slate-700">{row.mfeLevel === null ? "—" : formatPrice(row.mfeLevel)}</div>
                          <div className="text-[10px] text-slate-400">{fmtAt(row.mfeAt)}</div>
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                          <div className="text-slate-700">{row.maeLevel === null ? "—" : formatPrice(row.maeLevel)}</div>
                          <div className="text-[10px] text-slate-400">{fmtAt(row.maeAt)}</div>
                        </td>
                        <td
                          className="px-3 py-2 text-right tabular-nums text-slate-500"
                          title={
                            row.maeFullLevel === null
                              ? undefined
                              : `${formatPrice(row.maeFullLevel)} on ${fmtAt(row.maeFullAt)}`
                          }
                        >
                          {fmtR(row.maeFullR)}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-slate-500">
                          {row.breakevenAt ? fmtAt(row.breakevenAt) : "—"}
                        </td>
                        <td className="px-3 py-2 text-center">
                          <span
                            className={`inline-block whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-semibold ${note.tone}`}
                            title={note.title}
                          >
                            {note.label}
                          </span>
                        </td>
                      </>
                    )}
                  </tr>
                );
              })}
              {sorted.length === 0 && (
                <tr>
                  <td
                    colSpan={MAIN_COLUMNS + (showDetails ? DETAIL_COLUMNS : 0)}
                    className="px-3 py-10 text-center text-slate-400"
                  >
                    No trades match the filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        )}
      </div>

      {/* Three charts: stop, target, exit */}
      {peak.winners.length + peak.losers.length > 0 && (
        <CollapsibleSection title="Charts" open={chartsOpen} onToggle={toggleCharts}>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <ChartCard
            title="MAE(R) — where the stop belongs"
            note={`How far trades went against you after entry and before reaching +${trigger}R. Green bars well left of 1R mean winners rarely need the full stop; green bars at 0.75–1R mean the stop is being tested by trades that work. Red bars past 1R are losses bigger than planned.`}
          >
            <DistributionChart data={maeDistribution} />
          </ChartCard>

          <ChartCard
            title="MFE(R) — where targets belong"
            note="How far trades ran in your favour. A target pays when most green bars reach it. Red bars at 1R or more are losers that were in profit first — the case for a breakeven or trailing rule."
          >
            <DistributionChart data={mfeDistribution} />
          </ChartCard>

          <div className="lg:col-span-2">
            <ChartCard
              title="Peak vs booked — did you keep the move?"
              note="Each dot is a trade: how far it ran (up) against what you booked (across). On the diagonal you kept the whole move; far above it you gave most of it back; left of 0 the trade was up and still closed red."
            >
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <ScatterChart margin={{ top: 8, right: 14, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis
                      type="number"
                      dataKey="actualR"
                      name="Booked R"
                      domain={["auto", "auto"]}
                      tick={{ fontSize: 9, fill: "#94a3b8" }}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(value) => `${value}R`}
                    />
                    <YAxis
                      type="number"
                      dataKey="mfeR"
                      name="Peak R"
                      domain={[0, (dataMax: number) => Math.max(1, Math.ceil(dataMax * 1.1))]}
                      tick={{ fontSize: 9, fill: "#94a3b8" }}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(value) => `${value}R`}
                    />
                    <ReferenceLine x={0} stroke="#94a3b8" />
                    <ReferenceLine
                      segment={[
                        { x: 0, y: 0 },
                        { x: peak.top, y: peak.top },
                      ]}
                      stroke="#cbd5e1"
                      strokeDasharray="4 4"
                      ifOverflow="extendDomain"
                    />
                    <Tooltip content={<PeakTooltip />} cursor={{ strokeDasharray: "3 3", stroke: "#cbd5e1" }} />
                    <Scatter name="Winners" data={peak.winners} fill={PROFIT} fillOpacity={0.75} />
                    <Scatter name="Losers" data={peak.losers} fill={LOSS} fillOpacity={0.75} />
                  </ScatterChart>
                </ResponsiveContainer>
              </div>
            </ChartCard>
          </div>
        </div>
        </CollapsibleSection>
      )}

    </div>
  );
}
