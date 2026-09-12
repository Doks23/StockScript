"use client";

import { useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  PlusCircle,
  ReceiptText,
  RefreshCw,
  Zap,
} from "lucide-react";
import { DhanTokenField, useDhanToken } from "@/components/dhan-token-field";
import { runExcursionRefresh } from "@/lib/excursion-refresh";

type PreviewRow = {
  kind: "attach" | "create";
  symbol: string;
  segment: string;
  tradeType: string;
  status: string;
  newLegs: number;
  totalLegs: number;
  openQty: number;
  netPnl: number;
};

type OrderCounts = {
  traded: number;
  partTraded: number;
  cancelled: number;
  rejected: number;
  other: number;
};

type TodayResult = {
  dryRun: boolean;
  dhanClientId: string | null;
  tokenValidity: string | null;
  fetchedFills: number;
  skippedNonEquity: number;
  skippedAlreadyStored: number;
  newFills: number;
  attachedTrades: number;
  createdTrades: number;
  orderCounts: OrderCounts;
  unmappedSymbols: string[];
  preview: PreviewRow[];
  parseErrors: string[];
  warnings: string[];
  applied?: number;
  tickersAdded?: number;
};

type ChargesResult = {
  date: string | null;
  dryRun?: boolean;
  pendingRows: number;
  statementFills?: number;
  matched: number;
  chargesApplied: number;
  tradesUpdated: number;
  unmatchedStatementFills: string[];
  unmatchedJournalRows: string[];
  warnings: string[];
};

/**
 * Today's fills, straight from Dhan's live trade book.
 *
 * Deliberately its own panel rather than a mode on the existing Dhan sync:
 * different API, different guarantees (no charges yet), and a different mental
 * model - this one changes positions you already hold instead of only adding
 * history.
 */
