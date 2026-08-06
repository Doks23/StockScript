/**
 * EOD prices for open positions, from Yahoo Finance's public chart endpoint.
 * ─────────────────────────────────────────────────────────────────────
 * No API key, no account. Not a contractual API - treat every response as
 * best-effort and never let a failure here corrupt a stored price.
 *
 * The hard part is not fetching, it is knowing WHICH instrument a journal
 * symbol refers to. Journal symbols came from CSV "Name" columns, so they are
 * often company names ("KALYAN JEWELLERS") rather than exchange tickers
 * (KALYANKJIL). Worse, some names collide with a real but unrelated ticker:
 * APOLLO.NS resolves happily to Apollo Micro Systems, which is almost certainly
 * not the Apollo the user traded.
 *
 * So resolution never silently commits. A symbol is only auto-priced once a
 * mapping has been confirmed and stored; anything newly guessed comes back as a
 * proposal carrying the company name, for a human to accept once.
 * ─────────────────────────────────────────────────────────────────────
 */

import { z } from "zod";

const CHART_BASE = "https://query1.finance.yahoo.com/v8/finance/chart";
const SEARCH_BASE = "https://query1.finance.yahoo.com/v1/finance/search";

/**
 * Deliberately minimal, and verified rather than assumed: a full Chrome UA
 * string gets a hard 429 on the first request, while this one and even no UA at
 * all return 200. Yahoo appears to flag a browser UA arriving without a
 * browser's TLS fingerprint. Do not "improve" this into a realistic UA.
 */
const USER_AGENT = "Mozilla/5.0";

/**
 * Yahoo publishes no rate limit and answers 429 with no Retry-After. Testing
 * ~75 requests in quick succession got every one of them refused, so pace
 * conservatively and back off hard rather than optimising for speed - this runs
 * once a day over a handful of symbols.
 */
const THROTTLE_MS = 400;
const TIMEOUT_MS = 12_000;
const MAX_RETRIES = 4;
/** Backoff before retry N, in ms. Generous because a 429 here is sticky. */
const BACKOFF_MS = [1_000, 3_000, 8_000, 15_000];

/** Indian listings. NSE first - it is the primary venue for these journals. */
const SUFFIXES = [".NS", ".BO"] as const;

export class QuoteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QuoteError";
  }
}

// ─────────────────────────────────────────────────────────────────────
// Response shapes - only the fields consumed are validated
// ─────────────────────────────────────────────────────────────────────

const chartSchema = z.object({
  chart: z.object({
    result: z
      .array(
        z.object({
          meta: z.object({
            symbol: z.string().nullish(),
            currency: z.string().nullish(),
            longName: z.string().nullish(),
            shortName: z.string().nullish(),
            regularMarketPrice: z.number().nullish(),
            chartPreviousClose: z.number().nullish(),
          }),
          timestamp: z.array(z.number()).nullish(),
          indicators: z
            .object({
              quote: z
                .array(z.object({ close: z.array(z.number().nullable()).nullish() }))
                .nullish(),
            })
            .nullish(),
        }),
      )
      .nullish(),
    error: z.unknown().nullish(),
  }),
});

const searchSchema = z.object({
  quotes: z
    .array(
      z.object({
        symbol: z.string().nullish(),
        shortname: z.string().nullish(),
        longname: z.string().nullish(),
        exchange: z.string().nullish(),
        quoteType: z.string().nullish(),
      }),
    )
    .nullish(),
});

export type Quote = {
  /** Yahoo symbol the price actually came from, e.g. "KALYANKJIL.NS". */
  quoteSymbol: string;
  /** Company name as Yahoo reports it - the only way a human spots a bad match. */
  name: string | null;
  price: number;
  /** Which session's close this is. Lets the caller show "close of 5 Aug". */
  asOf: Date | null;
  currency: string | null;
};

