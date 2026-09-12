/**
 * MAE / MFE (Maximum Adverse / Favorable Excursion)
 * ─────────────────────────────────────────────────────────────────────
 * How much did a trade go AGAINST you before recovering (MAE), and how much
 * did it go IN YOUR FAVOR at its best (MFE)? Both are measured on Dhan's
 * 1-minute bars while the position was open, independent of the final P&L -
 * a winner can still have a deep MAE, a loser can still print a decent MFE.
 *
 *   Long:  MFE = (highest high − entry) × qty     Short:  MFE = (entry − lowest low) × qty
 *          MAE = (entry − lowest low) × qty              MAE = (highest high − entry) × qty
 *
 * Both are magnitudes (positive). Quoted in R they normalise against initial
 * risk, so a loser that was stopped out has MAE(R) ≈ 1.0, and a winner that
 * never retraced more than a quarter of its stop sits around 0.25.
 *
 *   Capture rate = realized P&L ÷ MFE      (how much of the peak move was kept)
 *   MFE ÷ MAE     (on winners: did the trade work before or after adversity?)
 *
 * Window: from the minute of the entry to the minute of the exit. A minute bar
 * counts when most of it lay inside the position: a fill at 09:21:58 leaves the
 * 09:21 bar out (its low was probably the dip you bought, not heat you took) and
 * starts at 09:22. Same at the exit. The fill prices themselves always count, so
 * a long exited at 95 went to 95, whatever the bars say.
 *
 * MAE before breakeven: once a trade has run +N R from the first entry the stop
 * goes to breakeven, and a dip after that is no longer risk to the initial
 * stop. For each trigger in BREAKEVEN_TRIGGERS the MAE is also measured only
 * from the entry to the first minute that reaches it (that minute's low still
 * counts - a minute bar cannot say which came first). A trade that never got
 * there keeps its full MAE: its risk was live to the exit.
 *
 * Every result carries the price and minute of its MAE and MFE extremes, so any
 * number here can be checked against a chart.
 * ─────────────────────────────────────────────────────────────────────
 */

import type { GroupedTradeRow } from "@/lib/trade-utils";

/** Mirrors the journal's getRiskProfile: 3% stop width where none was set. */
const DEFAULT_STOP_PCT = 0.03;

/**
 * Results are stored on the trade and reused, so any change to how they are
 * computed must move this on - every stored result then counts as stale and is
 * measured again on the next update.
 */
export const EXCURSION_VERSION = 4;

/** OPEN: still held - measured from entry to now, and re-measured on each refresh. */
export type ExcursionOutcome = "WIN" | "LOSS" | "BREAKEVEN" | "OPEN";

export type ExcursionResult = {
  id: string;
  symbol: string;
  /** Dhan's exchange ticker, e.g. "AVALON.NS". */
  quoteSymbol: string | null;
  tradeType: "LONG" | "SHORT";
  entryDate: string;
  exitDate: string | null;
  /** Quantity-weighted average entry - the base every excursion is measured from. */
  entryPrice: number;
  /** Quantity-weighted average exit. */
  exitPrice: number;
  /** The first entry order's price - where the trade began. */
  firstEntryPrice: number;
  /** The last exit order's price - where the trade ended. null: still open, nothing sold yet. */
  lastExitPrice: number | null;
  qty: number;
  realizedPnl: number;
  setup: string | null;
  stopLoss: number | null;
  usedDefaultStopLoss: boolean;
  riskPerShare: number;
  riskAmount: number;
  /** false when no usable bars were fetched, or they do not match the fills. */
  covered: boolean;
  /** Minute bars inside the entry → exit window. */
  candleCount: number;
  /** Per-share favourable distance (price units). null when uncovered. */
  mfePrice: number | null;
  /** Per-share adverse distance (price units). null when uncovered. */
  maePrice: number | null;
  mfeAmount: number | null;
  maeAmount: number | null;
  mfeR: number | null;
  maeR: number | null;
  actualR: number | null;
  /** Full trade run as % of entry price (favourable). null when uncovered. */
  mfePct: number | null;
  /** Worst adverse move as % of entry price. null when uncovered. */
  maePct: number | null;
  /** Stop distance as % of entry price (3.0 for the default stop). */
  slPct: number | null;
  /** realized ÷ MFE, as 0–100. Only where both sides exist. null otherwise. */
  capturePct: number | null;
  outcome: ExcursionOutcome;
  /** The price that set the MAE, and when (bar start, or the fill's own time). */
  maeLevel: number | null;
  maeAt: string | null;
  /** The price that set the MFE, and when. */
  mfeLevel: number | null;
  mfeAt: string | null;
  /** How the stored entry / exit time held up against the minute bars. */
  entryTimeCheck: TimeCheck;
  exitTimeCheck: TimeCheck;
  /**
   * The entry fill price never traded on the entry day in these bars: the
   * series is on another price scale (split/bonus adjusted) or is a different
   * company. Such a trade is left uncovered rather than measured wrongly.
   */
  priceMismatch: boolean;
  /**
   * What Dhan's bars were multiplied by to match the trade's prices - 3 when a
   * 2:1 bonus came after the trade. 1 when they matched as they were.
   */
  priceScale: number;
  /** MAE measured only until the trade first reached each breakeven trigger. */
  preBreakeven: Record<BreakevenKey, PreBreakevenMae>;
};

