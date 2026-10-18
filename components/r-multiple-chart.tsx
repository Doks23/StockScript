"use client";

/**
 * R-multiples, trade by trade.
 * ─────────────────────────────────────────────────────────────────────
 * One bar per closed trade: how many multiples of the money it risked the
 * trade returned. Above the line is a winner, below it a loser, and the height
 * is the only thing that matters - a journal with a 40% win rate is fine if the
 * bars above the line are three times the height of the ones below.
 *
 * Colour does not carry the sign. Sign is already unambiguous - it is which
 * side of the zero line a bar sits on - so painting it green/red as well spent
 * the whole colour channel restating something the geometry had already said.
 * The bars are coloured by how much of the portfolio the trade was given at
 * entry instead, which turns the chart into two readings at once: how good the
 * trade was (height) and how much it was allowed to matter (colour). A run of
 * tall pale bars is a real finding - the good trades were the small ones.
 * ─────────────────────────────────────────────────────────────────────
 */

import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  usePlotArea,
} from "recharts";
import Link from "next/link";
import {
  Table2,
  BarChart3,
  Eye,
  EyeOff,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
} from "lucide-react";
import { SymbolChartLink } from "@/components/symbol-chart-link";

const PROFIT = "#157f5b";
const LOSS = "#b33f40";
const INK = "#0f1720";
const MUTED = "#6b7280";
const GRID = "#e4e7e4";
/**
 * The ground under the losses.
 *
 * Sign used to be carried by a green or red cap on each bar. Tinting the whole
 * region below zero says it once, for the chart rather than for each bar: the
 * eye reads "these ones cost money" as an area, without decoding 76 small
 * accents. It also frees the bar itself to be about one thing - size - which is
 * the only variable that actually needs a colour here.
 */
const LOSS_GROUND = "#fdf3f2";
/** Set like instrument labels: small, spaced, quiet. */
const AXIS_LABEL = {
  fontSize: 9,
  fill: MUTED,
  letterSpacing: "0.14em",
} as const;

/**
 * Initial allocation, banded.
 * ─────────────────────────────────────────────────────────────────────
 * R says how good a trade was; allocation says how much it was allowed to
 * matter. A +3R trade on 6% of capital and the same trade on 25% are the same
 * bar on the chart and very different lines in the P&L, so the size the
 * position was given at entry is worth reading next to its result.
 *
 * A sequential ramp of one hue, not five colours.
 * ─────────────────────────────────────────────────────────────────────
 * Allocation is an ordered quantity, so it gets the encoding ordered
 * quantities take: a single hue, darkening. Darker means more capital, which
 * needs no legend to guess at, and the ramp is monotonic in luminance so the
 * ordering survives greyscale, a projector, and colour-blind viewers.
 *
 * The hue is blue for one reason above taste: green and red are spoken for.
 * They mean profit and loss everywhere else in this app, and an amber-to-green
 * allocation ramp put a red bar above the zero line - a winning trade painted
 * in the loss colour. Blue is the one axis with nothing else claiming it, so it
 * can carry a second variable without lying about the first.
 *
 * The first version of this ramp was slate: the same five lightnesses at low
 * chroma. It was near-impossible to tell two neighbouring bands apart, and the
 * reason was the grey, not the spacing - desaturated steps all read as "a grey"
 * and the eye compares them on lightness alone. Adding chroma gives it a second
 * dimension to separate them on, and the lightness range is wider besides.
 */
const ALLOCATION_BANDS = [
  // Four steps spread over the same light-to-dark range five used to cover, so
  // dropping a band widened every remaining gap rather than just removing the
  // darkest colour. `ink` is what stays readable printed ON that swatch - the
  // ramp crosses the point where white beats dark about halfway up it.
  { id: "good", min: 20, label: "Good", swatch: "#0e2f5a", ink: "#ffffff" },
  { id: "ok", min: 15, label: "OK", swatch: "#2a6cb5", ink: "#ffffff" },
  { id: "low", min: 10, label: "Low", swatch: "#74a9df", ink: "#0e2f5a" },
  { id: "vlow", min: 0, label: "Very low", swatch: "#c3d9f0", ink: "#0e2f5a" },
] as const;

/** Sized, but we cannot say how much of the portfolio it was. */
const UNBANDED = {
  id: "none",
  label: "Not sized",
  swatch: "#cbd5e1",
  ink: "#12283f",
} as const;

type AllocationBand = (typeof ALLOCATION_BANDS)[number];

/** null when there is no allocation to band - no capital set, or no entry value. */
function allocationBand(pct: number): AllocationBand | null {
  if (!(pct > 0)) return null;
  return ALLOCATION_BANDS.find((band) => pct >= band.min) ?? null;
}

/**
 * Bar paint: allocation in the colour, open-ness in the weight of the fill.
 *
 * Every bar is a solid block of its band. Open trades are not drawn
 * differently - they are labelled, with OPEN set up the bar, or a single O
 * where the bar is too short to take the word. A texture has to be decoded
 * against a legend; a word does not, which is the whole argument for it.
 *
 * Sign is unaffected. It was never the fill: it is which side of the zero line
 * the bar sits on, and the ground below zero is tinted to say so.
 */
