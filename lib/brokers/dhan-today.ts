/**
 * Dhan intraday sync - today's executed orders, live.
 * ─────────────────────────────────────────────────────────────────────
 * Separate from lib/brokers/dhan.ts by design. That module reads the
 * *statement* API (`/trades/{from}/{to}/{page}`), which is the system of record
 * but only lands end of day. This one reads the *day trade book*
 * (`GET /v2/trades`), which is live from the moment an order fills - the same
 * fills the Orders → Today screen shows as Success.
 *
 * Two APIs, two shapes, two failure modes, so two modules. Nothing here is
 * imported by the EOD sync, and the only thing imported *from* it is
 * contentFingerprint - deliberately, because both paths must derive byte
 * identical ids for the same fill or tomorrow's EOD sync re-imports today's
 * work as duplicates. That shared function is the contract between them.
 *
 * What the day trade book does not carry is charges. Rows written from here
 * therefore land with charges 0 and source DHAN_TODAY, and are reconciled to
 * statement-grade by the charges backfill once Dhan publishes the day.
 * ─────────────────────────────────────────────────────────────────────
 */

import { z } from "zod";
import type { RawTransaction } from "@/lib/trade-matcher";
import type { SegmentValue } from "@/lib/trade-utils";
import { contentFingerprint, parseIstTimestamp } from "@/lib/brokers/dhan";
import {
  getScripMaster,
  resolveScrip,
  toJournalSymbol,
  type ScripMaster,
} from "@/lib/brokers/dhan-scrip-master";

const DHAN_API_BASE = "https://api.dhan.co/v2";
const THROTTLE_MS = 1100;
const MAX_RETRIES = 3;

/** Marks rows written from the live trade book, before charges are known. */
export const TODAY_SOURCE = "DHAN_TODAY";

// ─────────────────────────────────────────────────────────────────────
// Response shapes
// ─────────────────────────────────────────────────────────────────────

/** GET /v2/trades - one row per fill, today only. */
const tradeBookRowSchema = z.object({
  orderId: z.string().nullish(),
  exchangeOrderId: z.string().nullish(),
  exchangeTradeId: z.string().nullish(),
  transactionType: z.string().nullish(),
  exchangeSegment: z.string().nullish(),
  productType: z.string().nullish(),
  orderType: z.string().nullish(),
  tradingSymbol: z.string().nullish(),
  securityId: z.string().nullish(),
  tradedQuantity: z.coerce.number().nullish(),
  tradedPrice: z.coerce.number().nullish(),
  createTime: z.string().nullish(),
  updateTime: z.string().nullish(),
  exchangeTime: z.string().nullish(),
  drvOptionType: z.string().nullish(),
  drvStrikePrice: z.coerce.number().nullish(),
});

export type DhanTodayFill = z.infer<typeof tradeBookRowSchema>;

/** GET /v2/orders - used only to report what happened, never to build trades. */
const orderBookRowSchema = z.object({
  orderId: z.string().nullish(),
  orderStatus: z.string().nullish(),
  transactionType: z.string().nullish(),
  exchangeSegment: z.string().nullish(),
  tradingSymbol: z.string().nullish(),
  securityId: z.string().nullish(),
  quantity: z.coerce.number().nullish(),
  filledQty: z.coerce.number().nullish(),
  averageTradedPrice: z.coerce.number().nullish(),
});

export type DhanTodayOrder = z.infer<typeof orderBookRowSchema>;

const profileSchema = z.object({
  dhanClientId: z.string().nullish(),
  tokenValidity: z.string().nullish(),
});

export class DhanTodayError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "DhanTodayError";
  }
}

export class DhanTodayAuthError extends DhanTodayError {
  constructor(
    message = "Dhan access token is invalid or expired. Generate a fresh token on web.dhan.co and try again.",
  ) {
    super(message, 401);
    this.name = "DhanTodayAuthError";
  }
}