/** Moves in R, from the first entry, at which the stop goes to breakeven. */
export const BREAKEVEN_TRIGGERS = [1, 1.5, 2, 3] as const;
export type BreakevenTrigger = (typeof BREAKEVEN_TRIGGERS)[number];
type BreakevenKey = `${BreakevenTrigger}`;

export type PreBreakevenMae = {
  maePrice: number | null;
  maeAmount: number | null;
  maeR: number | null;
  maePct: number | null;
  maeLevel: number | null;
  maeAt: string | null;
  /** When the trade first reached the trigger. null: it never did, so risk was live to the exit. */
  breakevenAt: string | null;
};

const EMPTY_PRE_BREAKEVEN: PreBreakevenMae = {
  maePrice: null,
  maeAmount: null,
  maeR: null,
  maePct: null,
  maeLevel: null,
  maeAt: null,
  breakevenAt: null,
};

/** One minute bar, [start, end) in epoch ms. */
export type PriceBar = { start: number; end: number; high: number; low: number };

/**
 * ok         the fill price traded within two minutes of the stored time
 * shifted    it traded 5h30m earlier instead - the time was stored as IST
 *            wall-clock read as UTC (server-side imports), and is corrected
 * unverified neither; the stored time is not trusted and that whole session
 *            is used for this side of the trade
 */
export type TimeCheck = "ok" | "shifted" | "unverified";

function avg(values: number[]) {
  return values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

// Asia/Kolkata is UTC+5:30 and fixed (no DST), so a constant offset is exact.
export const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
export const DAY_MS = 24 * 60 * 60 * 1000;
const MINUTE_MS = 60_000;
/** How far from the stored time a fill may sit and still count as that minute. */
const FILL_SLACK_MS = 2 * MINUTE_MS;

/** The instant IST midnight begins for the IST day containing `ms`. */
export function istMidnight(ms: number) {
  const date = new Date(ms + IST_OFFSET_MS);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) - IST_OFFSET_MS;
}

/** Price ticks are 0.05; a consolidated leg is a weighted average, so allow a hair either side. */
function fillTolerance(price: number) {
  return Math.max(0.05, price * 0.0005);
}

function barTraded(bar: PriceBar, price: number) {
  const tolerance = fillTolerance(price);
  return bar.low - tolerance <= price && price <= bar.high + tolerance;
}

/**
 * Where a fill really happened, judged by whether its price traded in the
 * minute bars around the stored time. Manual and CSV rows imported on the
 * server carry IST wall-clock stored as UTC, which lands them 5h30m late -
 * often after the close - and cutting the window there would throw away the
 * whole move. The price, not the timestamp, is the evidence.
 */
function locateFill(bars: PriceBar[], at: number, price: number): { at: number; check: TimeCheck } {
  const tradedNear = (t: number) =>
    bars.some((bar) => bar.end > t - FILL_SLACK_MS && bar.start <= t + FILL_SLACK_MS && barTraded(bar, price));

  if (tradedNear(at)) return { at, check: "ok" };
  if (tradedNear(at - IST_OFFSET_MS)) return { at: at - IST_OFFSET_MS, check: "shifted" };
  return { at, check: "unverified" };
}

/**
 * Price factors a corporate action can leave between Dhan's adjusted history
 * and the prices a trade was made at: a bonus p:q multiplies by (p+q)/q, a
 * split by its ratio, and the two combine. Reverse splits run the other way.
 */
