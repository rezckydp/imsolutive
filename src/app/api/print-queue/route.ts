import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { syncOrderItemsToQueue } from "@/lib/stock-sync";

// GET all print queue items with variant → product
export async function GET() {
  try {
    const items = await db.printQueueItem.findMany({
      include: {
        variant: {
          include: { product: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(items);
  } catch (error) {
    console.error("Error fetching print queue:", error);
    return NextResponse.json(
      { error: "Failed to fetch print queue" },
      { status: 500 }
    );
  }
}

// POST add item to print queue
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { variantId, qty, status, note } = body;

    if (!variantId) {
      return NextResponse.json(
        { error: "variantId is required" },
        { status: 400 }
      );
    }

    // Validate variant exists
    const variant = await db.productVariant.findUnique({
      where: { id: variantId },
    });
    if (!variant) {
      return NextResponse.json(
        { error: "Variant not found" },
        { status: 404 }
      );
    }

    const validStatuses = ["Priority", "Normal", "Urgent"];
    const itemStatus = status || "Normal";
    if (!validStatuses.includes(itemStatus)) {
      return NextResponse.json(
        { error: `Invalid status. Must be one of: ${validStatuses.join(", ")}` },
        { status: 400 }
      );
    }

    const item = await db.printQueueItem.create({
      data: {
        variantId,
        qty: qty || 1,
        status: itemStatus,
        note: note || "",
      },
      include: {
        variant: {
          include: { product: true },
        },
      },
    });

    // Reflect this in Recent Order — mark matching Not Ready orders as In Queue
    await syncOrderItemsToQueue(variantId, qty || 1);

    return NextResponse.json(item, { status: 201 });
  } catch (error) {
    console.error("Error creating print queue item:", error);
    return NextResponse.json(
      { error: "Failed to create print queue item" },
      { status: 500 }
    );
  }
}