function barPaint(trade: { allocPct: number }) {
  const band = allocationBand(trade.allocPct) ?? UNBANDED;
  return { fill: band.swatch, ink: band.ink };
}

/**
 * A bar with a rounded outer end and a square one.
 *
 * The end sitting on the zero line stays square, so a bar reads as growing out
 * of the line rather than floating near it.
 */
function barPath(x: number, y: number, w: number, h: number, r: number, up: boolean) {
  const rr = Math.max(0, Math.min(r, w / 2, h));
  return up
    ? `M${x},${y + h} L${x},${y + rr} Q${x},${y} ${x + rr},${y} L${x + w - rr},${y} Q${x + w},${y} ${x + w},${y + rr} L${x + w},${y + h} Z`
    : `M${x},${y} L${x},${y + h - rr} Q${x},${y + h} ${x + rr},${y + h} L${x + w - rr},${y + h} Q${x + w},${y + h} ${x + w},${y + h - rr} L${x + w},${y} Z`;
}

/**
 * One colour per bar; the ground supplies the other.
 * ─────────────────────────────────────────────────────────────────────
 * The bar carries size and nothing else. Win or loss is read off the tinted
 * ground below zero, which says it once for the whole chart instead of once
 * per bar.
 *
 * This replaced a green/red cap on each bar's tip. The cap worked at a dozen
 * bars and fell apart at seventy-six: on a short loss it was a red sliver a
 * couple of pixels tall sitting inside an already-pink region, which is fringe,
 * not information. Two encodings of the same fact, and the quieter one is both
 * clearer and calmer.
 */
function AllocationBar(props: {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  payload?: RTrade;
}) {
  const { x = 0, width = 0, payload } = props;
  if (!payload || width <= 0) return null;

  // Recharts hands a negative height back for bars drawn downward in some
  // versions and a positive one in others; normalise before drawing.
  let top = props.y ?? 0;
  let h = props.height ?? 0;
  if (h < 0) {
    top += h;
    h = -h;
  }

  const up = payload.r >= 0;
  const paint = barPaint(payload);
  const cx = x + width / 2;
  // The tip end, a few pixels in, is where the label starts from.
  const tipY = up ? top + 7 : top + h - 7;

  return (
    <g>
      <path
        d={barPath(x, top, width, Math.max(h, 0.5), 3, up)}
        fill={paint.fill}
      />
      {payload.isOpen && (
        <OpenMark cx={cx} tipY={tipY} barHeight={h} up={up} ink={paint.ink} band={paint.fill} />
      )}
    </g>
  );
}

/**
 * O, at the tip of an open bar.
 *
 * One letter, so it fits every bar at every trade count - no measuring, no two
 * bars carrying different marks for the same fact. On a bar too short to print
 * on at all it moves just beyond the tip and takes the band's own colour, since
 * there is no bar underneath it to sit on.
 */
function OpenMark({
  cx,
  tipY,
  barHeight,
  up,
  ink,
  band,
}: {
  cx: number;
  tipY: number;
  barHeight: number;
  up: boolean;
  ink: string;
  band: string;
}) {
  const outside = barHeight < 13;
  const y = outside ? (up ? tipY - 8 : tipY + 8) : tipY;

  return (
    <text
      x={cx}
      y={y}
      textAnchor="middle"
      dominantBaseline="central"
      fontSize={9}
      fontWeight={700}
      fill={outside ? band : ink}
    >
      O
    </text>
  );
}

export type RTrade = {
  id: string;
  symbol: string;
  /** Still running: its R is marked to market and will move. */
  isOpen: boolean;
  entryDate: string;
  r: number;
  pnl: number;
  stopLossPct: number;
  assumedStop: boolean;
  setups: string[];
  /** Capital committed at entry, as a % of the portfolio. 0 when unknown. */
  allocPct: number;
  /** Entry month, as a sortable key and as a label for the divider. */
  month: string;
  monthLabel: string;
};

const fmtR = (value: number) => `${value > 0 ? "+" : ""}${value.toFixed(2)}R`;

/** Out to this many R either side of zero the distribution is cut in halves. */
const FINE_R = 1.5;

/**
 * The bucket a result falls in: half-R inside the fine range, whole-R outside.
 *
 * A bucket is named by the edge furthest from zero, so "-1R" holds everything
 * from -0.5 down to -1.0 - a stop taken in full - and "-1.5R" holds the ones
 * that got away from it.
 */
function bucketFor(r: number) {
  const magnitude = Math.abs(r);
  const size =
    magnitude <= FINE_R
      ? Math.max(Math.ceil(magnitude * 2) / 2, 0.5)
      : Math.ceil(magnitude);
  // An exact 0.00R is counted as the smallest win rather than dropped: there is
  // no zero bucket for it to live in, and silently losing it would stop the
  // bars adding up to the trade count.
  return r < 0 ? -size : size;
}

/** Every bucket from `low` to `high`, empties included, in reading order. */
function bucketScale(low: number, high: number) {
  const values: number[] = [];
  for (let whole = Math.floor(low); whole <= -2; whole++) values.push(whole);
  values.push(-FINE_R, -1, -0.5, 0.5, 1, FINE_R);
  for (let whole = 2; whole <= Math.ceil(high); whole++) values.push(whole);
  return values.filter((value) => value >= low && value <= high);
}