export function DhanTodaySync({
  competitions,
  onApplied,
}: {
  competitions: { id: string; name: string }[];
  /**
   * needsAttention says the result carries something worth reading, so the
   * caller keeps the dialog open instead of closing it on a clean apply.
   */
  onApplied?: (applied: number, needsAttention: boolean) => void;
}) {
  const { accessToken, setAccessToken, expiresAt, remember, forget } = useDhanToken();
  const [competitionId, setCompetitionId] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [phase, setPhase] = useState<"idle" | "previewed" | "applied">("idle");
  const [error, setError] = useState("");
  const [result, setResult] = useState<TodayResult | null>(null);

  const [chargesDate, setChargesDate] = useState("");
  const [chargesLoading, setChargesLoading] = useState(false);
  const [charges, setCharges] = useState<ChargesResult | null>(null);

  async function callSync(commit: boolean) {
    setIsLoading(true);
    setError("");

    try {
      const response = await fetch("/api/trades/sync-today", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accessToken,
          commit,
          competitionId: competitionId || undefined,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        setError(data.error || "Sync failed.");
        return;
      }

      setResult(data as TodayResult);
      // Proved good by the round trip - keep it for the rest of its 24 hours.
      remember(accessToken);

      if (commit) {
        // Today's fills open, add to or close positions - measure their MAE /
        // MFE now, in the background, while the token is at hand.
        void runExcursionRefresh(accessToken, "pending").catch((err) =>
          console.warn("MAE / MFE refresh after today's sync failed:", err),
        );
        const applied = data as TodayResult;
        setPhase("applied");
        onApplied?.(
          applied.applied ?? 0,
          applied.warnings.length > 0 ||
            applied.parseErrors.length > 0 ||
            applied.unmappedSymbols.length > 0,
        );
      } else {
        setPhase("previewed");
      }
    } catch (err) {
      setError((err as Error).message || "Sync failed.");
    } finally {
      setIsLoading(false);
    }
  }

  async function callCharges(commit: boolean) {
    setChargesLoading(true);
    setError("");

    try {
      const response = await fetch("/api/trades/sync-today/charges", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accessToken,
          commit,
          date: chargesDate || undefined,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        setError(data.error || "Charge backfill failed.");
        return;
      }

      setCharges(data as ChargesResult);
      remember(accessToken);
      // Charges report their own match counts, so this half stays on screen.
      if (commit) onApplied?.(0, true);
    } catch (err) {
      setError((err as Error).message || "Charge backfill failed.");
    } finally {
      setChargesLoading(false);
    }
  }

  const hasToken = accessToken.trim().length > 0;
  const plannedCount = (result?.attachedTrades ?? 0) + (result?.createdTrades ?? 0);

  return (
    <div className="space-y-4 rounded-2xl border border-line bg-white p-6 shadow-sm">
      <div>
        <h3 className="flex items-center gap-2 text-base font-semibold text-ink">
          <Zap className="h-4 w-4 text-accent" />
          Today&rsquo;s fills
        </h3>
        <p className="mt-1 text-sm text-muted">
          Reads Dhan&rsquo;s live trade book, so today&rsquo;s executed orders land in the journal
          straight away instead of waiting for the end-of-day statement. Sells attach to the
          position you already hold, so P&amp;L and impact update on the spot.
        </p>
      </div>

      <DhanTokenField
        id="dhan-today-token"
        accessToken={accessToken}
        onChange={setAccessToken}
        expiresAt={expiresAt}
        onForget={forget}
      />

      {competitions.length > 0 && (
        <div>
          <label className="block text-xs text-muted" htmlFor="dhan-today-competition">
            Competition (optional)
          </label>
          <select
            id="dhan-today-competition"
            value={competitionId}
            onChange={(event) => setCompetitionId(event.target.value)}
            className="mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-accent"
          >
            <option value="">None</option>
            {competitions.map((competition) => (
              <option key={competition.id} value={competition.id}>
                {competition.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={!hasToken || isLoading}
          onClick={() => callSync(false)}
          className="inline-flex items-center gap-2 rounded-lg bg-ink px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
        >
          {isLoading && phase !== "previewed" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          Preview today
        </button>

        {phase === "previewed" && plannedCount > 0 && (
          <button
            type="button"
            disabled={!hasToken || isLoading}
            onClick={() => callSync(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="h-4 w-4" />
            )}
            Apply to {plannedCount} trade{plannedCount === 1 ? "" : "s"}
          </button>
        )}
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {result && (
        <div className="space-y-3 rounded-lg border border-line bg-paper/50 p-4">
          <div className="flex items-center gap-2 text-sm font-medium text-ink">
            {result.dryRun ? (
              <>
                <RefreshCw className="h-4 w-4 text-accent" />
                Preview &mdash; nothing saved yet
              </>
            ) : (
              <>
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                Applied to {result.applied} trade{result.applied === 1 ? "" : "s"}
                {typeof result.tickersAdded === "number" && result.tickersAdded > 0 && (
                  <span className="font-normal text-muted">
                    &middot; {result.tickersAdded} TradingView ticker
                    {result.tickersAdded === 1 ? "" : "s"} filled in
                  </span>
                )}
              </>
            )}
          </div>

          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted sm:grid-cols-3">
            <div>
              Orders:{" "}
              <span className="text-ink">
                {result.orderCounts.traded} traded
                {result.orderCounts.partTraded > 0 && `, ${result.orderCounts.partTraded} part`}
              </span>
              {result.orderCounts.cancelled > 0 && `, ${result.orderCounts.cancelled} cancelled`}
              {result.orderCounts.rejected > 0 && `, ${result.orderCounts.rejected} rejected`}
            </div>
            <div>Fills today: <span className="text-ink">{result.fetchedFills}</span></div>
            <div>New fills: <span className="text-ink">{result.newFills}</span></div>
            <div>Already in journal: <span className="text-ink">{result.skippedAlreadyStored}</span></div>
            <div>F&amp;O skipped: <span className="text-ink">{result.skippedNonEquity}</span></div>
            <div>
              Positions: <span className="text-ink">{result.attachedTrades} updated</span>,{" "}
              <span className="text-ink">{result.createdTrades} new</span>
            </div>
          </div>

          {result.tokenValidity && (
            <p className="text-xs text-muted">Token valid until {result.tokenValidity}</p>
          )}

          {plannedCount === 0 && result.dryRun && (
            <p className="text-sm text-muted">
              Nothing new &mdash; every fill from today is already in your journal.
            </p>
          )}

          {result.preview.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-line text-left text-muted">
                    <th className="py-1.5 pr-3 font-medium">Action</th>
                    <th className="py-1.5 pr-3 font-medium">Symbol</th>
                    <th className="py-1.5 pr-3 font-medium">Segment</th>
                    <th className="py-1.5 pr-3 font-medium">Status</th>
                    <th className="py-1.5 pr-3 text-right font-medium">New legs</th>
                    <th className="py-1.5 pr-3 text-right font-medium">Open qty</th>
                    <th className="py-1.5 text-right font-medium">Net P&amp;L</th>
                  </tr>
                </thead>
                <tbody>
                  {result.preview.map((row, index) => (
                    <tr key={`${row.symbol}-${index}`} className="border-b border-line/50">
                      <td className="py-1.5 pr-3">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                            row.kind === "attach"
                              ? "bg-blue-50 text-blue-700"
                              : "bg-amber-50 text-amber-700"
                          }`}
                        >
                          {row.kind === "attach" ? (
                            <PlusCircle className="h-3 w-3" />
                          ) : (
                            <AlertTriangle className="h-3 w-3" />
                          )}
                          {row.kind === "attach" ? "Update" : "New"}
                        </span>
                      </td>
                      <td className="py-1.5 pr-3 text-ink">{row.symbol}</td>
                      <td className="py-1.5 pr-3">{row.segment}</td>
                      <td className="py-1.5 pr-3">{row.status}</td>
                      <td className="py-1.5 pr-3 text-right">{row.newLegs}</td>
                      <td className="py-1.5 pr-3 text-right">{row.openQty}</td>
                      <td
                        className={`py-1.5 text-right ${
                          row.netPnl > 0
                            ? "text-green-600"
                            : row.netPnl < 0
                              ? "text-red-600"
                              : ""
                        }`}
                      >
                        {row.netPnl.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {result.warnings.length > 0 && (
            <div className="space-y-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
              <p className="flex items-center gap-1.5 text-xs font-medium text-amber-800">
                <AlertTriangle className="h-3.5 w-3.5" />
                Check these
              </p>
              <ul className="list-disc space-y-0.5 pl-4 text-xs text-amber-800">
                {result.warnings.map((warning, index) => (
                  <li key={index}>{warning}</li>
                ))}
              </ul>
            </div>
          )}

          {result.parseErrors.length > 0 && (
            <details className="text-xs text-muted">
              <summary className="cursor-pointer">
                {result.parseErrors.length} fill(s) skipped
              </summary>
              <ul className="mt-1 list-disc space-y-0.5 pl-4">
                {result.parseErrors.slice(0, 20).map((message, index) => (
                  <li key={index}>{message}</li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}

      {/* Charges arrive with the statement, a day behind the fills. */}
      <details className="rounded-lg border border-line/70 px-3 py-2">
        <summary className="cursor-pointer text-sm text-muted">
          <span className="inline-flex items-center gap-1.5">
            <ReceiptText className="h-3.5 w-3.5" />
            Top up charges for an earlier day
          </span>
        </summary>

        <p className="mt-2 text-xs text-muted">
          The live trade book carries no brokerage or taxes, so rows synced here start at zero
          charges. Once Dhan publishes the statement for that day &mdash; usually the next morning
          &mdash; this fills in the real costs and hands those rows over to the regular Dhan sync.
        </p>

        <div className="mt-3 flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs text-muted" htmlFor="dhan-today-charges-date">
              Day (blank = oldest still waiting)
            </label>
            <input
              id="dhan-today-charges-date"
              type="date"
              value={chargesDate}
              onChange={(event) => setChargesDate(event.target.value)}
              className="mt-1 rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-accent"
            />
          </div>
          <button
            type="button"
            disabled={!hasToken || chargesLoading}
            onClick={() => callCharges(false)}
            className="inline-flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm font-medium text-ink disabled:opacity-40"
          >
            {chargesLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Check
          </button>
          {charges && charges.matched > 0 && (
            <button
              type="button"
              disabled={!hasToken || chargesLoading}
              onClick={() => callCharges(true)}
              className="inline-flex items-center gap-2 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white disabled:opacity-40"
            >
              <CheckCircle2 className="h-4 w-4" />
              Apply {charges.chargesApplied.toFixed(2)} to {charges.tradesUpdated} trade
              {charges.tradesUpdated === 1 ? "" : "s"}
            </button>
          )}
        </div>

        {charges && (
          <div className="mt-3 space-y-2 rounded-lg border border-line bg-paper/50 p-3 text-xs text-muted">
            <div>
              {charges.date ? `${charges.date}: ` : ""}
              <span className="text-ink">{charges.pendingRows}</span> row(s) waiting,{" "}
              <span className="text-ink">{charges.matched}</span> matched to the statement
              {charges.dryRun === false && " and updated"}.
            </div>
            {charges.warnings.map((warning, index) => (
              <p key={index} className="text-amber-700">
                {warning}
              </p>
            ))}
            {charges.unmatchedJournalRows.length > 0 && (
              <details>
                <summary className="cursor-pointer">
                  {charges.unmatchedJournalRows.length} journal row(s) not in the statement
                </summary>
                <ul className="mt-1 list-disc space-y-0.5 pl-4">
                  {charges.unmatchedJournalRows.map((row, index) => (
                    <li key={index}>{row}</li>
                  ))}
                </ul>
              </details>
            )}
            {charges.unmatchedStatementFills.length > 0 && (
              <details>
                <summary className="cursor-pointer">
                  {charges.unmatchedStatementFills.length} statement fill(s) not in the journal
                </summary>
                <ul className="mt-1 list-disc space-y-0.5 pl-4">
                  {charges.unmatchedStatementFills.map((row, index) => (
                    <li key={index}>{row}</li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}
      </details>
    </div>
  );
}