// ─────────────────────────────────────────────────────────────────────
// HTTP
// ─────────────────────────────────────────────────────────────────────

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function dhanGet(path: string, accessToken: string): Promise<unknown> {
  let lastError: DhanTodayError | null = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    let response: Response;
    try {
      response = await fetch(`${DHAN_API_BASE}${path}`, {
        method: "GET",
        headers: { Accept: "application/json", "access-token": accessToken },
        cache: "no-store",
      });
    } catch (error) {
      lastError = new DhanTodayError(`Could not reach Dhan (${(error as Error).message}).`);
      if (attempt < MAX_RETRIES) {
        await sleep(THROTTLE_MS * attempt);
        continue;
      }
      throw lastError;
    }

    if (response.status === 401 || response.status === 403) throw new DhanTodayAuthError();

    if (response.status === 429 || response.status >= 500) {
      lastError = new DhanTodayError(
        response.status === 429 ? "Dhan rate limit hit." : `Dhan returned ${response.status}.`,
        response.status,
      );
      if (attempt < MAX_RETRIES) {
        await sleep(THROTTLE_MS * attempt * 2);
        continue;
      }
      throw lastError;
    }

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new DhanTodayError(
        `Dhan returned ${response.status}. ${body.slice(0, 300)}`.trim(),
        response.status,
      );
    }

    const text = await response.text();
    if (!text.trim()) return [];

    try {
      return JSON.parse(text);
    } catch {
      throw new DhanTodayError("Dhan returned a response that was not valid JSON.");
    }
  }

  throw lastError ?? new DhanTodayError("Dhan request failed.");
}

/** Checked first so a dead token fails in one line instead of two endpoints in. */
export async function fetchTodayProfile(accessToken: string) {
  const parsed = profileSchema.safeParse(await dhanGet("/profile", accessToken));
  if (!parsed.success) throw new DhanTodayError("Could not read the Dhan profile response.");
  return parsed.data;
}

/** Every fill executed today. Empty array on a day with no trades. */
export async function fetchTodayFills(
  accessToken: string,
): Promise<{ fills: DhanTodayFill[]; warnings: string[] }> {
  const raw = await dhanGet("/trades", accessToken);
  const warnings: string[] = [];

  if (!Array.isArray(raw)) {
    const asObject = raw as Record<string, unknown> | null;
    const message =
      asObject && typeof asObject === "object"
        ? String(asObject.errorMessage ?? asObject.message ?? "unexpected response shape")
        : "unexpected response shape";
    throw new DhanTodayError(`Dhan's trade book came back wrong: ${message}`);
  }

  const fills: DhanTodayFill[] = [];
  raw.forEach((row, position) => {
    const parsed = tradeBookRowSchema.safeParse(row);
    if (parsed.success) fills.push(parsed.data);
    else warnings.push(`Trade book row ${position + 1} did not match the expected shape and was skipped.`);
  });

  return { fills, warnings };
}

/**
 * Today's order book. Reporting only - it carries an order's average price
 * rather than its individual fills, so building trades from it would round a
 * multi-fill order into one synthetic price that the statement API will later
 * disagree with.
 */
export async function fetchTodayOrders(accessToken: string): Promise<DhanTodayOrder[]> {
  const raw = await dhanGet("/orders", accessToken);
  if (!Array.isArray(raw)) return [];

  const orders: DhanTodayOrder[] = [];
  for (const row of raw) {
    const parsed = orderBookRowSchema.safeParse(row);
    if (parsed.success) orders.push(parsed.data);
  }
  return orders;
}

// ─────────────────────────────────────────────────────────────────────
// Mapping
// ─────────────────────────────────────────────────────────────────────

const INTRADAY_PRODUCT_TYPES = new Set(["INTRADAY", "CO", "BO"]);

/** Cash equity only, matching what the EOD sync will accept for the same fill. */
export function isEquityTodayFill(fill: DhanTodayFill): boolean {
  const optionType = (fill.drvOptionType ?? "").toUpperCase();
  if (optionType === "CALL" || optionType === "PUT") return false;
  if ((fill.drvStrikePrice ?? 0) > 0) return false;

  const segment = (fill.exchangeSegment ?? "").toUpperCase();
  if (segment && !segment.endsWith("_EQ")) return false;

  return true;
}

export function todaySegment(fill: DhanTodayFill): SegmentValue {
  const productType = (fill.productType ?? "").toUpperCase();
  return INTRADAY_PRODUCT_TYPES.has(productType) ? "INTRADAY" : "EQUITY";
}

export type MappedTodayFill = {
  transaction: RawTransaction;
  /** Content fingerprint, shared scheme with the EOD sync. */
  dedupeKey: string;
  externalOrderId: string | null;
  /** Dhan's real trade id. Stored for audit; never used for dedupe (see below). */
  brokerTradeId: string | null;
  segment: SegmentValue;
  ticker: string;
  securityId: string | null;
  exchange: "NSE" | "BSE";
};

