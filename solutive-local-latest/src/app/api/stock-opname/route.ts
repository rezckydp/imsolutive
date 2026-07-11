import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET all stock opname sessions ordered by createdAt desc, include _count of items
export async function GET() {
  try {
    const sessions = await db.stockOpname.findMany({
      include: {
        _count: {
          select: { items: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(sessions);
  } catch (error) {
    console.error("Error fetching stock opname sessions:", error);
    return NextResponse.json(
      { error: "Failed to fetch stock opname sessions" },
      { status: 500 }
    );
  }
}

// POST create a new stock opname session with auto-generated sessionNo (SO-001, SO-002, ...)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { type, notes } = body;

    if (!type || !["Full", "Partial"].includes(type)) {
      return NextResponse.json(
        { error: "Type must be 'Full' or 'Partial'" },
        { status: 400 }
      );
    }

    // Find the latest session by sessionNo prefix "SO-" to auto-increment
    const latestSession = await db.stockOpname.findFirst({
      where: {
        sessionNo: { startsWith: "SO-" },
      },
      orderBy: { sessionNo: "desc" },
      select: { sessionNo: true },
    });

    let nextNumber = 1;
    if (latestSession) {
      const match = latestSession.sessionNo.match(/^SO-(\d+)$/);
      if (match) {
        nextNumber = parseInt(match[1], 10) + 1;
      }
    }

    const sessionNo = `SO-${String(nextNumber).padStart(3, "0")}`;

    const session = await db.stockOpname.create({
      data: {
        sessionNo,
        type,
        notes: notes || "",
        startedAt: new Date(),
      },
    });

    return NextResponse.json(session, { status: 201 });
  } catch (error) {
    console.error("Error creating stock opname session:", error);
    return NextResponse.json(
      { error: "Failed to create stock opname session" },
      { status: 500 }
    );
  }
}
