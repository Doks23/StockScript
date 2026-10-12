import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ImageUpload } from "@/components/image-upload";
import { MetricCard } from "@/components/metric-card";
import { requireActiveUser } from "@/lib/auth";
import {
  formatCurrency,
  formatDateTime,
  formatNumber,
  formatPercent,
  formatPrice,
} from "@/lib/format";
import { getTradesBySymbol } from "@/lib/queries";
import {
  parseTags,
  calculateTradePnl,
  getWeightedEntryPrice,
  getWeightedExitPrice,
  getTotalEntryQty,
  getFirstEntryTime,
  getLastExitTime,
} from "@/lib/trade-utils";

type TradeDetailPageProps = {
  params: {
    symbol: string;
  };
  searchParams: {
    from?: string;
    to?: string;
    tag?: string;
  };
};

function compactAttribute(value?: string | null) {
  if (!value) return "--";
  const values = value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  if (values.length <= 1) return values[0] || "--";
  return `${values[0]} +${values.length - 1}`;
}

export default async function TradeDetailPage({
  params,
  searchParams,
}: TradeDetailPageProps) {
  const user = await requireActiveUser();
  const data = await getTradesBySymbol(
    user.id,
    decodeURIComponent(params.symbol),
    searchParams,
  );

  if (!data.trades.length) {
    notFound();
  }

  const tradesWithPnl = data.trades.map((trade) => {
    const pnl = calculateTradePnl(trade);
    return { ...trade, _realizedPnl: pnl.realizedPnl };
  });
  const totalRealizedPnl = tradesWithPnl.reduce(
    (sum, t) => sum + t._realizedPnl,
    0,
  );

  return (
    <div className="space-y-5 sm:space-y-8">
      <section className="flex items-center justify-between rounded-2xl border border-line bg-white px-4 py-3 shadow-sm sm:px-6 sm:py-4">
        <div className="flex items-center gap-3 sm:gap-4">
          <Link
            href="/trades"
            className="text-sm text-slate-500 hover:text-accent"
          >
            ← Journal
          </Link>
          <h1 className="font-display text-lg font-semibold uppercase text-ink sm:text-xl">
            {data.symbol}
          </h1>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4">
        <MetricCard
          label="Closed Trades"
          value={String(data.metrics.totalTrades)}
        />
        <MetricCard
          label="Open Trades"
          value={String(data.metrics.openTrades)}
        />
        <MetricCard
          label="Win Rate"
          value={formatPercent(data.metrics.winRate)}
          tone="profit"
        />
        <MetricCard
          label="Net Realized P&L"
          value={formatCurrency(totalRealizedPnl)}
          tone={totalRealizedPnl >= 0 ? "profit" : "loss"}
        />
      </section>

      <section className="space-y-4 sm:space-y-6">
        {tradesWithPnl.map((trade) => (
          <article
            key={trade.id}
            className="rounded-2xl border border-line bg-white p-4 shadow-sm sm:p-6"
          >
            <div className="flex flex-col gap-4 sm:gap-6 xl:grid xl:grid-cols-[1.15fr_0.85fr]">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="rounded-full bg-accent/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-accent">
                      {trade.status}
                    </span>
                    <span className={`rounded-full px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] ${trade.tradeType === "LONG" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-600"}`}>
                      {trade.tradeType === "LONG" ? "Long" : "Short"}
                    </span>
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
                      {trade.segment}
                    </span>
                  </div>
                  <Link
                    href={`/trades/${encodeURIComponent(trade.symbol)}/edit/${trade.id}`}
                    className="rounded-full border border-line bg-white px-4 py-2 text-sm font-medium text-slate-600 hover:border-accent hover:text-accent"
                  >
                    Edit Trade
                  </Link>
                </div>

                <div className="mt-5 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
                  <div className="info-chip">
                    <p className="info-label">Entry</p>
                    <p className="info-value">
                      {formatPrice(getWeightedEntryPrice(trade))}
                    </p>
                  </div>
                  <div className="info-chip">
                    <p className="info-label">Exit</p>
                    <p className="info-value">
                      {getWeightedExitPrice(trade) > 0
                        ? formatPrice(getWeightedExitPrice(trade))
                        : "--"}
                    </p>
                  </div>
                  <div className="info-chip">
                    <p className="info-label">Closing Price</p>
                    <p className="info-value">
                      {trade.closingPrice
                        ? formatPrice(trade.closingPrice)
                        : "--"}
                    </p>
                  </div>
                  <div className="info-chip">
                    <p className="info-label">Marked Price</p>
                    <p className="info-value">
                      {trade.closingPrice
                        ? formatPrice(trade.closingPrice)
                        : getWeightedExitPrice(trade) > 0
                          ? formatPrice(getWeightedExitPrice(trade))
                          : "--"}
                    </p>
                  </div>
                </div>

                <div className="mt-6 grid gap-4 sm:grid-cols-2">
                  <div className="rounded-xl border border-line bg-canvas p-4">
                    <p className="text-sm text-slate-500">Execution Window</p>
                    <p className="mt-3 text-sm leading-7 text-slate-700">
                      Entry: {formatDateTime(getFirstEntryTime(trade))}
                      <br />
                      Exit:{" "}
                      {getLastExitTime(trade)
                        ? formatDateTime(getLastExitTime(trade)!)
                        : "Still open"}
                    </p>
                  </div>
                  <div className="rounded-xl border border-line bg-canvas p-4">
                    <p className="text-sm text-slate-500">Notes & tags</p>
                    <p className="mt-3 text-sm leading-7 text-slate-700">
                      {trade.notes || "No notes added."}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {parseTags(trade.tags).map((tag) => (
                        <span
                          key={tag}
                            className="rounded-full border border-line bg-white px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-slate-500"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="mt-5 grid grid-cols-2 gap-3 sm:gap-4 sm:grid-cols-4">
                  <div className="info-chip">
                    <p className="info-label">Qty</p>
                    <p className="info-value">
                      {formatNumber(getTotalEntryQty(trade))}
                    </p>
                  </div>
                  <div className="info-chip">
                    <p className="info-label">Capital</p>
                    <p className="info-value">
                      {formatNumber(trade.capitalUsed)}
                    </p>
                  </div>
                  <div className="info-chip">
                    <p className="info-label">Charges</p>
                    <p className="info-value">{formatNumber(trade.charges)}</p>
                  </div>
                  <div className="info-chip">
                    <p className="info-label">Realized P&L</p>
                    <p
                      className={`info-value ${trade._realizedPnl >= 0 ? "text-profit" : "text-loss"}`}
                    >
                      {formatCurrency(trade._realizedPnl)}
                    </p>
                  </div>
                </div>

                <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
                  <div className="rounded-lg border border-line bg-white px-3 py-2">
                    <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">Setup</p>
                    <p className="mt-1 truncate text-xs font-semibold text-slate-700" title={trade.setup || ""}>
                      {compactAttribute(trade.setup)}
                    </p>
                  </div>
                  <div className="rounded-lg border border-line bg-white px-3 py-2">
                    <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">Plan Followed?</p>
                    <p className="mt-1 text-xs font-semibold text-slate-700">
                      {trade.planFollowed === null
                        ? "--"
                        : trade.planFollowed
                          ? "Yes"
                          : "No"}
                    </p>
                  </div>
                  <div className="rounded-lg border border-line bg-white px-3 py-2">
                    <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">Avoidable?</p>
                    <p className="mt-1 text-xs font-semibold text-slate-700">
                      {trade.avoidable == null
                        ? "--"
                        : trade.avoidable
                          ? `Yes${trade.avoidableReason ? ` - ${trade.avoidableReason}` : ""}`
                          : "No"}
                    </p>
                  </div>
                  <div className="rounded-lg border border-line bg-white px-3 py-2">
                    <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">Exit Trigger</p>
                    <p className="mt-1 truncate text-xs font-semibold text-slate-700" title={trade.exitTrigger || ""}>
                      {compactAttribute(trade.exitTrigger)}
                    </p>
                  </div>
                  <div className="rounded-lg border border-line bg-white px-3 py-2">
                    <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">Proficiency</p>
                    <p className="mt-1 truncate text-xs font-semibold text-slate-700" title={trade.proficiency || ""}>
                      {compactAttribute(trade.proficiency)}
                    </p>
                  </div>
                  <div className="rounded-lg border border-line bg-white px-3 py-2">
                    <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">Growth Areas</p>
                    <p className="mt-1 truncate text-xs font-semibold text-slate-700" title={trade.growthAreas || ""}>
                      {compactAttribute(trade.growthAreas)}
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <ImageUpload tradeId={trade.id} />
                <div className="grid gap-3 sm:grid-cols-2">
                  {trade.images.map((image) => (
                    <div
                      key={image.id}
                      className="overflow-hidden rounded-xl border border-line bg-canvas"
                    >
                      <div className="relative aspect-[4/3]">
                        <Image
                          src={image.imageUrl}
                          alt={`${trade.symbol} chart`}
                          fill
                          className="object-cover"
                        />
                      </div>
                    </div>
                  ))}
                  {!trade.images.length ? (
                    <div className="rounded-xl border border-dashed border-line bg-canvas px-5 py-8 text-sm text-slate-500 sm:col-span-2">
                      No chart screenshots attached yet.
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