/** "2026-08#4" -> "4". The axis shows the number; the key carries the month. */
const tickNumber = (value: string) => value.split("#")[1] ?? value;

const fmtMoney = (value: number) =>
  `${value < 0 ? "-" : ""}₹${Math.abs(Math.round(value)).toLocaleString("en-IN")}`;

function Stat({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "neutral" | "profit" | "loss";
}) {
  return (
    <div className="rounded-xl border border-line bg-panel px-3 py-2.5">
      <p className="text-[10px] font-medium uppercase tracking-wider text-muted">{label}</p>
      <p
        className={`mt-0.5 font-mono text-lg font-semibold tabular-nums ${
          tone === "profit" ? "text-profit" : tone === "loss" ? "text-loss" : "text-ink"
        }`}
      >
        {value}
      </p>
      {hint && <p className="mt-0.5 text-[11px] leading-tight text-muted">{hint}</p>}
    </div>
  );
}

type MonthSpan = { key: string; label: string; start: number; end: number };

/**
 * WIN and LOSS, anchored to the ends of the value axis.
 *
 * The axis prints numbers; these say what the numbers mean, once, at the two
 * ends. It is the cheapest possible legend for the vertical dimension - a
 * reader who knows nothing about R still knows which way is good.
 */
function AxisAnchors() {
  const plot = usePlotArea();
  if (!plot) return null;

  // Above the plot and below it, never beside it: level with the top and
  // bottom ticks these sat in the same column as "6R" and "-2R" and printed
  // straight through them.
  return (
    <g>
      <text x={2} y={plot.y - 7} {...AXIS_LABEL}>
        WIN
      </text>
      <text x={2} y={plot.y + plot.height + 13} {...AXIS_LABEL}>
        LOSS
      </text>
    </g>
  );
}

/**
 * The expectancy line, named where it ends.
 *
 * An unlabelled dashed rule is a line the reader has to go looking for in the
 * caption. Putting the number on its right-hand end makes it the one thing on
 * the chart that states a conclusion rather than showing data.
 */
function ExpectancyLabel({
  viewBox,
  value,
  tone,
}: {
  viewBox?: { x: number; y: number; width: number; height: number };
  value: string;
  tone: string;
}) {
  if (!viewBox) return null;
  const x = viewBox.x + viewBox.width + 6;
  return (
    <g>
      <text x={x} y={viewBox.y + 3} fontSize={10} fontWeight={600} fill={tone}>
        {value}
      </text>
      <text x={x} y={viewBox.y + 15} fontSize={9} fill={MUTED}>
        expectancy
      </text>
    </g>
  );
}

/**
 * Month rules, drawn straight onto the plot area.
 *
 * A ReferenceLine on a category axis lands on the *centre* of a category, which
 * would put the rule through the middle of the month's first bar rather than
 * between two months. So this draws itself: `usePlotArea` gives the rectangle
 * the bars are laid out in, the categories are spread evenly across it, and the
 * boundary before bar i is simply i/total of the way along - exact, and it
 * moves with the container.
 */
function MonthDividers({
  spans,
  total,
}: {
  spans: MonthSpan[];
  total: number;
}) {
  const plot = usePlotArea();
  if (!plot || total === 0 || spans.length < 2) return null;

  const at = (index: number) => plot.x + (index / total) * plot.width;

  return (
    <g>
      {spans.map((span, index) => {
        const label = span.label.toUpperCase();
        return (
          <g key={span.key}>
            {index > 0 && (
              <line
                x1={at(span.start)}
                x2={at(span.start)}
                y1={plot.y}
                y2={plot.y + plot.height}
                stroke="#cbd5e1"
                strokeWidth={1}
                strokeDasharray="3 3"
              />
            )}
            {/* Set on its own ground, so a tall bar cannot swallow the label. */}
            <rect
              x={at(span.start) + 3}
              y={plot.y}
              width={label.length * 5.4 + 6}
              height={12}
              rx={2}
              fill="#ffffff"
              fillOpacity={0.82}
            />
            <text
              x={at(span.start) + 6}
              y={plot.y + 9}
              fontSize={9}
              fill={MUTED}
              letterSpacing="0.08em"
            >
              {label}
            </text>
          </g>
        );
      })}
    </g>
  );
}

/** The five bands, low to high, the way the column and the chart both read. */
const BANDS_ASCENDING = [...ALLOCATION_BANDS].reverse();

function bandRange(index: number) {
  if (index === 0) return `<${BANDS_ASCENDING[1].min}%`;
  if (index === BANDS_ASCENDING.length - 1) return `${BANDS_ASCENDING[index].min}%+`;
  return `${BANDS_ASCENDING[index].min}\u2013${BANDS_ASCENDING[index + 1].min}%`;
}

/**
 * The ramp, drawn as one continuous strip rather than five bullets.
 *
 * A row of dots says "five categories"; a strip says "one scale, read left to
 * right", which is what allocation is. The breakpoints sit under the joins, so
 * the legend doubles as the axis for a variable that has no axis of its own.
 */
type RSortKey = "seq" | "symbol" | "entry" | "stop" | "alloc" | "pnl" | "r";

/** Ascending reads better for names and for time; biggest-first for amounts. */
const ASCENDING_FIRST: RSortKey[] = ["seq", "symbol", "entry"];

