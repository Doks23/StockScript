import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../lib/password";
import { calculateTradeMetrics } from "../lib/trade-utils";

const prisma = new PrismaClient();

type TxInput = { type: "BUY" | "SELL"; price: number; quantity: number; dateTime: Date };

type TradeSeed = {
  userId: string;
  competitionId: string;
  rowIndex: number;
  symbol: string;
  segment: string;
  tradeType: "LONG" | "SHORT";
  status: "OPEN" | "CLOSED";
  tags: string;
  notes: string;
  charges: number;
  closingPrice: number | null;
  transactions: TxInput[];
};

async function main() {
  await prisma.tradeImage.deleteMany();
  await prisma.userCompetitionStat.deleteMany();
  await prisma.competitionParticipant.deleteMany();
  await prisma.transaction.deleteMany();
  await prisma.trade.deleteMany();
  await prisma.emailVerificationToken.deleteMany();
  await prisma.session.deleteMany();
  await prisma.competition.deleteMany();
  await prisma.user.deleteMany();

  const admin = await prisma.user.create({
    data: {
      name: "Admin Desk",
      email: "admin@stockscript.dev",
      passwordHash: hashPassword("Admin@12345"),
      role: "ADMIN",
      emailVerifiedAt: new Date("2026-04-01T09:00:00.000Z"),
      approvalStatus: "APPROVED",
      approvedAt: new Date("2026-04-01T09:00:00.000Z"),
      isActive: true,
    },
  });

  // portfolioCapital set for realistic allocation % display
  const traders = await prisma.$transaction([
    prisma.user.create({
      data: {
        name: "Aarav Mehta",
        email: "aarav@stockscript.dev",
        passwordHash: hashPassword("Trader@123"),
        role: "TRADER",
        portfolioCapital: 500000,
        emailVerifiedAt: new Date("2026-04-02T08:00:00.000Z"),
        approvalStatus: "APPROVED",
        approvedAt: new Date("2026-04-02T10:00:00.000Z"),
        approvedBy: admin.id,
        isActive: true,
      },
    }),
    prisma.user.create({
      data: {
        name: "Mira Shah",
        email: "mira@stockscript.dev",
        passwordHash: hashPassword("Trader@123"),
        role: "TRADER",
        portfolioCapital: 300000,
        emailVerifiedAt: new Date("2026-04-02T08:20:00.000Z"),
        approvalStatus: "APPROVED",
        approvedAt: new Date("2026-04-02T10:05:00.000Z"),
        approvedBy: admin.id,
        isActive: true,
      },
    }),
    prisma.user.create({
      data: {
        name: "Kabir Nair",
        email: "kabir@stockscript.dev",
        passwordHash: hashPassword("Trader@123"),
        role: "TRADER",
        portfolioCapital: 200000,
        emailVerifiedAt: new Date("2026-04-02T08:40:00.000Z"),
        approvalStatus: "APPROVED",
        approvedAt: new Date("2026-04-02T10:15:00.000Z"),
        approvedBy: admin.id,
        isActive: true,
      },
    }),
    prisma.user.create({
      data: {
        name: "Riya Jain",
        email: "riya@stockscript.dev",
        passwordHash: hashPassword("Trader@123"),
        role: "TRADER",
        emailVerifiedAt: new Date("2026-04-15T09:00:00.000Z"),
        approvalStatus: "PENDING",
        isActive: false,
      },
    }),
  ]);

  const springSprint = await prisma.competition.create({
    data: {
      name: "April Momentum Sprint",
      startDate: new Date("2026-04-01T00:00:00.000Z"),
      endDate: new Date("2026-04-30T23:59:59.999Z"),
      visibility: "PUBLIC",
      createdBy: admin.id,
      participants: {
        create: traders.slice(0, 3).map((u) => ({ userId: u.id })),
      },
    },
  });

  // ── Aarav Mehta — 5 closed + 1 open (portfolioCapital 500k) ──────────────
  // Targets strong momentum trades, ~14% return on capital deployed
  const aaravTrades: TradeSeed[] = [
    {
      userId: traders[0].id,
      competitionId: springSprint.id,
      rowIndex: 1,
      symbol: "RELIANCE",
      segment: "EQUITY",
      tradeType: "LONG",
      status: "CLOSED",
      tags: "breakout,swing",
      notes: "Clean daily breakout with retest entry.",
      charges: 54,
      closingPrice: null,
      transactions: [
        { type: "BUY",  price: 2420, quantity: 20, dateTime: new Date("2026-04-03T03:55:00.000Z") },
        { type: "SELL", price: 2488, quantity: 20, dateTime: new Date("2026-04-03T06:10:00.000Z") },
      ],
    },
    {
      userId: traders[0].id,
      competitionId: springSprint.id,
      rowIndex: 2,
      symbol: "INFY",
      segment: "INTRADAY",
      tradeType: "SHORT",
      status: "CLOSED",
      tags: "opening-drive,mean-reversion",
      notes: "Strong downside drive from first hour structure.",
      charges: 66,
      closingPrice: null,
      transactions: [
        { type: "SELL", price: 1510, quantity: 40, dateTime: new Date("2026-04-05T04:05:00.000Z") },
        { type: "BUY",  price: 1484, quantity: 40, dateTime: new Date("2026-04-05T07:15:00.000Z") },
      ],
    },
    {
      userId: traders[0].id,
      competitionId: springSprint.id,
      rowIndex: 3,
      symbol: "NIFTY26APR24000CE",
      segment: "OPTIONS",
      tradeType: "LONG",
      status: "CLOSED",
      tags: "event-day,options-scalp",
      notes: "Momentum continuation after range expansion.",
      charges: 88,
      closingPrice: null,
      transactions: [
        { type: "BUY",  price: 122, quantity: 75,  dateTime: new Date("2026-04-08T05:10:00.000Z") },
        { type: "BUY",  price: 119, quantity: 75,  dateTime: new Date("2026-04-08T05:25:00.000Z") },
        { type: "SELL", price: 146, quantity: 150, dateTime: new Date("2026-04-08T07:25:00.000Z") },
      ],
    },
    {
      userId: traders[0].id,
      competitionId: springSprint.id,
      rowIndex: 4,
      symbol: "HDFCBANK",
      segment: "FUTURES",
      tradeType: "SHORT",
      status: "CLOSED",
      tags: "trend-day",
      notes: "Lower high rejection on hourly structure.",
      charges: 92,
      closingPrice: null,
      transactions: [
        { type: "SELL", price: 1678, quantity: 45, dateTime: new Date("2026-04-12T03:45:00.000Z") },
        { type: "BUY",  price: 1644, quantity: 45, dateTime: new Date("2026-04-12T06:40:00.000Z") },
      ],
    },
    {
      // 5th qualifying trade — needed for leaderboard eligibility
      userId: traders[0].id,
      competitionId: springSprint.id,
      rowIndex: 5,
      symbol: "BAJFINANCE",
      segment: "EQUITY",
      tradeType: "LONG",
      status: "CLOSED",
      tags: "swing,sector-rotation",
      notes: "NBFC sector rotation led by strong FII buying.",
      charges: 55,
      closingPrice: null,
      transactions: [
        { type: "BUY",  price: 7100, quantity: 10, dateTime: new Date("2026-04-17T04:00:00.000Z") },
        { type: "SELL", price: 7480, quantity: 10, dateTime: new Date("2026-04-18T07:30:00.000Z") },
      ],
    },
    {
      userId: traders[0].id,
      competitionId: springSprint.id,
      rowIndex: 6,
      symbol: "SBIN",
      segment: "EQUITY",
      tradeType: "LONG",
      status: "OPEN",
      tags: "swing,open-position",
      notes: "Holding overnight — PSU bank breakout thesis intact.",
      charges: 52,
      closingPrice: 836,
      transactions: [
        { type: "BUY", price: 824, quantity: 90, dateTime: new Date("2026-04-20T04:20:00.000Z") },
      ],
    },
  ];

  // ── Mira Shah — 5 closed trades (portfolioCapital 300k) ─────────────────
  // Aggressive options trader, highest return % → leaderboard rank #1
  const miraTrades: TradeSeed[] = [
    {
      userId: traders[1].id,
      competitionId: springSprint.id,
      rowIndex: 1,
      symbol: "SBIN",
      segment: "EQUITY",
      tradeType: "LONG",
      status: "CLOSED",
      tags: "range-break",
      notes: "Textbook range break from base.",
      charges: 54,
      closingPrice: null,
      transactions: [
        { type: "BUY",  price: 812, quantity: 100, dateTime: new Date("2026-04-02T04:00:00.000Z") },
        { type: "SELL", price: 836, quantity: 100, dateTime: new Date("2026-04-02T06:05:00.000Z") },
      ],
    },
    {
      userId: traders[1].id,
      competitionId: springSprint.id,
      rowIndex: 2,
      symbol: "ICICIBANK",
      segment: "INTRADAY",
      tradeType: "SHORT",
      status: "CLOSED",
      tags: "counter-trend",
      notes: "Fade idea failed after sector strength.",
      charges: 72,
      closingPrice: null,
      transactions: [
        { type: "SELL", price: 1096, quantity: 70, dateTime: new Date("2026-04-07T04:20:00.000Z") },
        { type: "BUY",  price: 1110, quantity: 70, dateTime: new Date("2026-04-07T07:05:00.000Z") },
      ],
    },
    {
      userId: traders[1].id,
      competitionId: springSprint.id,
      rowIndex: 3,
      symbol: "NIFTY26APR24100PE",
      segment: "OPTIONS",
      tradeType: "LONG",
      status: "CLOSED",
      tags: "gap-fill,options-scalp",
      notes: "Momentum expanded faster than expected.",
      charges: 120,
      closingPrice: null,
      transactions: [
        { type: "BUY",  price: 85, quantity: 200, dateTime: new Date("2026-04-09T05:00:00.000Z") },
        { type: "SELL", price: 155, quantity: 200, dateTime: new Date("2026-04-09T06:55:00.000Z") },
      ],
    },
    {
      userId: traders[1].id,
      competitionId: springSprint.id,
      rowIndex: 4,
      symbol: "LT",
      segment: "EQUITY",
      tradeType: "LONG",
      status: "CLOSED",
      tags: "swing",
      notes: "Infrastructure sector breakout play.",
      charges: 44,
      closingPrice: null,
      transactions: [
        { type: "BUY",  price: 3570, quantity: 12, dateTime: new Date("2026-04-13T03:50:00.000Z") },
        { type: "SELL", price: 3624, quantity: 12, dateTime: new Date("2026-04-14T04:10:00.000Z") },
      ],
    },
    {
      userId: traders[1].id,
      competitionId: springSprint.id,
      rowIndex: 5,
      symbol: "HDFCBANK",
      segment: "EQUITY",
      tradeType: "LONG",
      status: "CLOSED",
      tags: "swing,fii-flow",
      notes: "FII accumulation in private banks, breakout confirmed.",
      charges: 48,
      closingPrice: null,
      transactions: [
        { type: "BUY",  price: 1780, quantity: 25, dateTime: new Date("2026-04-16T04:05:00.000Z") },
        { type: "SELL", price: 1840, quantity: 25, dateTime: new Date("2026-04-17T06:20:00.000Z") },
      ],
    },
  ];

  // ── Kabir Nair — 5 closed trades (portfolioCapital 200k) ────────────────
  // Mixed results, rank #3
  const kabirTrades: TradeSeed[] = [
    {
      userId: traders[2].id,
      competitionId: springSprint.id,
      rowIndex: 1,
      symbol: "TATAMOTORS",
      segment: "EQUITY",
      tradeType: "LONG",
      status: "CLOSED",
      tags: "momentum",
      notes: "EV theme momentum play.",
      charges: 60,
      closingPrice: null,
      transactions: [
        { type: "BUY",  price: 940, quantity: 50, dateTime: new Date("2026-04-04T03:45:00.000Z") },
        { type: "BUY",  price: 945, quantity: 25, dateTime: new Date("2026-04-04T04:00:00.000Z") },
        { type: "SELL", price: 975, quantity: 75, dateTime: new Date("2026-04-05T06:30:00.000Z") },
      ],
    },
    {
      userId: traders[2].id,
      competitionId: springSprint.id,
      rowIndex: 2,
      symbol: "WIPRO",
      segment: "INTRADAY",
      tradeType: "SHORT",
      status: "CLOSED",
      tags: "opening-drive",
      notes: "Weak open short with quick cover.",
      charges: 48,
      closingPrice: null,
      transactions: [
        { type: "SELL", price: 496, quantity: 60, dateTime: new Date("2026-04-10T03:50:00.000Z") },
        { type: "BUY",  price: 488, quantity: 60, dateTime: new Date("2026-04-10T06:45:00.000Z") },
      ],
    },
    {
      userId: traders[2].id,
      competitionId: springSprint.id,
      rowIndex: 3,
      symbol: "APOLLOHOSP",
      segment: "EQUITY",
      tradeType: "LONG",
      status: "CLOSED",
      tags: "swing,healthcare",
      notes: "Healthcare sector strength from budget allocation news.",
      charges: 62,
      closingPrice: null,
      transactions: [
        { type: "BUY",  price: 6280, quantity: 8, dateTime: new Date("2026-04-08T03:55:00.000Z") },
        { type: "SELL", price: 6460, quantity: 8, dateTime: new Date("2026-04-09T05:10:00.000Z") },
      ],
    },
    {
      userId: traders[2].id,
      competitionId: springSprint.id,
      rowIndex: 4,
      symbol: "MARUTI",
      segment: "EQUITY",
      tradeType: "SHORT",
      status: "CLOSED",
      tags: "trend-day",
      notes: "Auto sector weakness on EV headwinds.",
      charges: 58,
      closingPrice: null,
      transactions: [
        { type: "SELL", price: 12200, quantity: 3, dateTime: new Date("2026-04-11T03:50:00.000Z") },
        { type: "BUY",  price: 11900, quantity: 3, dateTime: new Date("2026-04-11T07:15:00.000Z") },
      ],
    },
    {
      userId: traders[2].id,
      competitionId: springSprint.id,
      rowIndex: 5,
      symbol: "SUNPHARMA",
      segment: "EQUITY",
      tradeType: "LONG",
      status: "CLOSED",
      tags: "swing,defensive",
      notes: "Defensive rotation into pharma on global uncertainty.",
      charges: 42,
      closingPrice: null,
      transactions: [
        { type: "BUY",  price: 1620, quantity: 40, dateTime: new Date("2026-04-14T04:10:00.000Z") },
        { type: "SELL", price: 1650, quantity: 40, dateTime: new Date("2026-04-15T06:45:00.000Z") },
      ],
    },
  ];

  const allBlueprints = [...aaravTrades, ...miraTrades, ...kabirTrades];

  for (const blueprint of allBlueprints) {
    const { transactions, ...rest } = blueprint;

    const metrics = calculateTradeMetrics({
      tradeType: blueprint.tradeType,
      status: blueprint.status,
      transactions: transactions.map((t) => ({ type: t.type, price: t.price, quantity: t.quantity })),
      charges: blueprint.charges,
    });

    const entryType = blueprint.tradeType === "LONG" ? "BUY" : "SELL";
    const entryTxns = transactions
      .filter((t) => t.type === entryType)
      .sort((a, b) => a.dateTime.getTime() - b.dateTime.getTime());
    const firstEntryAt = entryTxns.length > 0 ? entryTxns[0].dateTime : new Date();

    await prisma.trade.create({
      data: {
        ...rest,
        capitalUsed: metrics.capitalUsed,
        netPnl: metrics.realizedPnl,
        firstEntryAt,
        lockedAt: blueprint.status === "CLOSED" ? new Date() : null,
        transactions: {
          create: transactions.map((t, i) => ({
            type: t.type,
            price: t.price,
            quantity: t.quantity,
            dateTime: t.dateTime,
            order: i,
          })),
        },
      },
    });
  }

  // Summary of expected leaderboard results (approximate):
  // Mira Shah:  options scalp +13,880 net on options + other trades → ~21% return  → #1
  // Aarav Mehta: diversified momentum → ~14% return                                 → #2
  // Kabir Nair:  mixed, smaller wins  → ~9% return                                  → #3

  console.log("✅ Seed complete.");
  console.log("   Admin:   admin@stockscript.dev / Admin@12345");
  console.log("   Traders: aarav / mira / kabir @stockscript.dev / Trader@123");
  console.log("   All 3 traders have 5 qualifying closed trades in April Momentum Sprint.");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
