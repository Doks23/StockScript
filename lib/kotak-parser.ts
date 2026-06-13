import * as XLSX from "xlsx";
import type { RawTransaction } from "@/lib/trade-matcher";

type SheetRow = unknown[];

const REQUIRED_HEADERS = [
  "Trade Date",
  "Trade Time",
  "Security Name",
  "Transaction Type",
  "Quantity",
  "Market Rate",
  "Total Charges",
  "STT/CTT",
] as const;

export type KotakParseResult = {
  transactions: RawTransaction[];
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

function normalizeHeader(value: unknown) {
  return stringValue(value).toLowerCase();
}

function excelSerialDate(value: number) {
  const parsed = XLSX.SSF.parse_date_code(value);
  if (!parsed) return null;
  return new Date(parsed.y, parsed.m - 1, parsed.d, parsed.H, parsed.M, parsed.S);
}

function parseTimeParts(value: unknown) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return {
      hours: value.getHours(),
      minutes: value.getMinutes(),
      seconds: value.getSeconds(),
    };
  }

  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (!parsed) return null;
    return {
      hours: parsed.H,
      minutes: parsed.M,
      seconds: parsed.S,
    };
  }

  const raw = stringValue(value);
  if (!raw) return { hours: 0, minutes: 0, seconds: 0 };

  const parts = raw.split(":").map((part) => Number(part));
  if (parts.length < 2 || parts.some((part) => !Number.isFinite(part))) return null;

  return {
    hours: parts[0],
    minutes: parts[1],
    seconds: parts[2] ?? 0,
  };
}

function parseDateTime(dateValue: unknown, timeValue: unknown) {
  let date: Date | null = null;

  if (dateValue instanceof Date && !Number.isNaN(dateValue.getTime())) {
    date = dateValue;
  } else if (typeof dateValue === "number") {
    date = excelSerialDate(dateValue);
  } else {
    const raw = stringValue(dateValue);
    const parts = raw.split(/[/-]/).map((part) => Number(part));
    if (parts.length === 3 && parts.every((part) => Number.isFinite(part))) {
      const [dd, mm, yyyy] = parts;
      date = new Date(yyyy, mm - 1, dd);
    } else {
      const parsed = new Date(raw);
      date = Number.isNaN(parsed.getTime()) ? null : parsed;
    }
  }

  if (!date || Number.isNaN(date.getTime())) return null;

  const time = parseTimeParts(timeValue);
  if (!time) return null;

  date.setHours(time.hours, time.minutes, time.seconds, 0);
  return date;
}

function rowHasAnyData(row: SheetRow) {
  return row.some((value) => stringValue(value).length > 0);
}

function findHeaderRow(rows: SheetRow[]) {
  const required = REQUIRED_HEADERS.map((header) => header.toLowerCase());

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
    const normalized = rows[rowIndex].map(normalizeHeader);
    if (required.every((header) => normalized.includes(header))) {
      return rowIndex;
    }
  }

  return -1;
}

function buildHeaderIndex(headerRow: SheetRow) {
  const normalized = headerRow.map(normalizeHeader);
  return Object.fromEntries(
    REQUIRED_HEADERS.map((header) => [header, normalized.indexOf(header.toLowerCase())]),
  ) as Record<(typeof REQUIRED_HEADERS)[number], number>;
}

export function parseKotakWorkbook(workbookBuffer: ArrayBuffer): KotakParseResult {
  const workbook = XLSX.read(Buffer.from(workbookBuffer), {
    type: "buffer",
    cellDates: true,
  });

  const sheet = workbook.Sheets["On Market"];
  if (!sheet) {
    return {
      transactions: [],
      errors: [
        'Workbook does not contain an "On Market" sheet. Select Kotak Securities only for Kotak transaction statements.',
      ],
    };
  }

  const rows = XLSX.utils.sheet_to_json<SheetRow>(sheet, {
    header: 1,
    defval: null,
    raw: true,
  });

  const headerRowIndex = findHeaderRow(rows);
  if (headerRowIndex === -1) {
    const availableHeaders = rows
      .find((row) =>
        row.some((value) =>
          REQUIRED_HEADERS.includes(stringValue(value) as (typeof REQUIRED_HEADERS)[number]),
        ),
      )
      ?.map(stringValue)
      .filter(Boolean);

    return {
      transactions: [],
      errors: [
        `Kotak trade table headers not found. Required headers: ${REQUIRED_HEADERS.join(", ")}.`,
        availableHeaders?.length
          ? `Available nearby headers: ${availableHeaders.join(", ")}.`
          : "No Kotak-like headers were found.",
      ],
    };
  }

  const headerIndex = buildHeaderIndex(rows[headerRowIndex]);
  const dataRows = rows.slice(headerRowIndex + 1);
  const transactions: RawTransaction[] = [];
  const errors: string[] = [];

  dataRows.forEach((row, index) => {
    if (!rowHasAnyData(row)) return;

    const rowNumber = headerRowIndex + index + 2;
    const symbol = stringValue(row[headerIndex["Security Name"]]);
    const rawType = stringValue(row[headerIndex["Transaction Type"]]).toLowerCase();
    const quantity = numberValue(row[headerIndex.Quantity]);
    const price = numberValue(row[headerIndex["Market Rate"]]);
    const totalCharges = numberValue(row[headerIndex["Total Charges"]]) ?? 0;
    const sttCtt = numberValue(row[headerIndex["STT/CTT"]]) ?? 0;
    const date = parseDateTime(row[headerIndex["Trade Date"]], row[headerIndex["Trade Time"]]);

    if (!symbol) {
      errors.push(`Row ${rowNumber}: empty Security Name.`);
      return;
    }
    if (!date) {
      errors.push(`Row ${rowNumber}: invalid Trade Date or Trade Time.`);
      return;
    }
    if (!quantity || quantity <= 0) {
      errors.push(`Row ${rowNumber}: invalid Quantity "${stringValue(row[headerIndex.Quantity])}".`);
      return;
    }
    if (!price || price <= 0) {
      errors.push(
        `Row ${rowNumber}: invalid Market Rate "${stringValue(row[headerIndex["Market Rate"]])}".`,
      );
      return;
    }

    const isBuy = rawType === "buy";
    const isSell = rawType === "sell";
    if (!isBuy && !isSell) {
      errors.push(
        `Row ${rowNumber}: unknown Transaction Type "${stringValue(row[headerIndex["Transaction Type"]])}" (expected "Buy" or "Sell").`,
      );
      return;
    }

    transactions.push({
      ticker: symbol,
      date,
      type: isBuy ? "BUY" : "SELL",
      price,
      quantity,
      charges: totalCharges + sttCtt,
    });
  });

  return { transactions, errors };
}
