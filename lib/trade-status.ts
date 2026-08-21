import type { GroupedTradeRow } from "@/lib/trade-utils";

export const isPartiallyClosed = (row: GroupedTradeRow) =>
  row.derivedStatus === "OPEN" && row.exitQty > 0;

/**
 * How a row's open/partial/closed state is painted.
 *
 * Shared rather than copied because the detailed and simple journals are read
 * side by side, so a position has to look the same shade of open in both.
 */
export const getTradeStatusUi = (row: GroupedTradeRow) => {
  if (isPartiallyClosed(row)) {
    return {
      label: "P",
      chipClass: "border-amber-200 bg-amber-50 text-amber-700",
      borderClass: "border-l-amber-400",
      rowClass: "bg-amber-50/40",
      title: "Partially closed with remaining open quantity",
    };
  }
  if (row.derivedStatus === "OPEN") {
    return {
      label: "O",
      chipClass: "border-blue-200 bg-blue-50 text-blue-700",
      borderClass: "border-l-blue-400",
      rowClass: "bg-blue-50/20",
      title: "Open position",
    };
  }

  return {
    label: "",
    chipClass: "",
    borderClass: "border-l-slate-200",
    rowClass: "bg-white",
    title: "Closed trade",
  };
};
