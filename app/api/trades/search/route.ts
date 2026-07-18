import { NextRequest, NextResponse } from "next/server";
import { requireActiveUser } from "@/lib/auth";
import { handleApiError } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";
import { buildGroupedJournalRows } from "@/lib/trade-utils";
import { getCached, setCache } from "@/lib/cache";

export async function GET(req: NextRequest) {
  try {
    const user = await requireActiveUser();

    const sp = req.nextUrl.searchParams;
    const symbol = sp.get("symbol") || "";
    const from = sp.get("from") || "";
    const to = sp.get("to") || "";
    const status = sp.get("status") || "OPEN";
    const reviewed = sp.get("reviewed") || "";
    const page = Math.max(1, parseInt(sp.get("page") || "1", 10));
    const pageSize = Math.min(50, Math.max(5, parseInt(sp.get("pageSize") || "20", 10)));
    const tag = sp.get("tag") || "";
    const sortKey = sp.get("sortKey") || "";
    const sortDir = sp.get("sortDir") === "asc" ? "asc" : "desc";

    const cacheKey = `trades:search:${user.id}:${symbol}:${from}:${to}:${status}:${reviewed}:${tag}:${sortKey}:${sortDir}:${page}:${pageSize}`;
    const cached = getCached<typeof result>(cacheKey);
    if (cached) return NextResponse.json(cached);

    const where: Record<string, unknown> = { userId: user.id };
    if (status !== "ALL") where.status = status;
    if (reviewed === "REVIEWED") where.reviewed = true;
    if (reviewed === "UNREVIEWED") where.reviewed = false;
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
      take: 1000,
      include: { transactions: { orderBy: { dateTime: "asc" as const } } },
    });

    const userData = await prisma.user.findUnique({
      where: { id: user.id },
      select: { portfolioCapital: true },
    });
    const capital = userData?.portfolioCapital ?? 100000;

    const allGrouped = buildGroupedJournalRows(allTrades, capital);

    let filtered = allGrouped;
    if (tag) {
      const t = tag.toLowerCase();
      filtered = allGrouped.filter((r) => r.symbol.toLowerCase().includes(t));
    }

    if (sortKey) {
      const dateVal = (d: Date | string | null | undefined) => {
        if (!d) return 0;
        const t = new Date(d).getTime();
        return Number.isNaN(t) ? 0 : t;
      };
      filtered = [...filtered].sort((a, b) => {
        if (sortKey === "symbol") {
          const cmp = a.symbol.localeCompare(b.symbol);
          return sortDir === "asc" ? cmp : -cmp;
        }
        let av = 0;
        let bv = 0;
        switch (sortKey) {
          case "entryDate": av = dateVal(a.entryLegs[0]?.dateTime); bv = dateVal(b.entryLegs[0]?.dateTime); break;
          case "exitDate": av = dateVal(a.exitDateTime); bv = dateVal(b.exitDateTime); break;
          case "openCapital": av = a.openCapital; bv = b.openCapital; break;
          case "stopLossPct": av = a.stopLossPct ?? 0; bv = b.stopLossPct ?? 0; break;
          case "allocationPct": av = a.allocationPct; bv = b.allocationPct; break;
          case "ageDays": av = a.ageDays; bv = b.ageDays; break;
          case "pnlPct": av = a.pnlPct; bv = b.pnlPct; break;
          case "pnlAmount": av = a.pnlAmount; bv = b.pnlAmount; break;
          case "avgEntryPrice": av = a.weightedEntryPrice; bv = b.weightedEntryPrice; break;
          case "impactPct": av = a.impactPct; bv = b.impactPct; break;
        }
        return sortDir === "asc" ? av - bv : bv - av;
      });
    }

    const totalCount = filtered.length;
    const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
    const start = (page - 1) * pageSize;
    const pagedRows = filtered.slice(start, start + pageSize);

    const openRows = filtered.filter((r) => r.derivedStatus === "OPEN");
    const totalAlloc = openRows.reduce((s, r) => s + r.allocationPct, 0);
    const totalImpact = filtered.reduce((s, r) => s + r.impactPct, 0);
    const totalRealizedPnl = filtered.reduce((s, r) => s + r.realizedPnl, 0);
    const totalUnrealizedPnl = openRows.reduce((s, r) => s + r.unrealizedPnl, 0);
    const totalPnl = totalRealizedPnl + totalUnrealizedPnl;

    const result = {
      trades: pagedRows,
      totalCount,
      totalPages,
      page,
      pageSize,
      metrics: {
        totalTrades: totalCount,
        totalAlloc,
        totalRealizedPnl,
        totalOpenPnl: totalPnl,
        totalUnrealizedPnl,
        totalPnl,
        totalImpact,
      },
    };

    setCache(cacheKey, result, 5_000);

    return NextResponse.json(result);
  } catch (err) {
    return handleApiError(err);
  }
}
