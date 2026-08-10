/**
 * Dhan security master → journal symbol.
 * ─────────────────────────────────────────────────────────────────────
 * The live order/trade APIs identify a stock by securityId and an exchange
 * ticker ("DECNGOLD"). The journal identifies it by company name
 * ("DECCAN GOLD MINES"), because that is what Dhan's *statement* API returns
 * and therefore what every existing row uses.
 *
 * Those two names only meet in Dhan's published scrip master:
 *
 *   SEM_SMST_SECURITY_ID  762638
 *   SEM_TRADING_SYMBOL    DECNGOLD                 ← live APIs, TradingView
 *   SEM_CUSTOM_SYMBOL     Deccan Gold Mines        ← journal, uppercased
 *   SM_SYMBOL_NAME        DECCAN GOLD MINES LTD.   ← display only
 *
 * Uppercased SEM_CUSTOM_SYMBOL matches the journal convention exactly - it was
 * verified against every Dhan-sourced symbol in the journal before this was
 * written. Getting this right is not cosmetic: the dedupe fingerprint shared
 * with the statement-based sync is built from the symbol, so a mismatch here
 * means tomorrow's EOD sync re-imports everything this one wrote.
 *
 * The file is ~26MB of every instrument Dhan lists. Only cash equity rows are
 * kept (a few thousand), and the parsed result is cached in the module for
 * CACHE_TTL_MS so one warm server downloads it at most once a day.
 * ─────────────────────────────────────────────────────────────────────
 */

/** Compact master. The detailed variant carries the same two names in 9MB more. */
const MASTER_URL = "https://images.dhan.co/api-data/api-scrip-master.csv";

const CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 60_000;

export type ScripRow = {
  /** Dhan's numeric security id, as a string - the join key with the live APIs. */
  securityId: string;
  exchange: "NSE" | "BSE";
  /** Exchange ticker: DECNGOLD. Same string TradingView charts. */
  ticker: string;
  /** Journal symbol: DECCAN GOLD MINES. */
  journalSymbol: string;
  /** Full registered name, kept for the symbol-map display column. */
  companyName: string;
  series: string;
};

export type ScripMaster = {
  fetchedAt: number;
  rows: ScripRow[];
  /** `${exchange}:${securityId}` → row. */
  bySecurityId: Map<string, ScripRow>;
  /** `${exchange}:${ticker}` → row. Fallback when a fill carries no securityId. */
  byTicker: Map<string, ScripRow>;
  /** Journal symbol → row, NSE preferred. Used for the TradingView backfill. */
  byJournalSymbol: Map<string, ScripRow>;
};

export class ScripMasterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScripMasterError";
  }
}

let cache: ScripMaster | null = null;
let inflight: Promise<ScripMaster> | null = null;

/**
 * Split one CSV line, honouring double-quoted fields.
 *
 * Company names in this file do contain commas ("BAJAJ HOLDINGS, INVEST"), so
 * a naive split drops every column after the name and silently mismaps the
 * symbol. Escaped quotes ("") inside a quoted field are unescaped.
 */
export function splitCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (inQuotes) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
      continue;
    }

    if (char === '"') inQuotes = true;
    else if (char === ",") {
      fields.push(current);
      current = "";
    } else current += char;
  }

  fields.push(current);
  return fields;
}

/** Journal symbols are stored uppercased with runs of whitespace collapsed. */
export function toJournalSymbol(customSymbol: string): string {
  return customSymbol.replace(/\s+/g, " ").trim().toUpperCase();
}

/**
 * Parse the master CSV into equity-only lookups.
 *
 * Columns are read by header name rather than position - Dhan has added
 * columns to this file before, and a fixed index would then map the ticker
 * onto whatever moved into slot 5.
 */
