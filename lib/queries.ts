import { cache } from "react";
import type { TradeStatus } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import {
  buildDashboardMetrics,
  buildJournalRows,
  buildGroupedJournalRows,
  buildLeaderboardEntries,
  filterTradesByTag,
  getCompetitionDateWindow,
  getCompetitionWindowTrades,
  groupTradesBySymbol,
} from "./trade-utils";

type TradeFilters = {
  from?: string;
  to?: string;
  symbol?: string;
  tag?: string;
  status?: string;
  minQty?: string;
  sort?: string;
};

const TRANSACTION_INCLUDE = {
  transactions: { orderBy: { dateTime: "asc" as const } },
} as const;

const TRANSACTION_INCLUDE_FULL = {
  transactions: { orderBy: { dateTime: "asc" as const } },
  images: true,
  competition: { select: { id: true, name: true } },
  user: { select: { id: true, name: true, email: true } },
} as const;

function buildTradeWhere(
  userId: string,
  filters: TradeFilters,
): Prisma.TradeWhereInput {
  const where: Prisma.TradeWhereInput = { userId };

  if (filters.status && filters.status !== "ALL") {
    where.status = filters.status as TradeStatus;
  }

  if (filters.symbol) {
    where.symbol = { contains: filters.symbol.trim().toUpperCase() };
  }

  if (filters.from || filters.to) {
    const dateFilter: Prisma.DateTimeFilter = {};
    if (filters.from) dateFilter.gte = new Date(filters.from);
    if (filters.to) {
      const toDate = new Date(filters.to);
      toDate.setHours(23, 59, 59, 999);
      dateFilter.lte = toDate;
    }
    where.firstEntryAt = dateFilter;
  }

  return where;
}

export const getCompetitions = cache(async function getCompetitions() {
  return prisma.competition.findMany({
    include: {
      creator: { select: { id: true, name: true } },
      participants: {
        where: { user: { role: { not: "ADMIN" } } },
        select: { userId: true, user: { select: { id: true, name: true, email: true } } },
      },
      requests: {
        where: { status: "PENDING" },
        select: { id: true, status: true, userId: true },
      },
    },
    orderBy: { startDate: "desc" },
  });
});

export const getDashboardData = cache(async function getDashboardData(userId: string) {
  const trades = await prisma.trade.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 500,
    include: TRANSACTION_INCLUDE,
  });

  const closedTrades = trades.filter((t) => t.status === "CLOSED");
  const openTrades = trades.filter((t) => t.status === "OPEN");

  return {
    trades: trades.slice(0, 50),
    openTrades,
    closedTrades,
    groupedTrades: groupTradesBySymbol(closedTrades),
    metrics: buildDashboardMetrics(trades),
  };
});

export const getJournalData = cache(async function getJournalData(
  userId: string,
  filters: TradeFilters,
) {
  const [trades, user] = await Promise.all([
    prisma.trade.findMany({
      where: buildTradeWhere(userId, filters),
      orderBy: [{ firstEntryAt: filters.sort === "ASC" ? "asc" : "desc" }],
      take: 1000,
      include: TRANSACTION_INCLUDE,
    }),
    prisma.user.findUnique({
      where: { id: userId },
      select: { portfolioCapital: true },
    }),
  ]);

  const filtered = filterTradesByTag(trades, filters.tag);
  const capital = user?.portfolioCapital ?? 100000;

  return {
    trades: filtered,
    rows: buildJournalRows(filtered, capital),
    groupedRows: buildGroupedJournalRows(filtered, capital),
  };
});

export const getTradesBySymbol = cache(async function getTradesBySymbol(
  userId: string,
  symbol: string,
  filters: Pick<TradeFilters, "from" | "to" | "tag">,
) {
  const trades = filterTradesByTag(
    await prisma.trade.findMany({
      where: {
        ...buildTradeWhere(userId, filters),
        symbol: symbol.toUpperCase(),
      },
      orderBy: { firstEntryAt: "desc" },
      take: 500,
      include: TRANSACTION_INCLUDE_FULL,
    }),
    filters.tag,
  );

  return {
    symbol: symbol.toUpperCase(),
    trades,
    metrics: buildDashboardMetrics(trades),
  };
});