const SCALE_CANDIDATES = (() => {
  const factors = new Set<number>();
  for (let p = 1; p <= 10; p++) {
    for (let q = 1; q <= 10; q++) if (p !== q) factors.add(p / q);
  }
  for (const factor of [12, 15, 20, 25, 50]) {
    factors.add(factor);
    factors.add(1 / factor);
  }
  return [...factors];
})();

/**
 * The factor that puts `bars` on the trade's own price scale - 1 when they
 * already match.
 *
 * A split or bonus after the trade leaves Dhan's history on a different scale
 * (GOODLUCK's June bars read ~503 for fills at 1509: a 2:1 bonus, ×3). Every
 * simple corporate-action factor near the price ratio is tried, and one is
 * only accepted when, rescaled, BOTH the entry and the exit fill trade within
 * two minutes of their stored times (or 5h30m earlier, for times stored late).
 * Anything looser - a whole day's range - would let a wrong factor through.
 * A trade held across the ex-date matches no single factor and stays a mismatch.
 */
function detectPriceScale(
  bars: PriceBar[],
  entryFill: number,
  entryAt: number,
  exitFill: number,
  exitAt: number,
): number {
  const entryDay = istMidnight(entryAt);
  const aroundEntry = bars.filter(
    (bar) => bar.end > entryDay - DAY_MS && bar.start < entryDay + DAY_MS,
  );
  if (aroundEntry.length === 0 || aroundEntry.some((bar) => barTraded(bar, entryFill))) return 1;

  const mids = aroundEntry.map((bar) => (bar.high + bar.low) / 2).sort((a, b) => a - b);
  const ratio = entryFill / mids[Math.floor(mids.length / 2)];

  let best = 1;
  let bestGap = Number.POSITIVE_INFINITY;
  for (const factor of SCALE_CANDIDATES) {
    // A day's range is a few percent; a factor further than ~10% off is not it.
    const gap = Math.abs(Math.log(factor / ratio));
    if (gap > 0.1 || gap >= bestGap) continue;
    const scaled = bars.map((bar) => ({ ...bar, high: bar.high * factor, low: bar.low * factor }));
    if (
      locateFill(scaled, entryAt, entryFill).check !== "unverified" &&
      locateFill(scaled, exitAt, exitFill).check !== "unverified"
    ) {
      best = factor;
      bestGap = gap;
    }
  }
  return best;
}

/**
 * Per-trade MAE/MFE from the minute bars covering its hold.
 *
 * `bars` may cover a wider span than the trade (the API fetches per symbol);
 * this narrows to the entry → exit window described at the top of the file.
 */
