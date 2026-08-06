/**
 * Dhan broker integration - EQUITY ONLY (V1)
 * ─────────────────────────────────────────────────────────────────────
 * Pulls executed fills from DhanHQ v2 and converts them into the same
 * RawTransaction[] shape that lib/csv-parser.ts produces, so the existing
 * trade matcher and P&L logic are reused untouched.
 *
 * Docs: https://dhanhq.co/docs/v2/statements/  (Trade History)
 *       https://dhanhq.co/docs/v2/authentication/
 *
 * Notes:
 *  - No static IP whitelisting needed for reading trades (only for placing orders).
 *  - Statement APIs are free; only market-data APIs are charged.
 *  - Access token is a 24h JWT, passed in per request and never persisted.
 * ─────────────────────────────────────────────────────────────────────
 */

import { z } from "zod";
import type { RawTransaction } from "@/lib/trade-matcher";
import type { SegmentValue } from "@/lib/trade-utils";

const DHAN_API_BASE = "https://api.dhan.co/v2";

/** Hard stop so a malformed response can never spin forever. */
const MAX_PAGES = 50;
/** Dhan windows are chunked to keep individual requests small. */
const MAX_WINDOW_DAYS = 90;
/** Conservative self-throttle between requests. */
const THROTTLE_MS = 1100;
const MAX_RETRIES = 3;

// ─────────────────────────────────────────────────────────────────────
// Response shapes
// ─────────────────────────────────────────────────────────────────────

/**
 * Only the fields we actually consume are validated. Everything is kept
 * permissive (.nullish()) because Dhan returns "NA" and nulls in several
 * fields depending on segment, and we would rather skip one bad fill than
 * fail an entire sync.
 */
const dhanFillSchema = z.object({
  orderId: z.string().nullish(),
  exchangeTradeId: z.string().nullish(),
  transactionType: z.string().nullish(),
  exchangeSegment: z.string().nullish(),
  productType: z.string().nullish(),
  tradingSymbol: z.string().nullish(),
  customSymbol: z.string().nullish(),
  securityId: z.string().nullish(),
  isin: z.string().nullish(),
  instrument: z.string().nullish(),
  tradedQuantity: z.coerce.number().nullish(),
  tradedPrice: z.coerce.number().nullish(),
  exchangeTime: z.string().nullish(),
  createTime: z.string().nullish(),
  updateTime: z.string().nullish(),
  // Charges. Dhan documents these as string but returns numbers in practice.
  sebiTax: z.coerce.number().nullish(),
  stt: z.coerce.number().nullish(),
  brokerageCharges: z.coerce.number().nullish(),
  serviceTax: z.coerce.number().nullish(),
  exchangeTransactionCharges: z.coerce.number().nullish(),
  stampDuty: z.coerce.number().nullish(),
  drvOptionType: z.string().nullish(),
  drvExpiryDate: z.union([z.string(), z.number()]).nullish(),
  drvStrikePrice: z.coerce.number().nullish(),
});

export type DhanFill = z.infer<typeof dhanFillSchema>;

const dhanFillListSchema = z.array(dhanFillSchema);

const dhanProfileSchema = z.object({
  dhanClientId: z.string().nullish(),
  tokenValidity: z.string().nullish(),
  activeSegment: z.string().nullish(),
});

export type DhanProfile = z.infer<typeof dhanProfileSchema>;

// ─────────────────────────────────────────────────────────────────────
// Errors
// ─────────────────────────────────────────────────────────────────────

export class DhanApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly retryable = false,
  ) {
    super(message);
    this.name = "DhanApiError";
  }
}

/** Token problems get their own type so the UI can say "generate a new token". */
export class DhanAuthError extends DhanApiError {
  constructor(message = "Dhan access token is invalid or expired. Generate a fresh token on web.dhan.co and try again.") {
    super(message, 401, false);
    this.name = "DhanAuthError";
  }
}