export function parseScripMaster(csv: string): ScripMaster {
  const lines = csv.split(/\r?\n/);
  const header = lines[0] ? splitCsvLine(lines[0]) : [];

  const index = (name: string) => header.findIndex((column) => column.trim() === name);
  const exchAt = index("SEM_EXM_EXCH_ID");
  const idAt = index("SEM_SMST_SECURITY_ID");
  const instrumentAt = index("SEM_INSTRUMENT_NAME");
  const tickerAt = index("SEM_TRADING_SYMBOL");
  const customAt = index("SEM_CUSTOM_SYMBOL");
  const seriesAt = index("SEM_SERIES");
  const nameAt = index("SM_SYMBOL_NAME");

  if ([exchAt, idAt, instrumentAt, tickerAt, customAt].some((at) => at < 0)) {
    throw new ScripMasterError(
      "Dhan's scrip master no longer has the columns this mapping depends on (SEM_SMST_SECURITY_ID / SEM_TRADING_SYMBOL / SEM_CUSTOM_SYMBOL).",
    );
  }

  const rows: ScripRow[] = [];
  const bySecurityId = new Map<string, ScripRow>();
  const byTicker = new Map<string, ScripRow>();
  const byJournalSymbol = new Map<string, ScripRow>();

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;

    // Cheap pre-filter: the vast majority of rows are F&O and never match.
    if (!line.includes("EQUITY")) continue;

    const fields = splitCsvLine(line);
    if ((fields[instrumentAt] ?? "").trim().toUpperCase() !== "EQUITY") continue;

    const exchange = (fields[exchAt] ?? "").trim().toUpperCase();
    if (exchange !== "NSE" && exchange !== "BSE") continue;

    const securityId = (fields[idAt] ?? "").trim();
    const ticker = (fields[tickerAt] ?? "").trim().toUpperCase();
    const journalSymbol = toJournalSymbol(fields[customAt] ?? "");
    if (!securityId || !ticker || !journalSymbol) continue;

    const row: ScripRow = {
      securityId,
      exchange,
      ticker,
      journalSymbol,
      companyName: (fields[nameAt] ?? "").replace(/\s+/g, " ").trim(),
      series: (fields[seriesAt] ?? "").trim().toUpperCase(),
    };

    rows.push(row);
    bySecurityId.set(`${exchange}:${securityId}`, row);

    // First writer wins per key, and NSE rows are preferred for the
    // name-based lookup because that is the primary venue for these journals.
    const tickerKey = `${exchange}:${ticker}`;
    if (!byTicker.has(tickerKey)) byTicker.set(tickerKey, row);

    const existing = byJournalSymbol.get(journalSymbol);
    if (!existing || (existing.exchange === "BSE" && exchange === "NSE")) {
      byJournalSymbol.set(journalSymbol, row);
    }
  }

  if (rows.length === 0) {
    throw new ScripMasterError("Dhan's scrip master came back with no equity rows.");
  }

  return { fetchedAt: Date.now(), rows, bySecurityId, byTicker, byJournalSymbol };
}

async function download(): Promise<ScripMaster> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(MASTER_URL, {
      cache: "no-store",
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new ScripMasterError(
        `Could not download Dhan's scrip master (HTTP ${response.status}).`,
      );
    }

    return parseScripMaster(await response.text());
  } catch (error) {
    if (error instanceof ScripMasterError) throw error;
    throw new ScripMasterError(
      `Could not download Dhan's scrip master (${(error as Error).message}).`,
    );
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The parsed master, cached per server instance.
 *
 * Concurrent callers share one download rather than each pulling 26MB. A failed
 * download clears the inflight promise so the next attempt retries instead of
 * inheriting the rejection.
 */
export async function getScripMaster(): Promise<ScripMaster> {
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) return cache;
  if (inflight) return inflight;

  inflight = download()
    .then((master) => {
      cache = master;
      return master;
    })
    .finally(() => {
      inflight = null;
    });

  return inflight;
}

/** Test seam - lets a caller install a fixture instead of hitting the network. */
export function __setScripMasterCache(master: ScripMaster | null) {
  cache = master;
}

/**
 * securityId first, ticker second.
 *
 * securityId is the identity the exchange and Dhan agree on; the ticker is a
 * label that gets reassigned when a company renames. The ticker path exists
 * only because the order book is documented as sometimes returning an empty
 * tradingSymbol, and one of the two is always present.
 */
export function resolveScrip(
  master: ScripMaster,
  exchangeSegment: string | null | undefined,
  securityId: string | null | undefined,
  tradingSymbol: string | null | undefined,
): ScripRow | null {
  const exchange = (exchangeSegment ?? "").toUpperCase().startsWith("BSE") ? "BSE" : "NSE";

  const id = (securityId ?? "").trim();
  if (id) {
    const hit = master.bySecurityId.get(`${exchange}:${id}`);
    if (hit) return hit;
  }

  const ticker = (tradingSymbol ?? "").trim().toUpperCase();
  if (ticker) {
    const hit = master.byTicker.get(`${exchange}:${ticker}`);
    if (hit) return hit;
    // A ticker listed on the other venue is still the same company.
    const other = master.byTicker.get(`${exchange === "NSE" ? "BSE" : "NSE"}:${ticker}`);
    if (other) return other;
  }

  return null;
}
