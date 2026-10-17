import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { demoteProductionItemsToQueue } from "@/lib/stock-sync";

// PUT update production item — status is now purely "done print+QC, ready to
// be scanned into the warehouse". Completed no longer touches ProductVariant.qty
// (see ims-real-stock-scan-pipeline-spec.md §4.1) — that only happens via
// POST /api/stock/receive-scan once the physical units are actually scanned in.
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { qty, assignedTo, status } = body;

    const existing = await db.productionItem.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { error: "Production item not found" },
        { status: 404 }
      );
    }

    const item = await db.productionItem.update({
      where: { id },
      data: {
        ...(qty !== undefined && { qty }),
        ...(assignedTo !== undefined && { assignedTo }),
        ...(status !== undefined && {
          status,
          completedAt: status === "Completed" ? new Date() : null,
        }),
      },
      include: {
        variant: {
          include: { product: true },
        },
      },
    });

    return NextResponse.json(item);
  } catch (error) {
    console.error("Error updating production item:", error);
    return NextResponse.json(
      { error: "Failed to update production item" },
      { status: 500 }
    );
  }
}

// DELETE production item — with shared stock sync
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const existing = await db.productionItem.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { error: "Production item not found" },
        { status: 404 }
      );
    }

    // Already (partially) scanned into real stock — must be reconciled via
    // write-off, not deleted outright, or the scanned units it already
    // counted for would be orphaned from any production record.
    if (existing.status === "Completed" && existing.scannedQty > 0) {
      return NextResponse.json(
        { error: "Item ini sudah sebagian discan — gunakan \"Tandai Sisa Reject/Hilang\", bukan hapus." },
        { status: 400 }
      );
    }

    await db.productionItem.delete({ where: { id } });

    // This DELETE only happens via "send back to print queue" — demote order items accordingly
    await demoteProductionItemsToQueue(existing.variantId, existing.qty);

    return NextResponse.json({
      message: "Production item deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting production item:", error);
    return NextResponse.json(
      { error: "Failed to delete production item" },
      { status: 500 }
    );
  }
}