// ─────────────────────────────────────────────────────────────────────
// HTTP
// ─────────────────────────────────────────────────────────────────────

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getJson(url: string): Promise<unknown | null> {
  let lastError: QuoteError | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
        cache: "no-store",
        signal: controller.signal,
      });

      // 404 means "no such symbol", which is an answer, not a failure.
      if (response.status === 404) return null;

      if (response.status === 429 || response.status >= 500) {
        lastError = new QuoteError(
          response.status === 429
            ? "Yahoo is rate limiting this address. Wait a few minutes and try again."
            : `Yahoo returned ${response.status}.`,
        );
        if (attempt < MAX_RETRIES) {
          await sleep(BACKOFF_MS[attempt]);
          continue;
        }
        throw lastError;
      }

      if (!response.ok) throw new QuoteError(`Yahoo returned ${response.status}.`);

      return await response.json();
    } catch (error) {
      if (error instanceof QuoteError) throw error;
      const message =
        (error as Error).name === "AbortError"
          ? "Yahoo timed out."
          : `Could not reach Yahoo (${(error as Error).message}).`;
      lastError = new QuoteError(message);
      if (attempt < MAX_RETRIES) {
        await sleep(BACKOFF_MS[attempt]);
        continue;
      }
      throw lastError;
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError ?? new QuoteError("Yahoo request failed.");
}

/**
 * Last settled daily close for one exact Yahoo symbol, or null if unknown.
 *
 * Prefers the final daily candle over meta.regularMarketPrice so the value is a
 * genuine session close with a date attached. Mid-session the last candle is
 * today's partial bar, so asOf tells the caller which day they actually got.
 */
export async function fetchQuote(quoteSymbol: string): Promise<Quote | null> {
  const raw = await getJson(
    `${CHART_BASE}/${encodeURIComponent(quoteSymbol)}?range=5d&interval=1d`,
  );
  if (!raw) return null;

  const parsed = chartSchema.safeParse(raw);
  if (!parsed.success) return null;

  const result = parsed.data.chart.result?.[0];
  if (!result) return null;

  const closes = result.indicators?.quote?.[0]?.close ?? [];
  const stamps = result.timestamp ?? [];

  let price: number | null = null;
  let asOf: Date | null = null;
  for (let i = closes.length - 1; i >= 0; i--) {
    const close = closes[i];
    if (typeof close === "number" && Number.isFinite(close)) {
      price = close;
      asOf = typeof stamps[i] === "number" ? new Date(stamps[i] * 1000) : null;
      break;
    }
  }

  // Fall back to the meta price only if the series was unusable.
  if (price === null) {
    const meta = result.meta.regularMarketPrice ?? result.meta.chartPreviousClose;
    if (typeof meta !== "number" || !Number.isFinite(meta)) return null;
    price = meta;
  }

  if (price <= 0) return null;

  return {
    quoteSymbol: result.meta.symbol ?? quoteSymbol,
    name: result.meta.longName ?? result.meta.shortName ?? null,
    // Yahoo serves float32, so a clean 2763.90 arrives as 2763.89990234375.
    // Round here, at the single point prices enter the system, so both the
    // preview and the stored value are the same tidy number.
    price: Math.round(price * 100) / 100,
    asOf,
    currency: result.meta.currency ?? null,
  };
}

/**
 * Price for a ticker a human supplied, tolerating a missing exchange suffix.
 *
 * People type "NIITLTD", not "NIITLTD.NS". Without this the mapping saves, then
 * silently returns no price on every future run - which is exactly what
 * happened before this existed.
 */