function SortIcon({ active, dir }: { active: boolean; dir: "asc" | "desc" }) {
  if (!active) return <ArrowUpDown className="ml-0.5 inline h-2.5 w-2.5 opacity-30" />;
  return dir === "asc" ? (
    <ArrowUp className="ml-0.5 inline h-2.5 w-2.5 opacity-80" />
  ) : (
    <ArrowDown className="ml-0.5 inline h-2.5 w-2.5 opacity-80" />
  );
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
  sKey: RSortKey;
  sortKey: RSortKey;
  sortDir: "asc" | "desc";
  onSort: (key: RSortKey) => void;
  className?: string;
}) {
  return (
    <th
      className={`cursor-pointer select-none px-3 py-2 font-medium transition-colors hover:bg-slate-200/60 hover:text-slate-800 ${className}`}
      onClick={() => onSort(sKey)}
      aria-sort={
        sortKey === sKey ? (sortDir === "asc" ? "ascending" : "descending") : "none"
      }
    >
      {children}
      <SortIcon active={sortKey === sKey} dir={sortDir} />
    </th>
  );
}

/**
 * What the window actually contains.
 *
 * The stat tiles average and total things; this just says how many trades are
 * being averaged, which is the first question asked of any of those numbers -
 * a 3.2R expectancy over 40 trades and over 4 are not the same claim.
 */
function PeriodCount({
  total,
  open,
  rangeLabel,
}: {
  total: number;
  open: number;
  rangeLabel?: string;
}) {
  return (
    <p className="text-[11px] tabular-nums text-muted">
      <span className="font-semibold text-ink">{total}</span> trade
      {total === 1 ? "" : "s"}
      {rangeLabel ? ` · ${rangeLabel}` : ""}
      {open > 0 ? ` · ${open} open` : ""}
    </p>
  );
}

