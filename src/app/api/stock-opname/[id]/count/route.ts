import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// POST count/scan an item — accept { variantId, actualQty }
// Looks up variant's current qty as systemQty, calculates difference, upserts item, recalculates session totals
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { variantId, actualQty } = body;

    if (!variantId) {
      return NextResponse.json(
        { error: "variantId is required" },
        { status: 400 }
      );
    }

    if (actualQty === undefined || actualQty === null) {
      return NextResponse.json(
        { error: "actualQty is required" },
        { status: 400 }
      );
    }

    // Verify the session exists
    const session = await db.stockOpname.findUnique({
      where: { id },
      include: { items: true },
    });

    if (!session) {
      return NextResponse.json(
        { error: "Stock opname session not found" },
        { status: 404 }
      );
    }

    if (session.status !== "In Progress") {
      return NextResponse.json(
        { error: "Session is not in progress" },
        { status: 400 }
      );
    }

    // Look up variant's current qty as systemQty
    const variant = await db.productVariant.findUnique({
      where: { id: variantId },
      include: { product: true },
    });

    if (!variant) {
      return NextResponse.json(
        { error: "Product variant not found" },
        { status: 404 }
      );
    }

    const systemQty = variant.qty;
    const difference = actualQty - systemQty;

    // Check if an item with this variantId already exists in this session (upsert)
    const existingItem = session.items.find((item) => item.variantId === variantId);

    let item;
    if (existingItem) {
      item = await db.stockOpnameItem.update({
        where: { id: existingItem.id },
        data: {
          systemQty,
          actualQty,
          difference,
          adjusted: false,
        },
        include: {
          variant: {
            include: { product: true },
          },
        },
      });
    } else {
      item = await db.stockOpnameItem.create({
        data: {
          opnameId: id,
          variantId,
          systemQty,
          actualQty,
          difference,
        },
        include: {
          variant: {
            include: { product: true },
          },
        },
      });
    }

    // Recalculate session totals
    const allItems = await db.stockOpnameItem.findMany({
      where: { opnameId: id },
    });

    const totalItems = allItems.length;
    const totalDiff = allItems.reduce((sum, i) => sum + i.difference, 0);

    await db.stockOpname.update({
      where: { id },
      data: {
        totalItems,
        totalDiff,
      },
    });

    return NextResponse.json(item, { status: existingItem ? 200 : 201 });
  } catch (error) {
    console.error("Error counting stock opname item:", error);
    return NextResponse.json(
      { error: "Failed to count stock opname item" },
      { status: 500 }
    );
  }
}
