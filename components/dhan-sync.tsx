"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { DhanTokenField, useDhanToken } from "@/components/dhan-token-field";
import { runExcursionRefresh } from "@/lib/excursion-refresh";

type PreviewTrade = {
  /** Server-side identity of the trade, sent back to say what to import. */
  key: string;
  symbol: string;
  /** TradingView ticker from Dhan's security list; null when unmapped. */
  ticker: string | null;
  segment: string;
  tradeType: string;
  status: string;
  legs: number;
  firstEntryAt: string;
  charges: number;
  netPnl: number;
};

type SyncResult = {
  dryRun: boolean;
  dhanClientId: string | null;
  tokenValidity: string | null;
  fromDate: string;
  toDate: string;
  dateBasis: "watermark" | "first-run";
  watermarkAt: string | null;
  fetchedFills: number;
  skippedNonEquity: number;
  skippedAlreadyStored: number;
  newFills: number;
  plannedTrades: number;
  plannedOpen: number;
  plannedClosed: number;
  preview: PreviewTrade[];
  parseErrors: string[];
  warnings: string[];
  imported?: number;
  /** Chart tickers filled in from Dhan's security list by this import. */
  tickersAdded?: number;
};

export function DhanSync({
  competitions,
  onImported,
}: {
  competitions: { id: string; name: string }[];
  /**
   * Called instead of navigating once trades are actually written, so a caller
   * that already sits on the journal can close its dialog and refresh in place.
   */
  onImported?: (imported: number) => void;
}) {
  const router = useRouter();
  const { accessToken, setAccessToken, expiresAt, remember, forget } = useDhanToken();
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [competitionId, setCompetitionId] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [phase, setPhase] = useState<"idle" | "previewed" | "committed">("idle");
  const [error, setError] = useState("");
  const [result, setResult] = useState<SyncResult | null>(null);
  /**
   * Rows the user has ticked, by preview key. Everything arrives ticked, so
   * this only ever records deliberate opt-outs; a fresh preview replaces it.
   */
  const [selected, setSelected] = useState<Set<string>>(new Set());

  async function callSync(commit: boolean) {
    setIsLoading(true);
    setError("");

    try {
      const response = await fetch("/api/trades/sync-dhan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accessToken,
          commit,
          fromDate: fromDate || undefined,
          toDate: toDate || undefined,
          competitionId: competitionId || undefined,
          // Only the commit needs to say what to import; the preview asks for
          // everything in the range.
          selectedKeys: commit ? [...selected] : undefined,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Sync failed.");
        return;
      }

      setResult(data as SyncResult);
      // The call went through, so this token is known good - keep it for the
      // rest of its 24 hours instead of asking for it again on the next sync.
      remember(accessToken);

      if (commit) {
        // Measure the new trades' MAE / MFE while the token is at hand, and
        // refresh open positions. It carries on in the background, past the
        // navigation below; the MAE / MFE tab reads whatever it stored.
        void runExcursionRefresh(accessToken, "pending").catch((err) =>
          console.warn("MAE / MFE refresh after the Dhan import failed:", err),
        );
        setPhase("committed");
        setSelected(new Set());
        const imported = (data as SyncResult).imported ?? 0;
        // The point of an import is the journal it lands in, so end up there
        // either way - in place when the caller is already on it, otherwise by
        // navigating, with the count carried across for the confirmation.
        if (onImported) onImported(imported);
        else router.push(`/trades?imported=${imported}`);
      } else {
        setPhase("previewed");
        // Everything is fair game by default - unticking is the exception.
        setSelected(
          new Set((data as SyncResult).preview.map((trade) => trade.key)),
        );
        // Keep the resolved range visible and editable for the commit call.
        setFromDate(data.fromDate);
        setToDate(data.toDate);
      }
    } catch (err) {
      setError((err as Error).message || "Sync failed.");
    } finally {
      setIsLoading(false);
    }
  }

  function reset() {
    setPhase("idle");
    setResult(null);
    setSelected(new Set());
    setError("");
    setFromDate("");
    setToDate("");
  }

  function toggle(key: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const canPreview = accessToken.trim().length > 0 && !isLoading;
  const isPreviewing = phase === "previewed" && result !== null && result.dryRun;

  /** What the Import button will actually write, after any unticking. */
  const selectedTrades = useMemo(
    () => (result?.preview ?? []).filter((trade) => selected.has(trade.key)),
    [result, selected],
  );
  const allSelected =
    isPreviewing && result.preview.length > 0 &&
    selectedTrades.length === result.preview.length;

  return (
    <div className="space-y-4 rounded-2xl border border-line bg-white p-6 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="flex items-center gap-2 text-base font-semibold text-ink">
            <Download className="h-4 w-4 text-accent" />
            Sync from Dhan
          </h3>
          <p className="mt-1 text-sm text-muted">
            Pulls your equity trades directly from Dhan. Equity only for now &mdash; F&amp;O fills are skipped.
          </p>
        </div>
        {phase !== "idle" && (
          <button
            type="button"
            onClick={reset}
            className="shrink-0 text-xs text-muted underline hover:text-ink"
          >
            Start over
          </button>
        )}
      </div>

      {/* Token */}
      <DhanTokenField
        id="dhan-token"
        accessToken={accessToken}
        onChange={setAccessToken}
        expiresAt={expiresAt}
        onForget={forget}
      />

      {/* Optional overrides */}
      <details className="rounded-lg border border-line/70 px-3 py-2">
        <summary className="cursor-pointer text-sm text-muted">
          Date range {phase === "idle" ? "(auto: from your last journal trade)" : "override"}
        </summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <label className="block text-xs text-muted" htmlFor="dhan-from">From</label>
            <input
              id="dhan-from"
              type="date"
              value={fromDate}
              onChange={(event) => setFromDate(event.target.value)}
              className="mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-accent"
            />
          </div>
          <div>
            <label className="block text-xs text-muted" htmlFor="dhan-to">To</label>
            <input
              id="dhan-to"
              type="date"
              value={toDate}
              onChange={(event) => setToDate(event.target.value)}
              className="mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-accent"
            />
          </div>
        </div>
        {competitions.length > 0 && (
          <div className="mt-3">
            <label className="block text-xs text-muted" htmlFor="dhan-competition">
              Competition (optional)
            </label>
            <select
              id="dhan-competition"
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
        <p className="mt-2 text-xs text-muted">
          Leave blank to sync from the date of your most recent journal trade up to today &mdash; the same range you would pick by hand.
        </p>
      </details>

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={!canPreview}
          onClick={() => callSync(false)}
          className="inline-flex items-center gap-2 rounded-lg bg-ink px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
        >
          {isLoading && phase !== "previewed" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          Preview sync
        </button>

        {isPreviewing && result.plannedTrades > 0 && (
          <button
            type="button"
            disabled={
              isLoading ||
              accessToken.trim().length === 0 ||
              selectedTrades.length === 0
            }
            onClick={() => callSync(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
          >
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            {selectedTrades.length === 0
              ? "Nothing selected"
              : `Import ${selectedTrades.length} trade${selectedTrades.length === 1 ? "" : "s"}`}
          </button>
        )}
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Result */}
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
                Imported {result.imported} trade{result.imported === 1 ? "" : "s"}
              </>
            )}
          </div>

          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted sm:grid-cols-3">
            <div>
              Range: <span className="text-ink">{result.fromDate} &rarr; {result.toDate}</span>
              {result.dateBasis === "first-run" && " (first run)"}
            </div>
            <div>Fills fetched: <span className="text-ink">{result.fetchedFills}</span></div>
            <div>New fills: <span className="text-ink">{result.newFills}</span></div>
            <div>Already in journal: <span className="text-ink">{result.skippedAlreadyStored}</span></div>
            <div>F&amp;O skipped: <span className="text-ink">{result.skippedNonEquity}</span></div>
            <div>
              Trades: <span className="text-ink">{result.plannedTrades}</span>
              {" "}({result.plannedClosed} closed, {result.plannedOpen} open)
            </div>
          </div>

          {!result.dryRun && (result.tickersAdded ?? 0) > 0 && (
            <p className="text-xs text-muted">
              {result.tickersAdded} chart ticker
              {result.tickersAdded === 1 ? "" : "s"} filled in from Dhan&rsquo;s security
              list.
            </p>
          )}

          {result.tokenValidity && (
            <p className="text-xs text-muted">Token valid until {result.tokenValidity}</p>
          )}

          {result.plannedTrades === 0 && result.dryRun && (
            <p className="text-sm text-muted">
              Nothing new to import &mdash; your journal is already up to date for this range.
            </p>
          )}

          {result.preview.length > 0 && (
            <div className="space-y-2">
              {isPreviewing && (
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
                  <span>
                    {selectedTrades.length} of {result.preview.length} selected for
                    import
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setSelected(
                        allSelected
                          ? new Set()
                          : new Set(result.preview.map((trade) => trade.key)),
                      )
                    }
                    className="underline hover:text-ink"
                  >
                    {allSelected ? "Clear all" : "Select all"}
                  </button>
                </div>
              )}
            <div className="overflow-x-auto sticky-head">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-line text-left text-muted">
                    {isPreviewing && (
                      <th className="w-8 py-1.5 pr-2 font-medium">
                        <span className="sr-only">Import</span>
                      </th>
                    )}
                    <th className="py-1.5 pr-3 font-medium">Symbol</th>
                    <th className="py-1.5 pr-3 font-medium">Segment</th>
                    <th className="py-1.5 pr-3 font-medium">Type</th>
                    <th className="py-1.5 pr-3 font-medium">Status</th>
                    <th className="py-1.5 pr-3 font-medium">Legs</th>
                    <th className="py-1.5 pr-3 text-right font-medium">Charges</th>
                    <th className="py-1.5 text-right font-medium">Net P&amp;L</th>
                  </tr>
                </thead>
                <tbody>
                  {result.preview.map((trade, index) => {
                    const isChosen = selected.has(trade.key);
                    return (
                    <tr
                      key={trade.key || `${trade.symbol}-${index}`}
                      className={`border-b border-line/50 ${
                        isPreviewing && !isChosen ? "opacity-40" : ""
                      }`}
                    >
                      {isPreviewing && (
                        <td className="py-1.5 pr-2">
                          <input
                            type="checkbox"
                            checked={isChosen}
                            onChange={() => toggle(trade.key)}
                            aria-label={`Import ${trade.symbol}`}
                            className="h-3.5 w-3.5 cursor-pointer accent-accent"
                          />
                        </td>
                      )}
                      <td className="py-1.5 pr-3">
                        {/* The ticker is the name on the chart, so it leads;
                            the statement's company name stays underneath so a
                            wrong mapping is visible before it is imported. */}
                        <span className="font-medium text-ink">
                          {trade.ticker ?? trade.symbol}
                        </span>
                        {trade.ticker && trade.ticker !== trade.symbol && (
                          <span className="block text-[11px] text-muted">
                            {trade.symbol}
                          </span>
                        )}
                      </td>
                      <td className="py-1.5 pr-3">{trade.segment}</td>
                      <td className="py-1.5 pr-3">{trade.tradeType}</td>
                      <td className="py-1.5 pr-3">{trade.status}</td>
                      <td className="py-1.5 pr-3">{trade.legs}</td>
                      <td className="py-1.5 pr-3 text-right">{trade.charges.toFixed(2)}</td>
                      <td
                        className={`py-1.5 text-right ${
                          trade.netPnl > 0
                            ? "text-green-600"
                            : trade.netPnl < 0
                              ? "text-red-600"
                              : ""
                        }`}
                      >
                        {trade.netPnl.toFixed(2)}
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
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
    </div>
  );
}
