import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// DELETE a specific item from a stock opname session, then recalculate session totals
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  try {
    const { id, itemId } = await params;

    // Verify the session exists
    const session = await db.stockOpname.findUnique({ where: { id } });
    if (!session) {
      return NextResponse.json(
        { error: "Stock opname session not found" },
        { status: 404 }
      );
    }

    // Verify the item exists and belongs to this session
    const item = await db.stockOpnameItem.findUnique({
      where: { id: itemId },
    });

    if (!item || item.opnameId !== id) {
      return NextResponse.json(
        { error: "Stock opname item not found" },
        { status: 404 }
      );
    }

    // Delete the item
    await db.stockOpnameItem.delete({ where: { id: itemId } });

    // Recalculate session totals
    const remainingItems = await db.stockOpnameItem.findMany({
      where: { opnameId: id },
    });

    const totalItems = remainingItems.length;
    const totalDiff = remainingItems.reduce((sum, i) => sum + i.difference, 0);

    await db.stockOpname.update({
      where: { id },
      data: {
        totalItems,
        totalDiff,
      },
    });

    return NextResponse.json({
      message: "Item deleted successfully",
      totalItems,
      totalDiff,
    });
  } catch (error) {
    console.error("Error deleting stock opname item:", error);
    return NextResponse.json(
      { error: "Failed to delete stock opname item" },
      { status: 500 }
    );
  }
}