export const getLeaderboard = cache(async function getLeaderboard(competitionId: string) {
  const competition = await prisma.competition.findUnique({
    where: { id: competitionId },
    include: {
      participants: {
        where: { user: { role: { not: "ADMIN" } } },
        select: { userId: true, user: true },
      },
    },
  });

  if (!competition) return null;

  const participantIds = competition.participants.map((p) => p.userId);
  const competitionWindow = getCompetitionDateWindow(competition);

  const trades =
    participantIds.length > 0
      ? await prisma.trade.findMany({
          where: {
            userId: { in: participantIds },
            firstEntryAt: {
              gte: competitionWindow.startDate,
              lte: competitionWindow.endDate,
            },
          },
          orderBy: { firstEntryAt: "asc" },
          include: TRANSACTION_INCLUDE,
        })
      : [];

  const tradesByUserId = new Map<string, typeof trades>();
  for (const trade of trades) {
    const existing = tradesByUserId.get(trade.userId);
    if (existing) existing.push(trade);
    else tradesByUserId.set(trade.userId, [trade]);
  }

  const entries = buildLeaderboardEntries(
    competition.participants.map((participant) => ({
      user: participant.user,
      trades: getCompetitionWindowTrades(
        tradesByUserId.get(participant.userId) || [],
        competition,
      ),
    })),
  );

  if (entries.length > 0) {
    const now = Date.now();
    await prisma.$transaction(
      entries.map((entry) =>
        prisma.userCompetitionStat.upsert({
          where: {
            userId_competitionId: { userId: entry.userId, competitionId },
          },
          create: {
            userId: entry.userId,
            competitionId,
            portfolioImpactPct: entry.portfolioImpactPct,
            returnPercentage: entry.returnPercentage,
            maxDrawdown: entry.maxDrawdown,
            winRate: entry.winRate,
            totalTrades: entry.totalTrades,
            profitFactor: entry.profitFactor,
          },
          update: {
            portfolioImpactPct: entry.portfolioImpactPct,
            returnPercentage: entry.returnPercentage,
            maxDrawdown: entry.maxDrawdown,
            winRate: entry.winRate,
            totalTrades: entry.totalTrades,
            profitFactor: entry.profitFactor,
          },
        }),
      ),
    );
  }

  return { competition, entries };
});

export const getPendingUsers = cache(async function getPendingUsers() {
  return prisma.user.findMany({
    where: { role: "TRADER", approvalStatus: "PENDING" },
    orderBy: { createdAt: "asc" },
  });
});

export const getAllTraders = cache(async function getAllTraders() {
  return prisma.user.findMany({
    where: { role: { in: ["TRADER", "SUPER_TRADER"] } },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      approvalStatus: true,
      isActive: true,
      emailVerifiedAt: true,
      createdAt: true,
    },
  });
});

export const getTraderCompetitionTrades = cache(async function getTraderCompetitionTrades(
  competitionId: string,
  userId: string,
) {
  const [competition, user] = await Promise.all([
    prisma.competition.findUnique({ where: { id: competitionId } }),
    prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, portfolioCapital: true },
    }),
  ]);

  if (!competition || !user) return null;

  const competitionWindow = getCompetitionDateWindow(competition);

  const trades = await prisma.trade.findMany({
    where: {
      userId,
      firstEntryAt: {
        gte: competitionWindow.startDate,
        lte: competitionWindow.endDate,
      },
    },
    orderBy: { firstEntryAt: "desc" },
    include: TRANSACTION_INCLUDE,
  });

  return {
    competition,
    user,
    trades: getCompetitionWindowTrades(trades, competition),
  };
});