export function computeExcursion(row: GroupedTradeRow, bars: PriceBar[]): ExcursionResult {
  const entryPrice = row.weightedEntryPrice;
  const qty = row.totalEntryQty;
  const exitPrice = row.exitPrice;
  const exitDate = row.exitDateTime ? row.exitDateTime.toISOString() : null;
  const entryDate = row.entryLegs[0]?.dateTime.toISOString() ?? new Date().toISOString();

  const usedDefaultStopLoss = !row.stopLoss || row.stopLoss <= 0;
  const stopLoss = usedDefaultStopLoss
    ? row.tradeType === "SHORT"
      ? entryPrice * (1 + DEFAULT_STOP_PCT)
      : entryPrice * (1 - DEFAULT_STOP_PCT)
    : row.stopLoss ?? entryPrice;
  const riskPerShare = entryPrice > 0 ? Math.abs(entryPrice - stopLoss) : 0;
  const riskAmount = riskPerShare * qty;

  const firstEntry = row.entryLegs[0];
  const lastExit = row.exitLegs[row.exitLegs.length - 1];
  const storedEntryAt = firstEntry?.dateTime.getTime() ?? 0;
  // An open position runs to now; there is no exit fill to find yet.
  const isOpen = row.derivedStatus === "OPEN";
  const storedExitAt = !isOpen && row.exitDateTime ? row.exitDateTime.getTime() : Date.now();

  // Only the bars that could matter: from the day before the entry (a shifted
  // time can move back across midnight) through the exit day.
  const held = bars.filter(
    (bar) => bar.end > istMidnight(storedEntryAt) - DAY_MS && bar.start < istMidnight(storedExitAt) + DAY_MS,
  );

  // Dhan's history is adjusted for later splits and bonuses; put the bars back
  // on the price scale the trade was actually made at.
  // An open trade has no final exit to confirm a factor with; its entry does both.
  const priceScale = detectPriceScale(
    held,
    firstEntry?.price ?? entryPrice,
    storedEntryAt,
    isOpen ? firstEntry?.price ?? entryPrice : lastExit?.price ?? exitPrice,
    isOpen ? storedEntryAt : storedExitAt,
  );
  const relevant =
    priceScale === 1
      ? held
      : held.map((bar) => ({ ...bar, high: bar.high * priceScale, low: bar.low * priceScale }));

  const entry = locateFill(relevant, storedEntryAt, firstEntry?.price ?? entryPrice);
  const exit: { at: number; check: TimeCheck } = isOpen
    ? { at: storedExitAt, check: "ok" }
    : locateFill(relevant, storedExitAt, lastExit?.price ?? exitPrice);
  // An untrusted time widens to its whole session - never narrower than the truth.
  const from = entry.check === "unverified" ? istMidnight(entry.at) : entry.at;
  let to = exit.check === "unverified" ? istMidnight(exit.at) + DAY_MS - 1 : exit.at;
  if (to < from) to = from;

  // Did the entry price trade at all that day in this series? If not, the bars
  // describe a different price scale (split/bonus adjusted) or a different
  // company, and every number below would be fiction.
  const entryDay = istMidnight(from);
  const entryDayBars = relevant.filter((bar) => bar.end > entryDay && bar.start < entryDay + DAY_MS);
  const entryFill = firstEntry?.price ?? entryPrice;
  const priceMismatch = entryDayBars.length > 0 && !entryDayBars.some((bar) => barTraded(bar, entryFill));

  let high = Number.NEGATIVE_INFINITY;
  let highAt = 0;
  let low = Number.POSITIVE_INFINITY;
  let lowAt = 0;
  let counts = 0;
  const inside: PriceBar[] = [];

  for (const bar of relevant) {
    // Most of the bar inside the position, or it is out. Minute bars cannot say
    // which side of the fill a move came, and a fill late in its minute would
    // otherwise pull in nearly a minute of pre-entry price.
    const mid = (bar.start + bar.end) / 2;
    if (mid < from || mid > to) continue;
    inside.push(bar);
    if (bar.high > high) {
      high = bar.high;
      highAt = bar.start;
    }
    if (bar.low < low) {
      low = bar.low;
      lowAt = bar.start;
    }
    counts++;
  }

  // A position opened and closed inside one minute has no bar of its own; its
  // fills are its whole range, as long as the day's bars confirm the price scale.
  const covered = (counts > 0 || entryDayBars.length > 0) && entryPrice > 0 && !priceMismatch;

  // Fill times carry the same 5h30m correction as the side they belong to.
  const fills = [
    ...row.entryLegs.map((leg) => ({ leg, shift: entry.check === "shifted" ? IST_OFFSET_MS : 0 })),
    ...row.exitLegs.map((leg) => ({ leg, shift: exit.check === "shifted" ? IST_OFFSET_MS : 0 })),
  ];

  if (covered) {
    for (const { leg, shift } of fills) {
      if (leg.price > high) {
        high = leg.price;
        highAt = leg.dateTime.getTime() - shift;
      }
      if (leg.price < low) {
        low = leg.price;
        lowAt = leg.dateTime.getTime() - shift;
      }
    }
  }

  const isLong = row.tradeType === "LONG";
  const mfePrice = covered ? (isLong ? high - entryPrice : entryPrice - low) : null;
  const maePrice = covered ? (isLong ? entryPrice - low : high - entryPrice) : null;

  const mfeAmount = mfePrice === null ? null : Math.max(0, mfePrice) * qty;
  const maeAmount = maePrice === null ? null : Math.max(0, maePrice) * qty;

  const mfeR = mfeAmount !== null && riskAmount > 0 ? mfeAmount / riskAmount : null;
  const maeR = maeAmount !== null && riskAmount > 0 ? maeAmount / riskAmount : null;
  // Open: what is booked plus what is unrealized at the last EOD price, so far.
  const pnlSoFar = isOpen ? row.pnlAmount : row.realizedPnl;
  const actualR = riskAmount > 0 ? pnlSoFar / riskAmount : null;

  const mfePct = mfePrice !== null && entryPrice > 0 ? (Math.max(0, mfePrice) / entryPrice) * 100 : null;
  const maePct = maePrice !== null && entryPrice > 0 ? (Math.max(0, maePrice) / entryPrice) * 100 : null;
  const slPct = entryPrice > 0 && riskPerShare > 0 ? (riskPerShare / entryPrice) * 100 : null;

  // Capture is a verdict on an exit, so an open trade has none yet.
  let capturePct: number | null = null;
  if (!isOpen && mfeAmount !== null && mfeAmount > 0 && row.realizedPnl > 0) {
    capturePct = (row.realizedPnl / mfeAmount) * 100;
  }

  const outcome: ExcursionOutcome = isOpen
    ? "OPEN"
    : row.realizedPnl > 0
      ? "WIN"
      : row.realizedPnl < 0
        ? "LOSS"
        : "BREAKEVEN";

  const iso = (ms: number) => new Date(ms).toISOString();

  // The risk that was live: every bar and fill in time order, from the entry
  // until the first one that reaches +N R off the first entry. That one still
  // counts its adverse side, since a minute bar cannot say which came first.
  const initialRisk = entryFill > 0 ? Math.abs(entryFill - stopLoss) : 0;
  const timeline = [
    ...inside.map((bar) => ({ at: bar.start, high: bar.high, low: bar.low })),
    ...fills.map(({ leg, shift }) => ({ at: leg.dateTime.getTime() - shift, high: leg.price, low: leg.price })),
  ].sort((a, b) => a.at - b.at);

  const preBreakeven = Object.fromEntries(
    BREAKEVEN_TRIGGERS.map((trigger) => {
      if (!covered || timeline.length === 0) return [String(trigger), EMPTY_PRE_BREAKEVEN];

      const triggerPrice = isLong
        ? entryFill + trigger * initialRisk
        : entryFill - trigger * initialRisk;
      let worst = isLong ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;
      let worstAt = 0;
      let breakevenAt: number | null = null;

      for (const tick of timeline) {
        const adverse = isLong ? tick.low : tick.high;
        if (isLong ? adverse < worst : adverse > worst) {
          worst = adverse;
          worstAt = tick.at;
        }
        if (initialRisk > 0 && (isLong ? tick.high >= triggerPrice : tick.low <= triggerPrice)) {
          breakevenAt = tick.at;
          break;
        }
      }

      const price = Math.max(0, isLong ? entryPrice - worst : worst - entryPrice);
      const amount = price * qty;
      const measured: PreBreakevenMae = {
        maePrice: price,
        maeAmount: amount,
        maeR: riskAmount > 0 ? amount / riskAmount : null,
        maePct: entryPrice > 0 ? (price / entryPrice) * 100 : null,
        maeLevel: worst,
        maeAt: iso(worstAt),
        breakevenAt: breakevenAt === null ? null : iso(breakevenAt),
      };
      return [String(trigger), measured];
    }),
  ) as Record<BreakevenKey, PreBreakevenMae>;

  return {
    id: row.id,
    symbol: row.symbol,
    quoteSymbol: null,
    tradeType: row.tradeType as "LONG" | "SHORT",
    entryDate,
    exitDate,
    entryPrice,
    exitPrice,
    firstEntryPrice: firstEntry?.price ?? entryPrice,
    lastExitPrice: lastExit?.price ?? (isOpen ? null : exitPrice),
    qty,
    realizedPnl: row.realizedPnl,
    setup: row.setup,
    stopLoss,
    usedDefaultStopLoss,
    riskPerShare,
    riskAmount,
    covered,
    candleCount: counts,
    mfePrice,
    maePrice,
    mfeAmount,
    maeAmount,
    mfeR,
    maeR,
    actualR,
    mfePct,
    maePct,
    slPct,
    capturePct,
    outcome,
    maeLevel: covered ? (isLong ? low : high) : null,
    maeAt: covered ? iso(isLong ? lowAt : highAt) : null,
    mfeLevel: covered ? (isLong ? high : low) : null,
    mfeAt: covered ? iso(isLong ? highAt : lowAt) : null,
    entryTimeCheck: entry.check,
    exitTimeCheck: exit.check,
    priceMismatch,
    priceScale,
    preBreakeven,
  };
}