// ─────────────────────────────────────────────────────────────────────
// Date helpers - everything Dhan sends is IST, with no offset attached
// ─────────────────────────────────────────────────────────────────────

const IST_OFFSET = "+05:30";

/**
 * Dhan returns timestamps like "2025-06-30 09:40:08" with no timezone.
 * These are IST. Parsing them naively resolves against the *server*
 * timezone, which is UTC on Vercel, shifting every fill 5h30m earlier.
 * We attach the offset explicitly.
 *
 * Returns null when the value is unusable ("NA", empty, malformed) so the
 * caller can skip the fill rather than storing an Invalid Date.
 */
export function parseIstTimestamp(value: string | null | undefined): Date | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.toUpperCase() === "NA") return null;

  // Already carries an explicit offset or Z - trust it as-is.
  if (/(?:Z|[+-]\d{2}:?\d{2})$/.test(trimmed)) {
    const asIs = new Date(trimmed);
    return Number.isNaN(asIs.getTime()) ? null : asIs;
  }

  const match = trimmed.match(
    /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/,
  );
  if (!match) return null;

  const [, yyyy, mm, dd, hh, mi, ss] = match;
  const parsed = new Date(`${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss ?? "00"}${IST_OFFSET}`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** Format a Date as YYYY-MM-DD in IST, which is what the Dhan API expects. */
export function toIstDateString(date: Date): string {
  // en-CA gives YYYY-MM-DD directly.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/** Today's date in IST as YYYY-MM-DD. */
export function istToday(): string {
  return toIstDateString(new Date());
}

/** Shift a YYYY-MM-DD string by a whole number of days. */
export function shiftDateString(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const base = new Date(Date.UTC(y, m - 1, d));
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

/**
 * Split a date range into windows of at most MAX_WINDOW_DAYS.
 * Both ends inclusive.
 */
export function chunkDateRange(
  fromDate: string,
  toDate: string,
  windowDays = MAX_WINDOW_DAYS,
): { from: string; to: string }[] {
  const windows: { from: string; to: string }[] = [];
  let cursor = fromDate;

  // Guard against an inverted range.
  if (cursor > toDate) return [{ from: toDate, to: toDate }];

  while (cursor <= toDate) {
    const candidateEnd = shiftDateString(cursor, windowDays - 1);
    const end = candidateEnd > toDate ? toDate : candidateEnd;
    windows.push({ from: cursor, to: end });
    if (end === toDate) break;
    cursor = shiftDateString(end, 1);
  }

  return windows;
}

// ─────────────────────────────────────────────────────────────────────
// HTTP
// ─────────────────────────────────────────────────────────────────────

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function dhanGet(path: string, accessToken: string): Promise<unknown> {
  let lastError: DhanApiError | null = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    let response: Response;
    try {
      response = await fetch(`${DHAN_API_BASE}${path}`, {
        method: "GET",
        headers: {
          Accept: "application/json",
          "access-token": accessToken,
        },
        cache: "no-store",
      });
    } catch (error) {
      lastError = new DhanApiError(
        `Could not reach Dhan (${(error as Error).message}).`,
        undefined,
        true,
      );
      if (attempt < MAX_RETRIES) {
        await sleep(THROTTLE_MS * attempt);
        continue;
      }
      throw lastError;
    }

    // Never retry an auth failure - the token will not fix itself.
    if (response.status === 401 || response.status === 403) {
      throw new DhanAuthError();
    }

    if (response.status === 429 || response.status >= 500) {
      lastError = new DhanApiError(
        response.status === 429
          ? "Dhan rate limit hit."
          : `Dhan returned ${response.status}.`,
        response.status,
        true,
      );
      if (attempt < MAX_RETRIES) {
        await sleep(THROTTLE_MS * attempt * 2);
        continue;
      }
      throw lastError;
    }

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new DhanApiError(
        `Dhan returned ${response.status}. ${body.slice(0, 300)}`.trim(),
        response.status,
        false,
      );
    }

    const text = await response.text();
    if (!text.trim()) return [];

    try {
      return JSON.parse(text);
    } catch {
      throw new DhanApiError("Dhan returned a response that was not valid JSON.");
    }
  }

  throw lastError ?? new DhanApiError("Dhan request failed.");
}

/**
 * Verify the token before doing anything else, so a dead token produces a
 * clear message instead of a 401 halfway through pagination.
 */
export async function fetchDhanProfile(accessToken: string): Promise<DhanProfile> {
  const raw = await dhanGet("/profile", accessToken);
  const parsed = dhanProfileSchema.safeParse(raw);
  if (!parsed.success) {
    throw new DhanApiError("Could not read the Dhan profile response.");
  }
  return parsed.data;
}

/**
 * Fetch every fill between two dates (inclusive), following pagination and
 * chunking long ranges. Returns fills in whatever order Dhan gave them -
 * callers must sort.
 */
export async function fetchDhanFills(
  accessToken: string,
  fromDate: string,
  toDate: string,
): Promise<{ fills: DhanFill[]; warnings: string[] }> {
  const warnings: string[] = [];
  const fills: DhanFill[] = [];

  for (const window of chunkDateRange(fromDate, toDate)) {
    let page = 0;

    while (page < MAX_PAGES) {
      const raw = await dhanGet(
        `/trades/${window.from}/${window.to}/${page}`,
        accessToken,
      );

      // Dhan returns [] when a page is empty; some error shapes come back as
      // an object instead of an array.
      if (!Array.isArray(raw)) {
        const asObject = raw as Record<string, unknown> | null;
        const message =
          asObject && typeof asObject === "object"
            ? String(asObject.errorMessage ?? asObject.message ?? "unexpected response shape")
            : "unexpected response shape";
        warnings.push(
          `Dhan ${window.from}..${window.to} page ${page}: ${message}. Stopped paging this window.`,
        );
        break;
      }

      if (raw.length === 0) break;

      const parsed = dhanFillListSchema.safeParse(raw);
      if (!parsed.success) {
        warnings.push(
          `Dhan ${window.from}..${window.to} page ${page}: ${raw.length} fill(s) failed validation and were skipped.`,
        );
        break;
      }

      fills.push(...parsed.data);
      page++;

      if (page >= MAX_PAGES) {
        warnings.push(
          `Dhan ${window.from}..${window.to}: hit the ${MAX_PAGES}-page cap. Narrow the date range to pull the rest.`,
        );
        break;
      }

      await sleep(THROTTLE_MS);
    }

    await sleep(THROTTLE_MS);
  }

  return { fills, warnings };
}

// ─────────────────────────────────────────────────────────────────────
// Mapping
// ─────────────────────────────────────────────────────────────────────

const INTRADAY_PRODUCT_TYPES = new Set(["INTRADAY", "CO", "BO"]);

/**
 * V1 is equity only. A fill is treated as equity when Dhan says the
 * instrument is EQUITY and it carries no derivatives metadata.
 */
export function isEquityFill(fill: DhanFill): boolean {
  const instrument = (fill.instrument ?? "").toUpperCase();
  const optionType = (fill.drvOptionType ?? "").toUpperCase();

  if (instrument && instrument !== "EQUITY") return false;
  if (optionType === "CALL" || optionType === "PUT") return false;
  if ((fill.drvStrikePrice ?? 0) > 0) return false;

  const segment = (fill.exchangeSegment ?? "").toUpperCase();
  // NSE_EQ / BSE_EQ are equity; NSE_FNO, MCX_COMM etc. are not.
  if (segment && !segment.endsWith("_EQ")) return false;

  return true;
}

/** Sum of all charge components Dhan reports on a single fill. */
export function fillCharges(fill: DhanFill): number {
  const parts = [
    fill.sebiTax,
    fill.stt,
    fill.brokerageCharges,
    fill.serviceTax,
    fill.exchangeTransactionCharges,
    fill.stampDuty,
  ];
  return parts.reduce<number>((sum, part) => {
    const value = typeof part === "number" && Number.isFinite(part) ? part : 0;
    return sum + value;
  }, 0);
}

/**
 * Symbol for the journal. Matches what the CSV path does to its Name column
 * (trim + uppercase) so API-synced trades line up with CSV-imported history.
 */
export function fillSymbol(fill: DhanFill): string | null {
  const raw = fill.tradingSymbol?.trim() || fill.customSymbol?.trim() || "";
  if (!raw || raw.toUpperCase() === "NA") return null;
  return raw.replace(/\s+/g, " ").trim().toUpperCase();
}

/** Delivery vs intraday, derived per fill rather than from a UI dropdown. */
export function fillSegment(fill: DhanFill): SegmentValue {
  const productType = (fill.productType ?? "").toUpperCase();
  return INTRADAY_PRODUCT_TYPES.has(productType) ? "INTRADAY" : "EQUITY";
}

export type MappedFill = {
  transaction: RawTransaction;
  externalTradeId: string | null;
  externalOrderId: string | null;
  segment: SegmentValue;
};

export type MapResult = {
  mapped: MappedFill[];
  skippedNonEquity: number;
  errors: string[];
};

/**
 * Convert raw Dhan fills into RawTransaction objects for the existing
 * trade matcher. Non-equity fills are counted and skipped. Individual bad
 * fills are reported and skipped rather than failing the whole sync.
 */
export function mapDhanFills(fills: DhanFill[]): MapResult {
  const mapped: MappedFill[] = [];
  const errors: string[] = [];
  let skippedNonEquity = 0;

  fills.forEach((fill, index) => {
    const label = fill.exchangeTradeId ?? fill.orderId ?? `#${index + 1}`;

    if (!isEquityFill(fill)) {
      skippedNonEquity++;
      return;
    }

    const symbol = fillSymbol(fill);
    if (!symbol) {
      errors.push(`Fill ${label}: no usable symbol, skipped.`);
      return;
    }

    const rawType = (fill.transactionType ?? "").toUpperCase();
    if (rawType !== "BUY" && rawType !== "SELL") {
      errors.push(`Fill ${label}: unknown transaction type "${fill.transactionType}", skipped.`);
      return;
    }

    const price = fill.tradedPrice;
    if (typeof price !== "number" || !Number.isFinite(price) || price <= 0) {
      errors.push(`Fill ${label}: invalid price "${fill.tradedPrice}", skipped.`);
      return;
    }

    const quantity = fill.tradedQuantity;
    if (typeof quantity !== "number" || !Number.isFinite(quantity) || quantity <= 0) {
      errors.push(`Fill ${label}: invalid quantity "${fill.tradedQuantity}", skipped.`);
      return;
    }

    // exchangeTime is authoritative; fall back to updateTime/createTime.
    const date =
      parseIstTimestamp(fill.exchangeTime) ??
      parseIstTimestamp(fill.updateTime) ??
      parseIstTimestamp(fill.createTime);

    if (!date) {
      errors.push(`Fill ${label}: no usable timestamp, skipped.`);
      return;
    }

    const externalTradeId = fill.exchangeTradeId?.trim() || null;

    mapped.push({
      transaction: {
        ticker: symbol,
        date,
        type: rawType,
        price,
        quantity,
        charges: fillCharges(fill),
        // Travels through the matcher so the leg keeps its own id. Two fills of
        // one order can be identical on symbol/time/price/qty, so this must not
        // be recovered by content matching later.
        ref: externalTradeId ?? undefined,
      },
      externalTradeId,
      externalOrderId: fill.orderId?.trim() || null,
      segment: fillSegment(fill),
    });
  });

  // The matcher's correctness depends entirely on chronology. Never trust
  // the order Dhan returned.
  mapped.sort((a, b) => a.transaction.date.getTime() - b.transaction.date.getTime());

  return { mapped, skippedNonEquity, errors };
}
