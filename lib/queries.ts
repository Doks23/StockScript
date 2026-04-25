import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import {
  buildDashboardMetrics,
  buildJournalRows,
  buildGroupedJournalRows,
  buildLeaderboardEntries,
  filterTradesByTag,
  getCompetitionWindowTrades,
  getLastExitTime,
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

const transactionInclude = {
  transactions: { orderBy: { dateTime: "asc" as const } },
  images: true,
  competition: { select: { id: true, name: true } },
  user: { select: { id: true, name: true, email: true } },
};

function buildTradeWhere(
  userId: string,
  filters: TradeFilters,
): Prisma.TradeWhereInput {
  const where: Prisma.TradeWhereInput = { userId };

  if (filters.status && filters.status !== "ALL") {
    where.status = filters.status;
  }

  if (filters.symbol) {
    where.symbol = { contains: filters.symbol.trim().toUpperCase() };
  }

  if (filters.minQty) {
    where.transactions = {
      some: { quantity: { gte: Number(filters.minQty) } },
    };
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

export async function getCompetitions() {
  return prisma.competition.findMany({
    include: {
      creator: { select: { id: true, name: true } },
      participants: {
        select: { userId: true, user: { select: { id: true, name: true } } },
      },
      requests: {
        where: { status: "PENDING" },
        select: { id: true, status: true },
      },
    },
    orderBy: { startDate: "desc" },
  });
}

export async function getDashboardData(userId: string) {
  const trades = await prisma.trade.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 500,
    include: transactionInclude,
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
}

export async function getJournalData(userId: string, filters: TradeFilters) {
  const trades = filterTradesByTag(
    await prisma.trade.findMany({
      where: buildTradeWhere(userId, filters),
      orderBy: [{ firstEntryAt: filters.sort === "ASC" ? "asc" : "desc" }],
      include: transactionInclude,
    }),
    filters.tag,
  );

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { portfolioCapital: true },
  });

  return {
    trades,
    rows: buildJournalRows(trades, user?.portfolioCapital ?? 100000),
    groupedRows: buildGroupedJournalRows(
      trades,
      user?.portfolioCapital ?? 100000,
    ),
  };
}

export async function getTradesBySymbol(
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
      include: transactionInclude,
    }),
    filters.tag,
  );

  return {
    symbol: symbol.toUpperCase(),
    trades,
    metrics: buildDashboardMetrics(trades),
  };
}

export async function getLeaderboard(competitionId: string) {
  const competition = await prisma.competition.findUnique({
    where: { id: competitionId },
    include: {
      participants: {
        select: {
          userId: true,
          user: { select: { id: true, name: true, email: true, portfolioCapital: true } },
        },
      },
    },
  });

  if (!competition) return null;

  const participantIds = competition.participants.map((p) => p.userId);

  const trades =
    participantIds.length > 0
      ? await prisma.trade.findMany({
          where: {
            userId: { in: participantIds },
            OR: [
              { competitionId },
              {
                transactions: {
                  some: {
                    dateTime: {
                      gte: competition.startDate,
                      lte: competition.endDate,
                    },
                  },
                },
              },
              {
                firstEntryAt: {
                  gte: competition.startDate,
                  lte: competition.endDate,
                },
              },
              {
                status: "CLOSED",
                updatedAt: {
                  gte: competition.startDate,
                  lte: competition.endDate,
                },
              },
            ],
          },
          orderBy: { firstEntryAt: "asc" },
          include: transactionInclude,
        })
      : [];

  const tradesByUserId = new Map<string, typeof trades>();
  trades.forEach((trade) => {
    if (!tradesByUserId.has(trade.userId)) {
      tradesByUserId.set(trade.userId, []);
    }
    tradesByUserId.get(trade.userId)!.push(trade);
  });

  const entries = buildLeaderboardEntries(
    competition.participants.map((participant) => ({
      user: participant.user,
      trades: getCompetitionWindowTrades(
        tradesByUserId.get(participant.userId) || [],
        competition,
      ),
    })),
  );

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

  return { competition, entries };
}

export async function getPendingUsers() {
  return prisma.user.findMany({
    where: { role: "TRADER", approvalStatus: "PENDING" },
    orderBy: { createdAt: "asc" },
  });
}

export async function getAllTraders() {
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
}

export async function getTraderCompetitionTrades(
  competitionId: string,
  userId: string,
) {
  const competition = await prisma.competition.findUnique({
    where: { id: competitionId },
  });
  if (!competition) return null;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, portfolioCapital: true },
  });
  if (!user) return null;

  const trades = await prisma.trade.findMany({
    where: {
      userId,
      OR: [
        { competitionId },
        {
          transactions: {
            some: {
              dateTime: {
                gte: competition.startDate,
                lte: competition.endDate,
              },
            },
          },
        },
        {
          firstEntryAt: {
            gte: competition.startDate,
            lte: competition.endDate,
          },
        },
      ],
    },
    orderBy: { firstEntryAt: "desc" },
    include: transactionInclude,
  });

  // Strictly filter the DB results down to the exact window bounds
  return {
    competition,
    user,
    trades: getCompetitionWindowTrades(trades, competition),
  };
}