// ─────────────────────────────────────────────────────────────────────
// Aggregates
// ─────────────────────────────────────────────────────────────────────

/** A result read at one breakeven trigger, with the whole-trade MAE kept alongside. */
export type ExcursionViewExtras = {
  maeFullR: number | null;
  maeFullLevel: number | null;
  maeFullAt: string | null;
  breakevenAt: string | null;
};

export type ExcursionView = ExcursionResult & ExcursionViewExtras;

/**
 * The MAE fields replaced by their pre-breakeven values for `trigger`, so the
 * stats, charts and table all read the risk that was actually live.
 */
export function withBreakeven<T extends ExcursionResult>(
  result: T,
  trigger: BreakevenTrigger,
): T & ExcursionViewExtras {
  const pre = result.preBreakeven?.[`${trigger}`];
  return {
    ...result,
    maeFullR: result.maeR,
    maeFullLevel: result.maeLevel,
    maeFullAt: result.maeAt,
    breakevenAt: pre?.breakevenAt ?? null,
    ...(pre
      ? {
          maePrice: pre.maePrice,
          maeAmount: pre.maeAmount,
          maeR: pre.maeR,
          maePct: pre.maePct,
          maeLevel: pre.maeLevel,
          maeAt: pre.maeAt,
        }
      : {}),
  };
}

