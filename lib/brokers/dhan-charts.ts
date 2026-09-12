/**
 * Dhan minute bars - the price path between an entry and an exit.
 * ─────────────────────────────────────────────────────────────────────
 * MAE / MFE need to know how low (or high) a stock went AFTER the fill, not
 * across the whole session. Daily bars cannot say that, and Yahoo's minute
 * history reaches back only a week. Dhan's intraday chart endpoint serves
 * 1-minute OHLC for the last five years:
 *
 *   POST /v2/charts/intraday
 *   { securityId, exchangeSegment, instrument, interval, fromDate, toDate }
 *   → { open[], high[], low[], close[], volume[], timestamp[] }
 *
 * Docs: https://dhanhq.co/docs/v2/historical-data/
 *
 * Notes:
 *  - This is a Data API, which Dhan sells separately (₹499/month). An account
 *    without it gets DH-902 / 806, surfaced as DhanDataAccessError so the UI
 *    can say so instead of blaming the token.
 *  - One request may span at most 90 days; longer holds are chunked.
 *  - Data APIs allow 5 requests a second; calls are paced below that.
 *  - Minute bars are not split-adjusted as far as Dhan documents (only daily
 *    bars are). The excursion code checks every fill price against the bars
 *    anyway, so an adjusted series would be caught, not silently used.
 * ─────────────────────────────────────────────────────────────────────
 */

import { z } from "zod";
import { chunkDateRange, DhanApiError, DhanAuthError } from "@/lib/brokers/dhan";

const DHAN_API_BASE = "https://api.dhan.co/v2";

/** Dhan's documented cap is 90 days per request; stay clear of the edge. */
const MAX_WINDOW_DAYS = 85;
/** Data APIs allow 5 requests/second. */
const MIN_GAP_MS = 250;
const BACKOFF_MS = [1_000, 3_000, 8_000];
const TIMEOUT_MS = 20_000;

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const MINUTE_MS = 60_000;

export class DhanDataAccessError extends DhanApiError {
  constructor() {
    super(
      "Your Dhan account does not have the Data API, which minute-level price history needs. Subscribe on web.dhan.co (DhanHQ Trading APIs → Data APIs) and measure again.",
      403,
      false,
    );
    this.name = "DhanDataAccessError";
  }
}

const intradaySchema = z.object({
  high: z.array(z.number().nullable()).nullish(),
  low: z.array(z.number().nullable()).nullish(),
  timestamp: z.array(z.number()).nullish(),
});

/** One bar: [start, end) in epoch ms. */
export type MinuteBar = { start: number; end: number; high: number; low: number };

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let lastCallAt = 0;

async function pace() {
  const wait = lastCallAt + MIN_GAP_MS - Date.now();
  if (wait > 0) await sleep(wait);
  lastCallAt = Date.now();
}

/** Error bodies come in two shapes: trading-style errorCode, or data-style status "failed". */
function isErrorBody(json: unknown) {
  if (!json || typeof json !== "object" || Array.isArray(json)) return false;
  const body = json as Record<string, unknown>;
  return "errorCode" in body || "errorType" in body || body.status === "failed";
}

/**
 * POST with pacing and retries. Returns null when Dhan answers "no data for
 * this window" (DH-907) - a holiday-only range, or a symbol not yet listed -
 * which is an answer, not a failure.
 */
async function dhanPost(path: string, payload: unknown, accessToken: string): Promise<unknown | null> {
  let lastError: DhanApiError | null = null;

  for (let attempt = 0; attempt <= BACKOFF_MS.length; attempt++) {
    await pace();

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch(`${DHAN_API_BASE}${path}`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "access-token": accessToken,
        },
        body: JSON.stringify(payload),
        cache: "no-store",
        signal: controller.signal,
      });
    } catch (error) {
      lastError = new DhanApiError(
        (error as Error).name === "AbortError"
          ? "Dhan timed out."
          : `Could not reach Dhan (${(error as Error).message}).`,
        undefined,
        true,
      );
      if (attempt < BACKOFF_MS.length) {
        await sleep(BACKOFF_MS[attempt]);
        continue;
      }
      throw lastError;
    } finally {
      clearTimeout(timer);
    }

    const text = await response.text();
    let json: unknown = null;
    try {
      json = text.trim() ? JSON.parse(text) : null;
    } catch {
      json = null;
    }

    if (response.ok && !isErrorBody(json)) {
      if (json === null) throw new DhanApiError("Dhan returned a response that was not valid JSON.");
      return json;
    }

    // Only error bodies are searched for codes - a successful body is a wall of
    // prices, and a price of 806 must not read as "not subscribed".
    const excerpt = text.slice(0, 400);
    if (/DH-902|\b806\b/.test(excerpt)) throw new DhanDataAccessError();
    if (/DH-901|\b80[789]\b|\b810\b/.test(excerpt) || response.status === 401) {
      throw new DhanAuthError();
    }
    if (/DH-907/.test(excerpt)) return null;

    if (response.status === 429 || response.status >= 500 || /DH-904|\b805\b/.test(excerpt)) {
      lastError = new DhanApiError(
        response.status === 429 || /DH-904|\b805\b/.test(excerpt)
          ? "Dhan rate limit hit."
          : `Dhan returned ${response.status}.`,
        response.status,
        true,
      );
      if (attempt < BACKOFF_MS.length) {
        await sleep(BACKOFF_MS[attempt]);
        continue;
      }
      throw lastError;
    }

    throw new DhanApiError(`Dhan returned ${response.status}. ${excerpt}`.trim(), response.status);
  }

  throw lastError ?? new DhanApiError("Dhan request failed.");
}

