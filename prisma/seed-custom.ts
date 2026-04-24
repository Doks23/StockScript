import { PrismaClient } from "@prisma/client";
import { calculateTradeMetrics } from "../lib/trade-utils";

const prisma = new PrismaClient();

async function main() {
  const trader = await prisma.user.findFirst({ where: { role: "ADMIN" } }) 
              || await prisma.user.findFirst();

  if (!trader) {
    throw new Error("No user found to attach trades to.");
  }

  await prisma.trade.deleteMany();

  const customTrades = [
    {
      symbol: "GODREJP",
      segment: "EQUITY" as const,
      tradeType: "LONG" as const,
      entryTime1: new Date("2023-10-09T04:00:00Z"),
      entryPrice1: 1638,
      entryQty1: 2,
      stopLoss: 1523,
      exitTime1: new Date("2023-10-23T04:00:00Z"),
      exitPrice1: 1857.00,
      exitQty1: 2,
      status: "CLOSED" as const,
      tags: "PB",
    },
    {
      symbol: "OIL",
      segment: "EQUITY" as const,
      tradeType: "LONG" as const,
      entryTime1: new Date("2023-10-10T04:00:00Z"),
      entryPrice1: 272,
      entryQty1: 25,
      stopLoss: 255,
      exitTime1: new Date("2023-10-26T04:00:00Z"),
      exitPrice1: 298.00,
      exitQty1: 25,
      status: "CLOSED" as const,
      tags: "BO",
    },
    {
      symbol: "CENTURY",
      segment: "EQUITY" as const,
      tradeType: "LONG" as const,
      entryTime1: new Date("2023-10-10T04:00:00Z"),
      entryPrice1: 1134,
      entryQty1: 3,
      stopLoss: 1061,
      exitTime1: new Date("2023-10-20T04:00:00Z"),
      exitPrice1: 1061.00,
      exitQty1: 3,
      status: "CLOSED" as const,
      tags: "PB",
    },
    {
      symbol: "HSCL",
      segment: "EQUITY" as const,
      tradeType: "LONG" as const,
      entryTime1: new Date("2023-11-21T04:00:00Z"),
      entryPrice1: 265,
      entryQty1: 20,
      stopLoss: 248,
      exitTime1: new Date("2023-12-06T04:00:00Z"),
      exitPrice1: 301.00,
      exitQty1: 7,
      exitTime2: new Date("2023-12-13T04:00:00Z"),
      exitPrice2: 290.15,
      exitQty2: 13,
      status: "CLOSED" as const,
      tags: "BO",
    },
    {
      symbol: "TITAGARH",
      segment: "EQUITY" as const,
      tradeType: "LONG" as const,
      entryTime1: new Date("2023-12-01T04:00:00Z"),
      entryPrice1: 959,
      entryQty1: 22,
      stopLoss: 903,
      exitTime1: new Date("2023-12-07T04:00:00Z"),
      exitPrice1: 990.00,
      exitQty1: 15,
      exitTime2: new Date("2023-12-11T04:00:00Z"),
      exitPrice2: 1156.00,
      exitQty2: 7,
      status: "CLOSED" as const,
      tags: "PB",
    },
    {
      symbol: "TEXRAIL",
      segment: "EQUITY" as const,
      tradeType: "LONG" as const,
      entryTime1: new Date("2023-12-04T04:00:00Z"),
      entryPrice1: 149,
      entryQty1: 120,
      stopLoss: 144,
      exitTime1: new Date("2023-12-12T04:00:00Z"),
      exitPrice1: 162.50,
      exitQty1: 40,
      exitTime2: new Date("2023-12-21T04:00:00Z"),
      exitPrice2: 163.50, 
      exitQty2: 80,
      status: "CLOSED" as const,
      tags: "BO",
    },
    {
      symbol: "SWANENE",
      segment: "EQUITY" as const,
      tradeType: "LONG" as const,
      entryTime1: new Date("2023-12-04T04:00:00Z"),
      entryPrice1: 442,
      entryQty1: 30,
      stopLoss: 416,
      exitTime1: new Date("2024-01-01T04:00:00Z"),
      exitPrice1: 546.85,
      exitQty1: 15,
      exitTime2: new Date("2024-03-12T04:00:00Z"),
      exitPrice2: 555.70,
      exitQty2: 15,
      status: "CLOSED" as const,
      tags: "PB",
    },
    {
      symbol: "NEWGEN",
      segment: "EQUITY" as const,
      tradeType: "LONG" as const,
      entryTime1: new Date("2023-12-22T04:00:00Z"),
      entryPrice1: 715,
      entryQty1: 16,
      stopLoss: 692.5,
      exitTime1: new Date("2024-01-12T04:00:00Z"),
      exitPrice1: 774.90,
      exitQty1: 8,
      exitTime2: new Date("2024-02-09T04:00:00Z"),
      exitPrice2: 815.00,
      exitQty2: 8,
      status: "CLOSED" as const,
      tags: "BO",
    }
  ];

  let rowIndex = 1;
  for (const trade of customTrades) {
    const metrics = calculateTradeMetrics(trade as any);

    await prisma.trade.create({
      data: {
        userId: trader.id,
        competitionId: null,
        rowIndex: rowIndex++,
        ...trade,
        capitalUsed: metrics.capitalUsed,
        netPnl: metrics.realizedPnl,
        lockedAt: trade.status === "CLOSED" ? new Date() : null,
      },
    });
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
    console.log("Successfully seeded image trades.");
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