// CSV export

function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** "17/08/2026" - the IST calendar date, as the journal export writes it, on any machine. */
function istDate(iso: string | null): string {
  if (!iso) return "";
  const [year, month, day] = new Date(Date.parse(iso) + IST_OFFSET_MS).toISOString().slice(0, 10).split("-");
  return `${day}/${month}/${year}`;
}

function fixed(value: number | null, digits = 2): string {
  return value === null || !Number.isFinite(value) ? "" : value.toFixed(digits);
}

/**
 * The MAE / MFE table as CSV, in the table's own grouping: the trade (row
 * number, date, stock, first entry, stop %), then MFE (%, R, what was booked in
 * R, capture), then MAE (%, R). Rows in the order given, so a download matches
 * the filters and sort on screen. MAE is read at `trigger`, and its headers say
 * so. Opens with a BOM so Excel reads it as UTF-8, like the journal export.
 */
export function excursionsToCsv(rows: ExcursionView[], trigger: BreakevenTrigger): string {
  const headers = [
    "#",
    "Date",
    "Stock",
    "Entry",
    "SL %",
    "MFE %",
    "MFE (R)",
    "Exit (R)",
    "Captured %",
    `MAE % (to +${trigger}R)`,
    `MAE (R) (to +${trigger}R)`,
  ];

  const lines = rows.map((r, index) =>
    [
      index + 1,
      istDate(r.entryDate),
      r.symbol,
      fixed(r.firstEntryPrice),
      fixed(r.slPct),
      fixed(r.mfePct),
      fixed(r.mfeR),
      fixed(r.actualR),
      fixed(r.capturePct, 1),
      fixed(r.maePct),
      fixed(r.maeR),
    ]
      .map(csvCell)
      .join(","),
  );

  return "\uFEFF" + [headers.map(csvCell).join(","), ...lines].join("\n");
}

/** A stop-relative MAE at or past this counts as the stop having been hit. */
export const STOP_HIT_R = 0.98;

export type ExcursionSummary = {
  total: number;
  covered: number;
  uncovered: number;
  winners: number;
  losers: number;
  breakeven: number;
  /** Covered trades whose R rests on the 3% default stop because none was set. */
  withoutStop: number;
  /** Mean MAE(R) across winners. Prefer "avg winner MAE ×1.1" for stop size. */
  avgWinnerMaeR: number | null;
  avgWinnerMfeR: number | null;
  avgWinnerMaeAmount: number | null;
  avgWinnerMfeAmount: number | null;
  /** Winners' average MFE(R) ÷ average MAE(R). Below ~1 means trades fight you before working. */
  mfeMaeRatio: number | null;
  /** Mean of per-trade capture, winners only. "How much of the peak did I keep?" */
  capturePct: number | null;
  /** Aggregate Σ realized ÷ Σ MFE, winners only - the pool-wide capture. */
  captureAggregatePct: number | null;
  /** Mean MAE(R) across losers. ≈1.0 if they mostly got stopped out. */
  avgLoserMaeR: number | null;
  avgLoserMfeR: number | null;
  /** Share of losers with a real stop whose MAE reached it. */
  stoppedOutRate: number | null;
  /** Σ MAE ÷ Σ realized across winners. Lower = more return per unit of heat. */
  heatRatio: number | null;
  /** Winners with a real stop whose MAE reached it — a surviving stop test. */
  winnersHitStop: number;
  /** Winners with a real stop - the base winnersHitStop is out of. */
  winnersWithStop: number;
  /** Winners that kept >50% of their peak MFE in realized PnL. */
  winnersAboveHalfMfe: number;
};