export async function fetchQuoteFlexible(ticker: string): Promise<Quote | null> {
  const raw = ticker.trim().toUpperCase();
  if (!raw) return null;

  const attempts = /\.[A-Z]{2}$/.test(raw)
    ? [raw]
    : [raw, ...SUFFIXES.map((suffix) => `${raw}${suffix}`)];

  for (const attempt of attempts) {
    const quote = await fetchQuote(attempt);
    await sleep(THROTTLE_MS);
    if (quote) return quote;
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────
// Resolution: journal symbol -> Yahoo symbol
// ─────────────────────────────────────────────────────────────────────

/**
 * Candidate tickers to try directly, most likely first.
 *
 * Request budget matters more than coverage here: every miss is a wasted call
 * against an endpoint that rate limits aggressively. A symbol containing spaces
 * or punctuation is a company name, not a ticker, so only its collapsed form is
 * worth one speculative try - the search endpoint handles those far better.
 */
export function candidateSymbols(journalSymbol: string): string[] {
  const upper = journalSymbol.trim().toUpperCase();
  const bare = upper.replace(/[^A-Z0-9]/g, "");
  if (!bare) return [];

  const isSingleToken = /^[A-Z0-9]+$/.test(upper);

  // Single clean token: very likely already a ticker, so both exchanges are
  // worth trying. Anything else: one cheap guess at the collapsed form.
  return isSingleToken ? SUFFIXES.map((suffix) => `${bare}${suffix}`) : [`${bare}.NS`];
}

export type Resolution =
  | { kind: "resolved"; quote: Quote; via: "direct" | "search" }
  | { kind: "ambiguous"; options: { quoteSymbol: string; name: string | null }[] }
  | { kind: "unresolved" };

/**
 * Work out which Yahoo symbol a journal symbol means.
 *
 * A direct ticker hit is returned as `via: "direct"`, but that is NOT proof the
 * instrument is right - see the APOLLO case in the file header. Callers must
 * still have a human confirm anything not already stored.
 */
export async function resolveSymbol(journalSymbol: string): Promise<Resolution> {
  for (const candidate of candidateSymbols(journalSymbol)) {
    const quote = await fetchQuote(candidate);
    await sleep(THROTTLE_MS);
    if (quote) return { kind: "resolved", quote, via: "direct" };
  }

  // Nothing matched as a ticker, so treat the journal symbol as a company name.
  const raw = await getJson(
    `${SEARCH_BASE}?q=${encodeURIComponent(journalSymbol)}&quotesCount=10&newsCount=0`,
  );
  await sleep(THROTTLE_MS);
  if (!raw) return { kind: "unresolved" };

  const parsed = searchSchema.safeParse(raw);
  if (!parsed.success) return { kind: "unresolved" };

  const indian = (parsed.data.quotes ?? []).filter(
    (q) =>
      q.symbol &&
      SUFFIXES.some((suffix) => q.symbol!.endsWith(suffix)) &&
      (q.quoteType ?? "EQUITY").toUpperCase() === "EQUITY",
  );

  if (indian.length === 0) return { kind: "unresolved" };

  // Most multi-hit results are one company listed on both NSE and BSE, which is
  // not a decision worth interrupting anyone for. Only distinct companies are
  // genuinely ambiguous - NIIT Limited vs NIIT Learning Systems is a real choice,
  // KALYANKJIL.NS vs KALYANKJIL.BO is not.
  const companies = new Map<string, typeof indian>();
  for (const candidate of indian) {
    const key = normaliseCompany(candidate.longname ?? candidate.shortname ?? candidate.symbol!);
    const bucket = companies.get(key);
    if (bucket) bucket.push(candidate);
    else companies.set(key, [candidate]);
  }

  if (companies.size > 1) {
    return {
      kind: "ambiguous",
      // One row per company, preferring its NSE listing.
      options: [...companies.values()].slice(0, 5).map((group) => {
        const best = preferNse(group);
        return { quoteSymbol: best.symbol!, name: best.longname ?? best.shortname ?? null };
      }),
    };
  }

  const chosen = preferNse([...companies.values()][0]);
  const quote = await fetchQuote(chosen.symbol!);
  await sleep(THROTTLE_MS);
  return quote ? { kind: "resolved", quote, via: "search" } : { kind: "unresolved" };
}

/** Company names differ only in legal suffix and punctuation across listings. */
function normaliseCompany(name: string): string {
  return name
    .toUpperCase()
    .replace(/\b(LIMITED|LTD|PVT|PRIVATE|INDIA|CO|CORPORATION|INC)\b/g, "")
    .replace(/[^A-Z0-9]/g, "");
}

function preferNse<T extends { symbol?: string | null }>(group: T[]): T {
  return group.find((item) => item.symbol?.endsWith(".NS")) ?? group[0];
}
