import { NextResponse } from "next/server";
import { requireActiveUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { uploadTradeImage } from "@/lib/storage";

export async function POST(request: Request) {
  try {
    const user = await requireActiveUser();
    const formData = await request.formData();
    const tradeId = String(formData.get("tradeId") || "");
    const files = formData.getAll("files").filter((file): file is File => file instanceof File);

    if (!tradeId || !files.length) {
      return NextResponse.json(
        { error: "tradeId and at least one file are required." },
        { status: 400 },
      );
    }

    const trade = await prisma.trade.findUnique({
      where: {
        id: tradeId,
      },
    });

    if (!trade || (trade.userId !== user.id && user.role !== "ADMIN")) {
      return NextResponse.json({ error: "Trade not found." }, { status: 404 });
    }

    const uploads = await Promise.all(
      files.map(async (file) => {
        const imageUrl = await uploadTradeImage(file);

        return prisma.tradeImage.create({
          data: {
            tradeId,
            imageUrl,
          },
        });
      }),
    );

    return NextResponse.json({ images: uploads }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to upload chart image.",
      },
      { status: 400 },
    );
  }
}
