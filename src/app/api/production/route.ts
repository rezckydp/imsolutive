import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { syncStockToGroup } from "@/lib/stock-sync";

// GET all production items with variant → product
export async function GET() {
  try {
    const items = await db.productionItem.findMany({
      include: {
        variant: {
          include: { product: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(items);
  } catch (error) {
    console.error("Error fetching production items:", error);
    return NextResponse.json(
      { error: "Failed to fetch production items" },
      { status: 500 }
    );
  }
}

// POST create a new production item
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { variantId, qty, assignedTo, note } = body;

    if (!variantId) {
      return NextResponse.json(
        { error: "variantId is required" },
        { status: 400 }
      );
    }

    if (!qty || qty <= 0) {
      return NextResponse.json(
        { error: "qty must be greater than 0" },
        { status: 400 }
      );
    }

    // Verify variant exists
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

    // Countdown auto-complete (ims-feature-production-countdown-autocomplete.md)
    // — only set when the product has a per-pcs print duration configured;
    // null keeps the row exactly as before (manual "Mark Completed" only).
    const estPerPcs = variant.product.estPrintMinutes;
    const scheduledDoneAt = estPerPcs != null ? new Date(Date.now() + estPerPcs * qty * 60_000) : null;

    const item = await db.productionItem.create({
      data: {
        variantId,
        qty,
        assignedTo: assignedTo || "",
        note: note || "",
        scheduledDoneAt,
      },
      include: {
        variant: {
          include: { product: true },
        },
      },
    });

    return NextResponse.json(item, { status: 201 });
  } catch (error) {
    console.error("Error creating production item:", error);
    return NextResponse.json(
      { error: "Failed to create production item" },
      { status: 500 }
    );
  }
}
