import { NextRequest } from "next/server";
import { requireActiveUser } from "@/lib/auth";
import { handleApiError } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";
import {
  getEntryTransactions,
  getExitTransactions,
  getWeightedEntryPrice,
  getTotalEntryQty,
  getTotalExitQty,
  calculateTradePnl,
} from "@/lib/trade-utils";

function esc(val: string | number | null | undefined): string {
  if (val === null || val === undefined) return "";
  const s = String(val);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function fmtCSVDate(d: Date | string | null | undefined): string {
  if (!d) return "";
  const dt = typeof d === "string" ? new Date(d) : d;
  return dt.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function fmtCSVPnl(n: number): string {
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}`;
}

export async function GET(req: NextRequest) {
  try {
    const user = await requireActiveUser();

    const sp = req.nextUrl.searchParams;
    const symbol = sp.get("symbol") || "";
    const from = sp.get("from") || "";
    const to = sp.get("to") || "";
    const status = sp.get("status") || "ALL";

    const where: Record<string, unknown> = { userId: user.id };
    if (status !== "ALL") where.status = status;
    if (symbol) where.symbol = { contains: symbol.trim().toUpperCase() };
    if (from || to) {
      const dateFilter: Record<string, Date> = {};
      if (from) dateFilter.gte = new Date(from);
      if (to) {
        const toDate = new Date(to);
        toDate.setHours(23, 59, 59, 999);
        dateFilter.lte = toDate;
      }
      where.firstEntryAt = dateFilter;
    }

    const allTrades = await prisma.trade.findMany({
      where: where as any,
      orderBy: { firstEntryAt: "desc" },
      include: { transactions: { orderBy: { dateTime: "asc" as const } } },
    });

    const headers = [
      "Entry Date",
      "Symbol",
      "Entry Price",
      "Side (Long/Short)",
      "Quantity",
      "Stop Loss",
      "Exit 1 Price",
      "Exit 1 Qty",
      "Exit 1 Date",
      "Exit 2 Price",
      "Exit 2 Qty",
      "Exit 2 Date",
      "Exit 3 Price",
      "Exit 3 Qty",
      "Exit 3 Date",
      "P&L",
      "Setup",
      "Entry TF",
      "Plan Followed?",
      "Exit Trigger",
      "Proficiency",
      "Growth Areas",
      "Notes",
    ].join(",");

    const rows = allTrades.map((trade) => {
      const entries = getEntryTransactions(trade);
      const exits = getExitTransactions(trade);
      const entryPrice = getWeightedEntryPrice(trade);
      const totalQty = getTotalEntryQty(trade);
      const { realizedPnl } = calculateTradePnl(trade);
      const firstEntry = entries[0];

      const exitLegs = exits.map((e) => ({
        price: e.price,
        qty: e.quantity,
        date: e.dateTime,
      }));

      const pnl = realizedPnl;

      return [
        fmtCSVDate(firstEntry?.dateTime),
        esc(trade.symbol),
        esc(entryPrice.toFixed(2)),
        esc(trade.tradeType === "LONG" ? "Long" : "Short"),
        esc(totalQty),
        esc(trade.stopLoss?.toFixed(2) ?? null),
        esc(exitLegs[0]?.price.toFixed(2) ?? null),
        esc(exitLegs[0]?.qty ?? null),
        fmtCSVDate(exitLegs[0]?.date),
        esc(exitLegs[1]?.price.toFixed(2) ?? null),
        esc(exitLegs[1]?.qty ?? null),
        fmtCSVDate(exitLegs[1]?.date),
        esc(exitLegs[2]?.price.toFixed(2) ?? null),
        esc(exitLegs[2]?.qty ?? null),
        fmtCSVDate(exitLegs[2]?.date),
        esc(fmtCSVPnl(pnl)),
        esc(trade.setup),
        esc(trade.segment),
        esc(trade.planFollowed === null ? "" : trade.planFollowed ? "Yes" : "No"),
        esc(trade.exitTrigger),
        esc(trade.proficiency),
        esc(trade.growthAreas),
        esc(trade.notes),
      ].join(",");
    });

    const now = new Date();
    const dateStr = now.toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const csv = "\uFEFF" + headers + "\n" + rows.join("\n");

    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="SS_TradeJournal_${user.name}_${dateStr}.csv"`,
      },
    });
  } catch (err) {
    return handleApiError(err);
  }
}