/** Minutes past IST midnight. */
function istMinuteOfDay(ms: number) {
  const date = new Date(ms + IST_OFFSET_MS);
  return date.getUTCHours() * 60 + date.getUTCMinutes();
}

const SESSION_OPEN = 9 * 60; // 09:00, pre-open included
const SESSION_CLOSE = 15 * 60 + 45;

function shareInSession(bars: MinuteBar[], shift: number) {
  if (bars.length === 0) return 0;
  const inside = bars.filter((bar) => {
    const minute = istMinuteOfDay(bar.start + shift);
    return minute >= SESSION_OPEN && minute <= SESSION_CLOSE;
  }).length;
  return inside / bars.length;
}

/**
 * Guard against a bar clock that is 5h30m off.
 *
 * Dhan documents these timestamps as plain epoch seconds, but IST wall-clock
 * written as if it were UTC is a common failure in Indian market feeds, and
 * this entire analysis hinges on which minute the fill landed in. If bars fall
 * outside market hours and moving them back 5h30m puts them inside, they were
 * IST-as-UTC; correct them rather than measure every trade against the wrong
 * minutes.
 */
export function normalizeSessionClock(bars: MinuteBar[]): MinuteBar[] {
  if (shareInSession(bars, 0) >= 0.5) return bars;
  if (shareInSession(bars, -IST_OFFSET_MS) < 0.9) return bars;
  return bars.map((bar) => ({
    ...bar,
    start: bar.start - IST_OFFSET_MS,
    end: bar.end - IST_OFFSET_MS,
  }));
}

export function parseIntradayBars(raw: unknown): MinuteBar[] {
  const parsed = intradaySchema.safeParse(raw);
  if (!parsed.success) {
    throw new DhanApiError("Dhan's minute data came back in an unexpected shape.");
  }

  const stamps = parsed.data.timestamp ?? [];
  const highs = parsed.data.high ?? [];
  const lows = parsed.data.low ?? [];
  const bars: MinuteBar[] = [];

  for (let i = 0; i < stamps.length; i++) {
    const high = highs[i];
    const low = lows[i];
    if (typeof high !== "number" || typeof low !== "number") continue;
    if (!Number.isFinite(high) || !Number.isFinite(low)) continue;
    const start = stamps[i] * 1000;
    bars.push({ start, end: start + MINUTE_MS, high, low });
  }

  return bars;
}

/**
 * 1-minute bars for one cash-equity security across whole IST days
 * (YYYY-MM-DD, both inclusive), chunked to Dhan's per-request cap.
 */
export async function fetchMinuteBars(
  accessToken: string,
  scrip: { securityId: string; exchange: "NSE" | "BSE" },
  fromDate: string,
  toDate: string,
): Promise<MinuteBar[]> {
  const bars: MinuteBar[] = [];

  for (const window of chunkDateRange(fromDate, toDate, MAX_WINDOW_DAYS)) {
    const raw = await dhanPost(
      "/charts/intraday",
      {
        securityId: scrip.securityId,
        exchangeSegment: scrip.exchange === "BSE" ? "BSE_EQ" : "NSE_EQ",
        instrument: "EQUITY",
        interval: "1",
        oi: false,
        fromDate: `${window.from} 09:00:00`,
        toDate: `${window.to} 15:45:00`,
      },
      accessToken,
    );
    if (raw) bars.push(...parseIntradayBars(raw));
  }

  return normalizeSessionClock(bars).sort((a, b) => a.start - b.start);
}
