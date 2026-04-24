import { RawTransaction } from "./trade-matcher";

/**
 * Column mapping profiles for common Indian brokers.
 * Each profile defines the column header names used in that broker's CSV export.
 */
export type BrokerProfile = {
  name: string;
  columns: {
    ticker: string;
    date: string;
    time?: string; // Optional separate time column (e.g. Dhan)
    type: string;
    price: string;
    quantity: string;
  };
  dateFormat: "ISO" | "DD-MM-YYYY" | "DD/MM/YYYY" | "MM/DD/YYYY";
  buyIdentifier: string;
  sellIdentifier: string;
};

export const BROKER_PROFILES: Record<string, BrokerProfile> = {
  generic: {
    name: "Generic CSV",
    columns: {
      ticker: "symbol",
      date: "date",
      type: "type",
      price: "price",
      quantity: "quantity",
    },
    dateFormat: "ISO",
    buyIdentifier: "BUY",
    sellIdentifier: "SELL",
  },
  zerodha: {
    name: "Zerodha (Trade Book)",
    columns: {
      ticker: "symbol",
      date: "order_execution_time",
      type: "trade_type",
      price: "price",
      quantity: "quantity",
    },
    dateFormat: "DD-MM-YYYY",
    buyIdentifier: "buy",
    sellIdentifier: "sell",
  },
  groww: {
    name: "Groww",
    columns: {
      ticker: "symbol",
      date: "date",
      type: "action",
      price: "price",
      quantity: "quantity",
    },
    dateFormat: "DD/MM/YYYY",
    buyIdentifier: "BUY",
    sellIdentifier: "SELL",
  },
  angel: {
    name: "Angel One",
    columns: {
      ticker: "scrip_name",
      date: "trade_date",
      type: "buy_sell",
      price: "trade_price",
      quantity: "quantity",
    },
    dateFormat: "DD-MM-YYYY",
    buyIdentifier: "B",
    sellIdentifier: "S",
  },
  dhan: {
    name: "Dhan",
    columns: {
      ticker: "name",
      date: "date",
      time: "time",
      type: "buy/sell",
      price: "trade price",
      quantity: "quantity/lot",
    },
    dateFormat: "DD/MM/YYYY",
    buyIdentifier: "BUY",
    sellIdentifier: "SELL",
  },
  custom: {
    name: "Custom Mapping",
    columns: {
      ticker: "",
      date: "",
      type: "",
      price: "",
      quantity: "",
    },
    dateFormat: "ISO",
    buyIdentifier: "BUY",
    sellIdentifier: "SELL",
  },
};

/**
 * Parse a date string according to the specified format.
 * Auto-detects ISO (YYYY-MM-DD) regardless of profile format setting.
 * Optionally combines with a separate time string.
 */
function parseDate(dateStr: string, format: BrokerProfile["dateFormat"], timeStr?: string): Date {
  const trimmed = dateStr.trim();

  // Auto-detect ISO format: starts with 4-digit year
  const isISO = /^\d{4}-\d{2}-\d{2}/.test(trimmed);
  if (isISO) {
    const timePart = timeStr ? `T${timeStr.trim()}` : "";
    return new Date(`${trimmed}${timePart}`);
  }

  if (format === "ISO") {
    return new Date(trimmed);
  }

  if (format === "DD-MM-YYYY" || format === "DD/MM/YYYY") {
    const parts = trimmed.split(/[\s\-\/T]/);
    let [dd, mm, yyyy] = parts;

    // Auto-detect if mm > 12, swap them (handles Excel locale mangling)
    if (parseInt(mm, 10) > 12 && parseInt(dd, 10) <= 12) {
      const temp = dd;
      dd = mm;
      mm = temp;
    }

    let timePart = "";
    if (parts.length > 3) {
      timePart = ` ${parts.slice(3).join(":")}`;
    } else if (timeStr) {
      timePart = ` ${timeStr.trim()}`;
    }
    return new Date(`${yyyy}-${mm}-${dd}${timePart}`);
  }

  if (format === "MM/DD/YYYY") {
    const parts = trimmed.split(/[\s\/T]/);
    let [mm, dd, yyyy] = parts;

    if (parseInt(mm, 10) > 12 && parseInt(dd, 10) <= 12) {
      const temp = dd;
      dd = mm;
      mm = temp;
    }

    let timePart = "";
    if (parts.length > 3) {
      timePart = ` ${parts.slice(3).join(":")}`;
    } else if (timeStr) {
      timePart = ` ${timeStr.trim()}`;
    }
    return new Date(`${yyyy}-${mm}-${dd}${timePart}`);
  }

  return new Date(trimmed);
}

/**
 * Detect delimiter: tab or comma.
 */
function detectDelimiter(firstLine: string): string {
  // If the line has tabs, it's tab-separated
  if (firstLine.includes("\t")) return "\t";
  return ",";
}

/**
 * Parse raw CSV/TSV text into an array of string arrays.
 * Auto-detects tab vs comma delimiter.
 * Handles quoted fields correctly for CSV.
 */