export type MapTodayResult = {
  mapped: MappedTodayFill[];
  skippedNonEquity: number;
  /** Fills whose security is not in the scrip master - reported, not guessed at. */
  unmappedSymbols: string[];
  errors: string[];
};

/**
 * Live fills → journal transactions.
 *
 * The identity written here is the *content* fingerprint, not Dhan's
 * exchangeTradeId, even though the trade book supplies a real one. The
 * statement API returns "0" in that field, so the EOD sync always falls back to
 * the fingerprint. Storing the real id here would leave tomorrow's EOD sync
 * computing a fingerprint that matches nothing, and it would import every fill
 * a second time. Same fill, same key, from either direction.
 */
export function mapTodayFills(
  fills: DhanTodayFill[],
  master: ScripMaster,
): MapTodayResult {
  const mapped: MappedTodayFill[] = [];
  const errors: string[] = [];
  const unmapped = new Set<string>();
  let skippedNonEquity = 0;

  fills.forEach((fill, index) => {
    const label = fill.tradingSymbol?.trim() || fill.orderId?.trim() || `#${index + 1}`;

    if (!isEquityTodayFill(fill)) {
      skippedNonEquity++;
      return;
    }

    const scrip = resolveScrip(master, fill.exchangeSegment, fill.securityId, fill.tradingSymbol);
    const rawTicker = (fill.tradingSymbol ?? "").trim().toUpperCase();

    if (!scrip && !rawTicker) {
      errors.push(`Fill ${label}: no security id or symbol, skipped.`);
      return;
    }

    // Without a master row there is no company-name form, and inventing one
    // would create a second journal symbol for a stock already in the journal.
    // The raw ticker is used so the fill is not lost, and it is reported.
    if (!scrip) {
      unmapped.add(rawTicker);
    }

    const symbol = scrip ? scrip.journalSymbol : toJournalSymbol(rawTicker);

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

    const date =
      parseIstTimestamp(fill.exchangeTime) ??
      parseIstTimestamp(fill.updateTime) ??
      parseIstTimestamp(fill.createTime);

    if (!date) {
      errors.push(`Fill ${label}: no usable timestamp, skipped.`);
      return;
    }

    mapped.push({
      transaction: { ticker: symbol, date, type: rawType, price, quantity, charges: 0 },
      dedupeKey: "",
      externalOrderId: fill.orderId?.trim() || null,
      brokerTradeId: fill.exchangeTradeId?.trim() || null,
      segment: todaySegment(fill),
      ticker: scrip?.ticker ?? rawTicker,
      securityId: scrip?.securityId ?? fill.securityId?.trim() ?? null,
      exchange: scrip?.exchange ?? ((fill.exchangeSegment ?? "").toUpperCase().startsWith("BSE") ? "BSE" : "NSE"),
    });
  });

  // Chronology decides how the matcher pairs entries with exits.
  mapped.sort((a, b) => a.transaction.date.getTime() - b.transaction.date.getTime());

  // Two fills of one order can share symbol, second, side, price and quantity.
  // Numbering them by occurrence keeps both, and keeps the numbering stable
  // across re-runs so a second sync recognises both as already stored - the
  // same rule the EOD sync applies.
  const seen = new Map<string, number>();
  for (const item of mapped) {
    const fingerprint = contentFingerprint(
      item.transaction.ticker,
      item.transaction.date,
      item.transaction.type,
      item.transaction.price,
      item.transaction.quantity,
    );
    const occurrence = (seen.get(fingerprint) ?? 0) + 1;
    seen.set(fingerprint, occurrence);
    item.dedupeKey = `${fingerprint}:${occurrence}`;
    item.transaction.ref = item.dedupeKey;
  }

  return { mapped, skippedNonEquity, unmappedSymbols: [...unmapped], errors };
}

/** Convenience wrapper so a route does not have to wire the master itself. */
export async function fetchAndMapToday(accessToken: string) {
  const [{ fills, warnings }, master] = await Promise.all([
    fetchTodayFills(accessToken),
    getScripMaster(),
  ]);
  return { ...mapTodayFills(fills, master), fills, warnings, master };
}