function AllocationLegend({
  className = "",
  openCount = 0,
}: {
  className?: string;
  openCount?: number;
}) {
  return (
    <div className={`flex flex-wrap items-end gap-x-5 gap-y-2 ${className}`}>
      <div>
        <p className="mb-1.5 text-[9px] font-medium uppercase tracking-[0.14em] text-muted">
          Allocation at entry
        </p>
        <div className="flex">
          {BANDS_ASCENDING.map((band, index) => (
            <div key={band.id} className="w-[52px]">
              <div
                className={`h-[7px] ${index === 0 ? "rounded-l-[2px]" : ""} ${
                  index === BANDS_ASCENDING.length - 1 ? "rounded-r-[2px]" : ""
                }`}
                style={{ background: band.swatch }}
              />
              <p className="mt-1 text-[9px] leading-none text-slate-600">{band.label}</p>
              <p className="mt-[3px] text-[9px] leading-none tabular-nums text-muted">
                {bandRange(index)}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-1.5 pb-[15px] text-[10px] text-muted">
        <span
          className="h-2.5 w-2.5 rounded-[2px] border border-loss/20"
          style={{ background: LOSS_GROUND }}
        />
        Tinted ground: below zero, a loss
      </div>

      {openCount > 0 && (
        <div className="flex items-center gap-1.5 pb-[15px] text-[10px] text-muted">
          <span className="flex h-3.5 w-3.5 items-center justify-center rounded-[2px] bg-slate-500 text-[8px] font-bold text-white">
            O
          </span>
          on the bar: open, marked to market ({openCount})
        </div>
      )}
    </div>
  );
}

export function RMultipleChart({
  trades,
  rangeLabel,
  totalClosed = 0,
  includeOpen = true,
  rangeKey = "3m",
  from = "",
  to = "",
  month = "",
}: {
  trades: RTrade[];
  /** Named so an empty chart can say what window it is empty for. */
  rangeLabel?: string;
  /** Closed trades in the whole journal, so an empty window can offer a way out. */
  totalClosed?: number;
  includeOpen?: boolean;
  /** Carried so the open-trades switch can rebuild the URL without losing the range. */
  rangeKey?: string;
  from?: string;
  to?: string;
  month?: string;
}) {
  const [view, setView] = useState<"chart" | "table">("chart");
  const [sortKey, setSortKey] = useState<RSortKey>("seq");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  function handleSort(key: RSortKey) {
    if (key === sortKey) {
      setSortDir((dir) => (dir === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDir(ASCENDING_FIRST.includes(key) ? "asc" : "desc");
  }

  /** Keeps the date range while flipping the open-trades switch. */
  const rangeHref = (nextIncludeOpen: boolean) => {
    const params = new URLSearchParams({ range: rangeKey });
    if (rangeKey === "custom") {
      params.set("from", from);
      params.set("to", to);
    }
    if (rangeKey === "month") params.set("m", month);
    if (!nextIncludeOpen) params.set("open", "0");
    return `/r-multiple?${params.toString()}`;
  };

  const stats = useMemo(() => {
    const wins = trades.filter((trade) => trade.r > 0);
    const losses = trades.filter((trade) => trade.r < 0);
    const totalR = trades.reduce((sum, trade) => sum + trade.r, 0);
    const avgWin = wins.length
      ? wins.reduce((sum, trade) => sum + trade.r, 0) / wins.length
      : 0;
    const avgLoss = losses.length
      ? Math.abs(losses.reduce((sum, trade) => sum + trade.r, 0) / losses.length)
      : 0;

    return {
      totalR,
      expectancy: trades.length ? totalR / trades.length : 0,
      winPct: trades.length ? (wins.length / trades.length) * 100 : 0,
      wins: wins.length,
      losses: losses.length,
      // Seeding these with 0 would report a journal of pure losses as having a
      // best trade of 0.00R, and a journal with no losses as having a worst of
      // 0.00R in loss-red. Neither trade exists; say so.
      best: wins.length ? Math.max(...wins.map((trade) => trade.r)) : null,
      worst: losses.length ? Math.min(...losses.map((trade) => trade.r)) : null,
      // The ratio the win rate has to clear. A 2.0 payoff only needs to be right
      // a third of the time to break even, which is the whole argument for
      // reading a journal in R rather than in rupees.
      payoff: avgLoss > 0 ? avgWin / avgLoss : null,
      assumed: trades.filter((trade) => trade.assumedStop).length,
      open: trades.filter((trade) => trade.isOpen).length,
    };
  }, [trades]);

  /**
   * The y-axis always spans at least -1R to +1R.
   *
   * Those two lines are the reference the whole chart is read against, so they
   * have to be on it even when no trade reached them - a clean run of winners
   * would otherwise start the axis at 0R and quietly drop the -1R line, which
   * is exactly the view where "none of these hit the stop" is the point being
   * made. The headroom keeps the edge labels off the axis line.
   */
  const domain = useMemo<[number, number]>(() => {
    const values = trades.map((trade) => trade.r);
    const low = Math.min(-1, ...values);
    const high = Math.max(1, ...values);
    const pad = Math.max(0.35, (high - low) * 0.06);
    return [low - pad, high + pad];
  }, [trades]);

  /**
   * Bars carry their sequence number, which is what the axis shows - counted
   * within the month, not across the whole window. "My fourth trade in March"
   * is how a run actually gets talked about in a review; #147 is not.
   */
  const bars = useMemo(() => {
    let n = 0;
    let month = "";
    return trades.map((trade) => {
      if (trade.month !== month) {
        month = trade.month;
        n = 0;
      }
      n += 1;
      // The axis category has to be unique. Recharts resolves a hover back to a
      // datum by its category *value*, so with the count restarting every month
      // there were several bars keyed "2" and every one of them resolved to the
      // first - hovering an August bar showed the June trade. The month is
      // carried in the key and formatted back out for the tick label.
      return { ...trade, n, axisKey: `${trade.month}#${n}` };
    });
  }, [trades]);

  /**
   * The table's own order.
   *
   * "seq" and "entry" are the same sort: the rows arrive in entry order, so
   * asking for chronological is asking for the order they are already in. Both
   * headers exist because both questions get asked.
   *
   * Ties fall back to the original position, so the sort is stable and two
   * renders of the same data never disagree about the order.
   */
  const sortedRows = useMemo(() => {
    const rows = bars.map((trade, index) => ({ trade, index }));
    const direction = sortDir === "asc" ? 1 : -1;

    return rows
      .sort((a, b) => {
        if (sortKey === "symbol") {
          return a.trade.symbol.localeCompare(b.trade.symbol) * direction || a.index - b.index;
        }
        const value = (row: (typeof rows)[number]) => {
          switch (sortKey) {
            case "stop":
              return row.trade.stopLossPct;
            case "alloc":
              return row.trade.allocPct;
            case "pnl":
              return row.trade.pnl;
            case "r":
              return row.trade.r;
            default:
              return row.index;
          }
        };
        return (value(a) - value(b)) * direction || a.index - b.index;
      })
      .map((row) => row.trade);
  }, [bars, sortKey, sortDir]);

  /** Where each month starts and ends in that sequence. */
  const monthSpans = useMemo(() => {
    const spans: MonthSpan[] = [];
    bars.forEach((trade, index) => {
      const current = spans[spans.length - 1];
      if (current && current.key === trade.month) current.end = index;
      else spans.push({ key: trade.month, label: trade.monthLabel, start: index, end: index });
    });
    return spans;
  }, [bars]);

  const cumulative = useMemo(() => {
    let running = 0;
    return bars.map((trade) => {
      running += trade.r;
      return {
        n: trade.n,
        axisKey: trade.axisKey,
        cumR: Number(running.toFixed(2)),
        symbol: trade.symbol,
        monthLabel: trade.monthLabel,
      };
    });
  }, [bars]);

  /**
   * Counts per bucket, half an R near the line and a whole R out in the tail.
   * ─────────────────────────────────────────────────────────────────────
   * The interesting part of this distribution is all within about 1.5R of
   * zero: whether a stop was honoured (-1R) or overrun (-1.5R) or cut early
   * (-0.5R), and whether a win got past the first target. Out past that the
   * question is only "how far", and half-R buckets there just halve every
   * count and double the number of labels.
   *
   * So the scale is fine where the reading is and coarse where it is not.
   */
  const distribution = useMemo(() => {
    const buckets = new Map<number, number>();
    for (const trade of trades) {
      buckets.set(bucketFor(trade.r), (buckets.get(bucketFor(trade.r)) ?? 0) + 1);
    }
    // Every bucket between the extremes, including the empty ones. Dropping
    // them closes the gaps and turns a barbell into a tidy little staircase -
    // the distribution's shape is the entire point of the chart.
    const keys = [...buckets.keys()];
    const low = Math.min(...keys);
    const high = Math.max(...keys);

    return bucketScale(low, high).map((bucket) => ({
      bucket,
      label: `${bucket < 0 ? "-" : "+"}${Math.abs(bucket)}R`,
      count: buckets.get(bucket) ?? 0,
    }));
  }, [trades]);

  if (trades.length === 0) {
    return (
      <div className="rounded-2xl border border-line bg-panel p-8 text-center">
        <p className="text-sm text-muted">
          No closed trades {rangeLabel ? `in the ${rangeLabel}` : "yet"}. R-multiples need
          an exit &mdash; and a stop, to measure the exit against.
        </p>
        {/* An empty window on a journal that is not empty is a date problem, not
            a trading one, so say where the trades actually are. */}
        {totalClosed > 0 && (
          <Link
            href="/r-multiple?range=all"
            className="mt-2 inline-block text-sm font-medium text-accent hover:underline"
          >
            Show all {totalClosed} closed trades &rarr;
          </Link>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Headline numbers. Expectancy leads: it is the one number that says
          whether the whole journal is worth repeating. */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <Stat
          label="Expectancy"
          value={fmtR(stats.expectancy)}
          hint="per trade"
          tone={stats.expectancy > 0 ? "profit" : stats.expectancy < 0 ? "loss" : "neutral"}
        />
        <Stat
          label="Total"
          value={fmtR(stats.totalR)}
          hint={
            stats.open > 0
              ? `over ${trades.length} trades · ${stats.open} still open`
              : `over ${trades.length} trade${trades.length === 1 ? "" : "s"}`
          }
          tone={stats.totalR > 0 ? "profit" : stats.totalR < 0 ? "loss" : "neutral"}
        />
        <Stat
          label="Win rate"
          value={`${stats.winPct.toFixed(0)}%`}
          hint={`${stats.wins}W / ${stats.losses}L`}
        />
        <Stat
          label="Payoff"
          value={stats.payoff ? `${stats.payoff.toFixed(2)}×` : "—"}
          hint={stats.payoff ? `breakeven at ${(100 / (1 + stats.payoff)).toFixed(0)}% wins` : "no losses yet"}
        />
        <Stat
          label="Best"
          value={stats.best === null ? "—" : fmtR(stats.best)}
          hint={stats.best === null ? "no winners yet" : undefined}
          tone={stats.best === null ? "neutral" : "profit"}
        />
        <Stat
          label="Worst"
          value={stats.worst === null ? "—" : fmtR(stats.worst)}
          hint={stats.worst === null ? "no losses yet" : undefined}
          tone={stats.worst === null ? "neutral" : "loss"}
        />
      </div>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <AllocationLegend openCount={stats.open} />
          {stats.assumed > 0 && (
            <p className="text-[10px] text-muted">
              {stats.assumed} with an assumed stop
            </p>
          )}
        </div>

        <div className="flex items-center gap-2">
        <Link
          href={rangeHref(!includeOpen)}
          className={`flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[11px] transition ${
            includeOpen
              ? "border-accent bg-accent/10 text-accentDeep"
              : "border-line bg-white text-slate-600 hover:bg-canvas"
          }`}
        >
          {includeOpen ? <Eye size={14} /> : <EyeOff size={14} />}
          Open trades
        </Link>

        <button
          type="button"
          onClick={() => setView(view === "chart" ? "table" : "chart")}
          className="flex h-8 items-center gap-1.5 rounded-lg border border-line bg-white px-2.5 text-[11px] text-slate-600 transition hover:bg-canvas"
        >
          {view === "chart" ? <Table2 size={14} /> : <BarChart3 size={14} />}
          {view === "chart" ? "Table" : "Chart"}
        </button>
        </div>
      </div>

      {view === "table" ? (
        <div className="overflow-x-auto sticky-head-box rounded-2xl border border-line bg-panel">
          <div className="border-b border-line px-3 py-2">
            <PeriodCount
              total={trades.length}
              open={stats.open}
              rangeLabel={rangeLabel}
            />
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-line text-left text-muted">
                {(
                  [
                    ["seq", "#", ""],
                    ["symbol", "Symbol", ""],
                    ["entry", "Entry", ""],
                    ["stop", "Stop", "text-right"],
                    ["alloc", "Alloc", "text-right"],
                    ["pnl", "P&L", "text-right"],
                    ["r", "R", "text-right"],
                  ] as [RSortKey, string, string][]
                ).map(([key, label, align]) => (
                  <SortTh
                    key={key}
                    sKey={key}
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={handleSort}
                    className={align}
                  >
                    {label}
                  </SortTh>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((trade) => {
                const band = allocationBand(trade.allocPct);
                return (
                <tr key={trade.id} className="border-b border-line/50">
                  <td className="px-3 py-1.5 text-muted">{trade.n}</td>
                  <td className="px-3 py-1.5">
                    <SymbolChartLink symbol={trade.symbol} asTicker className="font-medium text-ink" />
                    {trade.isOpen && (
                      <span className="ml-1.5 rounded-full border border-slate-300 bg-white px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
                        open
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-1.5 text-muted">{trade.entryDate}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-muted">
                    {trade.stopLossPct.toFixed(1)}%{trade.assumedStop ? "*" : ""}
                  </td>
                  {/* Swatch then number, not a coloured pill: down the column the
                      swatches read as their own little ramp, and the figure stays
                      right-aligned with every other number in the table. */}
                  <td className="px-3 py-1.5">
                    {band ? (
                      <span
                        className="flex items-center justify-end gap-1.5"
                        title={`${band.label} allocation - ${trade.allocPct.toFixed(1)}% of capital at entry`}
                      >
                        <span
                          className="h-2 w-2 shrink-0 rounded-[2px]"
                          style={{ background: band.swatch }}
                        />
                        <span className="tabular-nums text-slate-600">
                          {trade.allocPct.toFixed(1)}%
                        </span>
                      </span>
                    ) : (
                      <span className="block text-right text-slate-300">&mdash;</span>
                    )}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{fmtMoney(trade.pnl)}</td>
                  <td
                    className={`px-3 py-1.5 text-right font-mono tabular-nums ${
                      trade.r > 0 ? "text-profit" : trade.r < 0 ? "text-loss" : ""
                    }`}
                  >
                    {fmtR(trade.r)}
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
          <AllocationLegend className="border-t border-line/50 px-3 py-2" />
          {stats.assumed > 0 && (
            <p className="px-3 pb-2 text-[11px] text-muted">
              * stop was not recorded, so a 3% stop is assumed and the R is an estimate.
            </p>
          )}
        </div>
      ) : (
        <>
          <figure className="rounded-2xl border border-line bg-panel p-3 sm:p-4">
            <figcaption className="mb-1 px-1">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <h3 className="text-sm font-semibold text-ink">Every trade in R</h3>
                <PeriodCount
                  total={trades.length}
                  open={stats.open}
                  rangeLabel={rangeLabel}
                />
              </div>
              <p className="text-[11px] text-muted">
                In the order they were entered. Height is the result and the tinted
                ground is the losing half; the depth of the blue is how much of the
                portfolio the trade was given at entry.
              </p>
            </figcaption>
            <div className="h-[300px] w-full sm:h-[340px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={bars} margin={{ top: 22, right: 64, left: 0, bottom: 4 }}>
                  {/* First, so everything else draws on top of it. */}
                  <ReferenceArea
                    y1={domain[0]}
                    y2={0}
                    fill={LOSS_GROUND}
                    fillOpacity={1}
                    ifOverflow="hidden"
                  />
                  <CartesianGrid stroke={GRID} vertical={false} />
                  <XAxis
                    dataKey="axisKey"
                    tickFormatter={tickNumber}
                    tick={{ fontSize: 10, fill: MUTED }}
                    axisLine={{ stroke: GRID }}
                    tickLine={false}
                    interval="preserveStartEnd"
                    minTickGap={12}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: MUTED }}
                    axisLine={false}
                    tickLine={false}
                    width={44}
                    domain={domain}
                    // Integer ticks from the start. Rounding the label instead
                    // let two different ticks - 4.9 and 5.35, say - both print
                    // as "5R", stacked one above the other on the axis.
                    allowDecimals={false}
                    tickFormatter={(value: number) => `${value}R`}
                  />
                  <Tooltip
                    cursor={{ fill: "rgba(15,23,32,0.04)" }}
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const trade = payload[0].payload as RTrade & { n: number };
                      return (
                        <div className="rounded-lg border border-line bg-white/95 px-3 py-2 text-xs shadow-soft">
                          <p className="font-semibold text-ink">
                            {trade.monthLabel} #{trade.n} &middot; {trade.symbol}
                          </p>
                          <p className="text-muted">{trade.entryDate}</p>
                          <p
                            className={`mt-1 font-mono font-semibold ${
                              trade.r > 0 ? "text-profit" : "text-loss"
                            }`}
                          >
                            {fmtR(trade.r)} · {fmtMoney(trade.pnl)}
                          </p>
                          <p className="text-[11px] text-muted">
                            {trade.stopLossPct.toFixed(1)}% stop
                            {trade.assumedStop ? " (assumed)" : ""}
                          </p>
                          {(() => {
                            const band = allocationBand(trade.allocPct);
                            if (!band) return null;
                            return (
                              <p className="flex items-center gap-1.5 text-[11px] text-muted">
                                <span
                                  className="h-2 w-2 shrink-0 rounded-[2px]"
                                  style={{ background: band.swatch }}
                                />
                                {trade.allocPct.toFixed(1)}% allocation &middot; {band.label}
                              </p>
                            );
                          })()}
                          {trade.isOpen && (
                            <p className="mt-0.5 border-t border-line pt-1 text-[10px] uppercase tracking-wider text-slate-500">
                              Open &mdash; marked to market
                            </p>
                          )}
                        </div>
                      );
                    }}
                  />
                  {/* The two lines a trade is actually judged against: -1R is a
                      stop taken in full, +1R is the first target. Anything
                      below -1R is a stop that was not honoured.

                      Drawn neutral. They are scaffolding the bars are measured
                      against, and once the bars stopped being green and red, a
                      pair of green and red hairlines was the only thing on the
                      chart still using those colours - which read as a leftover
                      rather than a decision. */}
                  <ReferenceLine
                    y={1}
                    stroke={MUTED}
                    strokeOpacity={0.4}
                    strokeDasharray="2 3"
                    strokeWidth={1}
                    label={{ value: "+1R", position: "right", fontSize: 9, fill: MUTED }}
                  />
                  <ReferenceLine
                    y={-1}
                    stroke={MUTED}
                    strokeOpacity={0.4}
                    strokeDasharray="2 3"
                    strokeWidth={1}
                    label={{ value: "-1R", position: "right", fontSize: 9, fill: MUTED }}
                  />
                  {/* Zero last of the three, so it reads as the baseline. */}
                  <ReferenceLine y={0} stroke={INK} strokeWidth={1} />
                  <ReferenceLine
                    y={stats.expectancy}
                    stroke={stats.expectancy >= 0 ? PROFIT : LOSS}
                    strokeDasharray="4 4"
                    strokeWidth={1.5}
                    label={
                      <ExpectancyLabel
                        value={fmtR(stats.expectancy)}
                        tone={stats.expectancy >= 0 ? PROFIT : LOSS}
                      />
                    }
                  />
                  <Bar
                    dataKey="r"
                    maxBarSize={22}
                    isAnimationActive={false}
                    shape={<AllocationBar />}
                  />
                  {/* Last, so the rules and their labels sit over the bars. */}
                  <MonthDividers spans={monthSpans} total={bars.length} />
                  <AxisAnchors />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </figure>

          <div className="grid gap-4 lg:grid-cols-2">
            <figure className="rounded-2xl border border-line bg-panel p-3 sm:p-4">
              <figcaption className="mb-1 px-1">
                <h3 className="text-sm font-semibold text-ink">Cumulative R</h3>
                <p className="text-[11px] text-muted">
                  The same trades added up &mdash; the equity curve with position size taken out
                  of it.
                </p>
              </figcaption>
              <div className="h-[220px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={cumulative} margin={{ top: 8, right: 8, left: -8, bottom: 4 }}>
                    <CartesianGrid stroke={GRID} vertical={false} />
                    <XAxis
                      dataKey="axisKey"
                      tickFormatter={tickNumber}
                      tick={{ fontSize: 10, fill: MUTED }}
                      axisLine={{ stroke: GRID }}
                      tickLine={false}
                      interval="preserveStartEnd"
                      minTickGap={12}
                    />
                    <YAxis
                      tick={{ fontSize: 10, fill: MUTED }}
                      axisLine={false}
                      tickLine={false}
                      width={52}
                      tickFormatter={(value: number) => `${value}R`}
                    />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const point = payload[0].payload as {
                          n: number;
                          cumR: number;
                          symbol: string;
                          monthLabel: string;
                        };
                        return (
                          <div className="rounded-lg border border-line bg-white/95 px-3 py-2 text-xs shadow-soft">
                            <p className="font-semibold text-ink">
                              After {point.monthLabel} #{point.n} &middot; {point.symbol}
                            </p>
                            <p className="font-mono text-muted">{fmtR(point.cumR)}</p>
                          </div>
                        );
                      }}
                    />
                    <ReferenceLine y={0} stroke={INK} strokeWidth={1} />
                    <MonthDividers spans={monthSpans} total={cumulative.length} />
                    <Line
                      type="monotone"
                      dataKey="cumR"
                      stroke={stats.totalR >= 0 ? PROFIT : LOSS}
                      strokeWidth={2}
                      dot={false}
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </figure>

            <figure className="rounded-2xl border border-line bg-panel p-3 sm:p-4">
              <figcaption className="mb-1 px-1">
                <h3 className="text-sm font-semibold text-ink">Where the trades land</h3>
                <p className="text-[11px] text-muted">
                  Half-R buckets out to &plusmn;1.5R, whole R beyond. A healthy shape is a
                  wall at &minus;1R &mdash; stops taken in full, not drifting past them &mdash;
                  and a long tail to the right.
                </p>
              </figcaption>
              <div className="h-[220px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={distribution} margin={{ top: 8, right: 8, left: -18, bottom: 4 }}>
                    <CartesianGrid stroke={GRID} vertical={false} />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 10, fill: MUTED }}
                      axisLine={{ stroke: GRID }}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 10, fill: MUTED }}
                      axisLine={false}
                      tickLine={false}
                      width={44}
                      allowDecimals={false}
                    />
                    <Tooltip
                      cursor={{ fill: "rgba(15,23,32,0.04)" }}
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const point = payload[0].payload as { label: string; count: number };
                        return (
                          <div className="rounded-lg border border-line bg-white/95 px-3 py-2 text-xs shadow-soft">
                            <p className="font-semibold text-ink">{point.label}</p>
                            <p className="text-muted">
                              {point.count} trade{point.count === 1 ? "" : "s"}
                            </p>
                          </div>
                        );
                      }}
                    />
                    <Bar dataKey="count" radius={[3, 3, 0, 0]} maxBarSize={38} isAnimationActive={false}>
                      {distribution.map((bucket) => (
                        <Cell key={bucket.label} fill={bucket.bucket >= 0 ? PROFIT : LOSS} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </figure>
          </div>
        </>
      )}
    </div>
  );
}
