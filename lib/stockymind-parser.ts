import * as XLSX from "xlsx";
import type { TradeSegment } from "@prisma/client";
import {
  exitTriggerValues,
  growthAreaValues,
  proficiencyValues,
  setupValues,
} from "@/lib/constants";

type StockyMindRow = Record<string, unknown>;

export type StockyMindParsedTrade = {
  symbol: string;
  segment: TradeSegment;
  tradeType: "LONG" | "SHORT";
  status: "OPEN" | "CLOSED";
  transactions: {
    type: "BUY" | "SELL";
    price: number;
    quantity: number;
    dateTime: Date;
    order: number;
  }[];
  stopLoss: number | null;
  closingPrice: number | null;
  charges: number;
  notes: string;
  setup: string | null;
  planFollowed: boolean | null;
  exitTrigger: string | null;
  proficiency: string | null;
  growthAreas: string | null;
};

export type StockyMindParseResult = {
  trades: StockyMindParsedTrade[];
  errors: string[];
};

function stringValue(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function numberValue(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const parsed = Number(String(value).replace(/,/g, "").trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function dateValue(value: unknown) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (!parsed) return null;
    return new Date(parsed.y, parsed.m - 1, parsed.d, parsed.H, parsed.M, parsed.S);
  }
  const raw = stringValue(value);
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parsePlanFollowed(value: unknown) {
  const raw = stringValue(value).toLowerCase();
  if (!raw) return { value: null, valid: true };
  if (["yes", "y", "true", "1"].includes(raw)) return { value: true, valid: true };
  if (["no", "n", "false", "0"].includes(raw)) return { value: false, valid: true };
  return { value: null, valid: false };
}

function normalizeAllowedValue(value: unknown, allowedValues: readonly string[]) {
  const raw = stringValue(value);
  if (!raw) return { value: null, valid: true };
  const values = raw
    .split(/[,;\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
  const matches = values.map((item) =>
    allowedValues.find((allowed) => allowed.toLowerCase() === item.toLowerCase()),
  );
  if (matches.some((match) => !match)) return { value: null, valid: false };
  return { value: matches.filter(Boolean).join(", "), valid: true };
}

function rowHasAnyData(row: StockyMindRow) {
  return Object.values(row).some((value) => stringValue(value).length > 0);
}

function get(row: StockyMindRow, header: string) {
  return row[header];
}

export function parseStockyMindWorkbook(
  workbookBuffer: ArrayBuffer,
  segment: TradeSegment = "EQUITY",
): StockyMindParseResult {
  const workbook = XLSX.read(Buffer.from(workbookBuffer), {
    type: "buffer",
    cellDates: true,
  });

  const sheet = workbook.Sheets.Trades ?? workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) {
    return { trades: [], errors: ["Workbook does not contain a Trades sheet."] };
  }

  const rows = XLSX.utils.sheet_to_json<StockyMindRow>(sheet, {
    defval: null,
    raw: true,
  });
  const trades: StockyMindParsedTrade[] = [];
  const errors: string[] = [];

  rows.forEach((row, index) => {
    const rowNumber = index + 2;
    if (!rowHasAnyData(row)) return;

    const symbol = stringValue(get(row, "Stock Symbol")).toUpperCase();
    const entryDate = dateValue(get(row, "Entry Date"));
    const entryPrice = numberValue(get(row, "Avg Entry"));
    const entryQty = numberValue(get(row, "Initial QTY"));
    const side = stringValue(get(row, "Buy/ Sell")).toUpperCase();
    const rowErrors: string[] = [];

    if (!symbol) rowErrors.push("missing Stock Symbol");
    if (!entryDate) rowErrors.push("invalid Entry Date");
    if (!entryPrice || entryPrice <= 0) rowErrors.push("invalid Avg Entry");
    if (!entryQty || entryQty <= 0) rowErrors.push("invalid Initial QTY");

    const isLong = side === "B" || side === "BUY";
    const isShort = side === "S" || side === "SELL";
    if (!isLong && !isShort) rowErrors.push('invalid Buy/ Sell value, expected "B" or "S"');

    const setup = normalizeAllowedValue(get(row, "Setup"), setupValues);
    const exitTrigger = normalizeAllowedValue(get(row, "Exit Trigger"), exitTriggerValues);
    const proficiency = normalizeAllowedValue(get(row, "Proficiency"), proficiencyValues);
    const growthAreas = normalizeAllowedValue(get(row, "Growth Areas"), growthAreaValues);
    const planFollowed = parsePlanFollowed(get(row, "Plan  Followed?"));

    if (!setup.valid) rowErrors.push("invalid Setup value");
    if (!exitTrigger.valid) rowErrors.push("invalid Exit Trigger value");
    if (!proficiency.valid) rowErrors.push("invalid Proficiency value");
    if (!growthAreas.valid) rowErrors.push("invalid Growth Areas value");
    if (!planFollowed.valid) rowErrors.push("invalid Plan Followed value");

    const tradeType = isShort ? "SHORT" : "LONG";
    const entryType = tradeType === "LONG" ? "BUY" : "SELL";
    const exitType = tradeType === "LONG" ? "SELL" : "BUY";
    const transactions: StockyMindParsedTrade["transactions"] = [];

    if (entryDate && entryPrice && entryQty) {
      transactions.push({
        type: entryType,
        price: entryPrice,
        quantity: entryQty,
        dateTime: entryDate,
        order: 0,
      });
    }

    for (let exitIndex = 1; exitIndex <= 3; exitIndex++) {
      const priceRaw = get(row, `E-${exitIndex} Price`);
      const qtyRaw = get(row, `E-${exitIndex} Qty`);
      const dateRaw = get(row, `E-${exitIndex} Date`);
      const hasExitData =
        stringValue(priceRaw).length > 0 ||
        stringValue(qtyRaw).length > 0 ||
        stringValue(dateRaw).length > 0;

      if (!hasExitData) continue;

      const price = numberValue(priceRaw);
      const quantity = numberValue(qtyRaw);
      const date = dateValue(dateRaw);

      if (!price || price <= 0 || !quantity || quantity <= 0 || !date) {
        rowErrors.push(`E-${exitIndex} requires price, qty, and date`);
        continue;
      }

      transactions.push({
        type: exitType,
        price,
        quantity,
        dateTime: date,
        order: transactions.length,
      });
    }

    if (rowErrors.length > 0) {
      errors.push(`Row ${rowNumber}: ${rowErrors.join("; ")}.`);
      return;
    }

    const totalEntryQty = transactions
      .filter((transaction) => transaction.type === entryType)
      .reduce((sum, transaction) => sum + transaction.quantity, 0);
    const totalExitQty = transactions
      .filter((transaction) => transaction.type === exitType)
      .reduce((sum, transaction) => sum + transaction.quantity, 0);

    trades.push({
      symbol,
      segment,
      tradeType,
      status: totalExitQty >= totalEntryQty ? "CLOSED" : "OPEN",
      transactions,
      stopLoss: numberValue(get(row, "SL")),
      closingPrice: numberValue(get(row, "CMP")),
      charges: numberValue(get(row, "Brokerage")) ?? 0,
      notes: stringValue(get(row, "Any other Observations")),
      setup: setup.value,
      planFollowed: planFollowed.value,
      exitTrigger: exitTrigger.value,
      proficiency: proficiency.value,
      growthAreas: growthAreas.value,
    });
  });

  return { trades, errors };
}