function nonNull<T>(v: T | null): v is T {
  return v !== null;
}

export function summarizeExcursions(results: ExcursionResult[]): ExcursionSummary {
  const winners = results.filter((r) => r.outcome === "WIN");
  const losers = results.filter((r) => r.outcome === "LOSS");
  const isCovered = (r: ExcursionResult) => r.covered && r.maeR !== null && r.mfeR !== null;
  const coveredResults = results.filter(isCovered);
  const coveredWinners = winners.filter(isCovered);
  const coveredLosers = losers.filter(isCovered);
  // "Stopped out" only means something where a stop was actually set.
  const withStop = (r: ExcursionResult) => !r.usedDefaultStopLoss;

  const winnerMaeAmounts = coveredWinners.map((r) => r.maeAmount).filter(nonNull);
  const winnerMfeAmounts = coveredWinners.map((r) => r.mfeAmount).filter(nonNull);
  const winnerMfeR = coveredWinners.map((r) => r.mfeR).filter(nonNull);
  const winnerMaeR = coveredWinners.map((r) => r.maeR).filter(nonNull);

  const avgWinnerMfeR = avg(winnerMfeR);
  const avgWinnerMaeR = avg(winnerMaeR);
  // In R, not rupees, so one large position cannot set the ratio for all.
  const mfeMaeRatio =
    avgWinnerMfeR !== null && avgWinnerMaeR !== null && avgWinnerMaeR > 0
      ? avgWinnerMfeR / avgWinnerMaeR
      : null;

  const captures = coveredWinners.map((r) => r.capturePct).filter(nonNull);
  const winnerRealized = sum(coveredWinners.map((r) => Math.max(0, r.realizedPnl)));
  const winnerMfeTotal = sum(winnerMfeAmounts);
  const captureAggregate = winnerMfeTotal > 0 ? (winnerRealized / winnerMfeTotal) * 100 : null;

  const loserMaeR = coveredLosers.map((r) => r.maeR).filter(nonNull);
  const loserMfeR = coveredLosers.map((r) => r.mfeR).filter(nonNull);
  const losersWithStop = coveredLosers.filter(withStop);
  const stoppedOut =
    losersWithStop.length > 0
      ? losersWithStop.filter((r) => (r.maeR ?? 0) >= STOP_HIT_R).length / losersWithStop.length
      : null;

  const winnersWithStop = coveredWinners.filter(withStop);
  const winnersHitStop = winnersWithStop.filter((r) => (r.maeR ?? 0) >= STOP_HIT_R).length;
  const winnersAboveHalfMfe = coveredWinners.filter(
    (r) => r.capturePct !== null && r.capturePct > 50,
  ).length;

  // One pooled ratio. A mean of per-trade ratios let a +0.05R scratch with
  // 0.5R of heat (a ratio of 10) swamp every other winner.
  const heatRatio = winnerRealized > 0 ? sum(winnerMaeAmounts) / winnerRealized : null;

  return {
    total: results.length,
    covered: coveredResults.length,
    uncovered: results.length - coveredResults.length,
    winners: winners.length,
    losers: losers.length,
    breakeven: results.filter((r) => r.outcome === "BREAKEVEN").length,
    withoutStop: coveredResults.filter((r) => r.usedDefaultStopLoss).length,
    avgWinnerMaeR,
    avgWinnerMfeR,
    avgWinnerMaeAmount: avg(winnerMaeAmounts),
    avgWinnerMfeAmount: avg(winnerMfeAmounts),
    mfeMaeRatio,
    capturePct: avg(captures),
    captureAggregatePct: captureAggregate,
    avgLoserMaeR: avg(loserMaeR),
    avgLoserMfeR: avg(loserMfeR),
    stoppedOutRate: stoppedOut,
    heatRatio,
    winnersHitStop,
    winnersWithStop: winnersWithStop.length,
    winnersAboveHalfMfe,
  };
}
