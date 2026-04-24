export const MIN_COMPETITION_TRADES = 5;
export const MIN_COMPETITION_CAPITAL_PER_TRADE = 1_000;

export const segmentOptions = [
  { value: "EQUITY", label: "Equity" },
  { value: "INTRADAY", label: "Intraday" },
  { value: "OPTIONS", label: "Options" },
  { value: "FUTURES", label: "Futures" },
] as const;

export const tradeTypeOptions = [
  { value: "LONG", label: "Long" },
  { value: "SHORT", label: "Short" },
] as const;

export const visibilityOptions = [
  { value: "PUBLIC", label: "Public" },
  { value: "PRIVATE", label: "Private" },
] as const;
