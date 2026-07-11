import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { refreshOrderItemStatuses, refreshAllOrderStatuses } from "@/lib/stock-sync";

// POST adjust stock — for all non-adjusted items, set variant qty to actualQty, mark adjusted
// Then call refreshOrderItemStatuses for each adjusted variant and complete the session
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Verify the session exists and is in progress
    const session = await db.stockOpname.findUnique({
      where: { id },
      include: {
        items: {
          where: { adjusted: false },
          include: {
            variant: true,
          },
        },
      },
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

    if (session.items.length === 0) {
      return NextResponse.json(
        { error: "No items to adjust" },
        { status: 400 }
      );
    }

    // For each non-adjusted item: update ProductVariant qty to actualQty, set adjusted=true
    const adjustedVariantIds: string[] = [];
    for (const item of session.items) {
      await db.productVariant.update({
        where: { id: item.variantId },
        data: { qty: item.actualQty },
      });

      await db.stockOpnameItem.update({
        where: { id: item.id },
        data: { adjusted: true },
      });

      adjustedVariantIds.push(item.variantId);
    }

    // After updating stock, refresh order item statuses for each adjusted variant
    for (const variantId of adjustedVariantIds) {
      await refreshOrderItemStatuses(variantId);
    }

    // Also do a full refresh to catch any group-synced variants
    await refreshAllOrderStatuses();

    // Recalculate session totalDiff (should be 0 after adjust, but recalc for correctness)
    const allItems = await db.stockOpnameItem.findMany({
      where: { opnameId: id },
    });
    const totalDiff = allItems.reduce((sum, i) => sum + i.difference, 0);

    // Set session status to "Completed" and completedAt to now
    const updatedSession = await db.stockOpname.update({
      where: { id },
      data: {
        totalDiff,
        status: "Completed",
        completedAt: new Date(),
      },
    });

    return NextResponse.json({
      session: updatedSession,
      adjustedCount: session.items.length,
    });
  } catch (error) {
    console.error("Error adjusting stock opname:", error);
    return NextResponse.json(
      { error: "Failed to adjust stock opname" },
      { status: 500 }
    );
  }
}