export function parseCSVText(text: string): string[][] {
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length === 0) return [];

  const delimiter = detectDelimiter(lines[0]);

  // Tab-separated: simple split (Dhan format doesn't use quoting)
  if (delimiter === "\t") {
    return lines.map((line) => line.split("\t").map((cell) => cell.trim()));
  }

  // Comma-separated: handle quoted fields
  return lines.map((line) => {
    const fields: string[] = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === "," && !inQuotes) {
        fields.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }
    fields.push(current.trim());
    return fields;
  });
}

/**
 * Try to auto-detect the broker profile from the CSV headers.
 */
export function detectBrokerProfile(headers: string[]): string {
  const normalized = headers.map((h) => h.toLowerCase().trim());

  if (normalized.includes("order_execution_time") && normalized.includes("trade_type")) {
    return "zerodha";
  }
  if (normalized.includes("action") && normalized.includes("symbol")) {
    return "groww";
  }
  if (normalized.includes("scrip_name") && normalized.includes("buy_sell")) {
    return "angel";
  }
  // Dhan: has "buy/sell", "trade price", "name"
  if (normalized.includes("buy/sell") && normalized.includes("trade price") && normalized.includes("name")) {
    return "dhan";
  }
  // Fall back to generic if standard columns present
  if (normalized.includes("symbol") && normalized.includes("price") && normalized.includes("quantity")) {
    return "generic";
  }

  return "custom";
}

/**
 * Convert parsed CSV rows + a broker profile into RawTransaction objects
 * ready for the trade matching engine.
 */
export function csvToTransactions(
  rows: string[][],
  profile: BrokerProfile
): { transactions: RawTransaction[]; errors: string[] } {
  if (rows.length < 2) {
    return { transactions: [], errors: ["CSV must have a header row and at least one data row."] };
  }

  const headers = rows[0].map((h) => h.toLowerCase().trim());
  const dataRows = rows.slice(1);

  // Find column indices
  const tickerIdx = headers.indexOf(profile.columns.ticker.toLowerCase());
  const dateIdx = headers.indexOf(profile.columns.date.toLowerCase());
  const timeIdx = profile.columns.time ? headers.indexOf(profile.columns.time.toLowerCase()) : -1;
  const typeIdx = headers.indexOf(profile.columns.type.toLowerCase());
  const priceIdx = headers.indexOf(profile.columns.price.toLowerCase());
  const qtyIdx = headers.indexOf(profile.columns.quantity.toLowerCase());

  const errors: string[] = [];

  if (tickerIdx === -1) errors.push(`Column "${profile.columns.ticker}" not found in CSV headers.`);
  if (dateIdx === -1) errors.push(`Column "${profile.columns.date}" not found in CSV headers.`);
  if (typeIdx === -1) errors.push(`Column "${profile.columns.type}" not found in CSV headers.`);
  if (priceIdx === -1) errors.push(`Column "${profile.columns.price}" not found in CSV headers.`);
  if (qtyIdx === -1) errors.push(`Column "${profile.columns.quantity}" not found in CSV headers.`);

  if (errors.length > 0) {
    return { transactions: [], errors: [...errors, `Available headers: ${headers.join(", ")}`] };
  }

  const transactions: RawTransaction[] = [];

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i];
    if (row.length < Math.max(tickerIdx, dateIdx, typeIdx, priceIdx, qtyIdx) + 1) {
      errors.push(`Row ${i + 2}: insufficient columns.`);
      continue;
    }

    const ticker = row[tickerIdx].trim().toUpperCase();
    const rawDate = row[dateIdx];
    const rawTime = timeIdx >= 0 && row[timeIdx] ? row[timeIdx] : undefined;
    const rawType = row[typeIdx].trim().toLowerCase();
    const price = parseFloat(row[priceIdx].replace(/,/g, ""));
    const quantity = parseFloat(row[qtyIdx].replace(/,/g, ""));

    if (!ticker) {
      errors.push(`Row ${i + 2}: empty ticker.`);
      continue;
    }

    const date = parseDate(rawDate, profile.dateFormat, rawTime);
    if (isNaN(date.getTime())) {
      errors.push(`Row ${i + 2}: invalid date "${rawDate}".`);
      continue;
    }

    if (isNaN(price) || price <= 0) {
      errors.push(`Row ${i + 2}: invalid price "${row[priceIdx]}".`);
      continue;
    }

    if (isNaN(quantity) || quantity <= 0) {
      errors.push(`Row ${i + 2}: invalid quantity "${row[qtyIdx]}".`);
      continue;
    }

    const isBuy = rawType === profile.buyIdentifier.toLowerCase();
    const isSell = rawType === profile.sellIdentifier.toLowerCase();

    if (!isBuy && !isSell) {
      errors.push(`Row ${i + 2}: unknown trade type "${row[typeIdx]}" (expected "${profile.buyIdentifier}" or "${profile.sellIdentifier}").`);
      continue;
    }

    transactions.push({
      ticker,
      date,
      type: isBuy ? "BUY" : "SELL",
      price,
      quantity,
    });
  }

  return { transactions, errors };
}
