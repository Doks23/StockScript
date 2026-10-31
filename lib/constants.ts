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

export const setupValues = [
  "Base on Base",
  "Box",
  "Channel",
  "Cheat",
  "CwH",
  "EP",
  "EP Pullback",
  "Flag",
  "iH&S",
  "IPO base",
  "Inside Day",
  "Intraday",
  "Low Cheat",
  "NR Bar",
  "Pennant",
  "Pullback",
  "Pyramid",
  "Shakeout",
  "Tight Closes",
  "Trendline",
  "Triangle",
  "VCP",
  "W-pattern",
  "Wedge",
  "WIB",
] as const;

export const proficiencyValues = [
  "Emotional Control",
  "Exited in Strength",
  "Good Entry",
  "Good Trailing",
  "Protected Breakeven",
  "Small SL",
  "Well Managed",
] as const;

export const growthAreaValues = [
  "Biased Analysis",
  "Booked Early",
  "Didn't Book Loss",
  "FOMO",
  "Illiquid Stock",
  "Illogical SL",
  "Lack of Patience",
  "Late Entry",
  "Momentum-less stock",
  "Overconfidence",
  "Overtrading",
  "Poor Execution",
  "Poor Exit",
  "Poor Po Size",
  "Poor Sector",
  "Poor Stock",
  "Shifted SL Quickly",
  "Too Early Entry",
  "Too Tight SL",
] as const;

export const exitTriggerValues = [
  "Breakeven exit",
  "Fear exit",
  "Market Pressure",
  "R multiples",
  "Random",
  "Rejection",
  "Setup Failed",
  "SL",
  "Target",
  "Time-based",
  "Trailing SL",
] as const;

export const setupOptions = setupValues.map((value) => ({ value, label: value }));
export const proficiencyOptions = proficiencyValues.map((value) => ({ value, label: value }));
export const avoidableReasonValues = ["Setup", "Market", "Other"] as const;
export const avoidableReasonOptions = avoidableReasonValues.map((value) => ({ value, label: value }));

export const growthAreaOptions = growthAreaValues.map((value) => ({ value, label: value }));
export const exitTriggerOptions = exitTriggerValues.map((value) => ({ value, label: value }));

/** Review checklist: pick-one questions, then yes/no questions. Keys are Trade columns. */
export const reviewSelectFields = [
  { key: "marketContext", label: "Market vs stock", options: ["Market strong", "Market weak", "Stock stronger than market"] },
  { key: "entrySource", label: "Planned?", options: ["On watchlist", "Chased after thrust"] },
  { key: "entryTiming", label: "Entry timing", options: ["Early", "On time", "Late"] },
  { key: "sizeFit", label: "Size was", options: ["Too small", "Right", "Too big"] },
  { key: "tradeStyle", label: "Trade type", options: ["Velocity", "Magnitude"] },
] as const;

export const reviewYesNoFields = [
  { key: "stopAtStructure", label: "Stop at structure?" },
  { key: "addPlanned", label: "Add planned?" },
  { key: "reEntered", label: "Re-entered after stop-out?" },
] as const;

export const visibilityOptions = [
  { value: "PUBLIC", label: "Public" },
  { value: "PRIVATE", label: "Private" },
] as const;
