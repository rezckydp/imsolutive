import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { syncStockToGroup, refreshOrderItemStatuses, getGroupVariantIds, demoteProductionItemsToQueue } from "@/lib/stock-sync";

// PUT update production item — with shared stock sync on complete/revert
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

    // Handle status change to Completed → add stock + sync to group + refresh order statuses
    if (status === "Completed" && existing.status !== "Completed") {
      await db.productVariant.update({
        where: { id: existing.variantId },
        data: { qty: { increment: existing.qty } },
      });
      await syncStockToGroup(existing.variantId, existing.qty);
      // Refresh order statuses for ALL variants in the group (not just this one)
      const variant = await db.productVariant.findUnique({
        where: { id: existing.variantId },
        select: { productId: true },
      });
      if (variant) {
        const groupVariantIds = await getGroupVariantIds(variant.productId);
        for (const vid of groupVariantIds) {
          await refreshOrderItemStatuses(vid);
        }
      }
    }

    // Handle status change from Completed back to In Progress → remove stock + sync to group + refresh
    if (existing.status === "Completed" && status === "In Progress") {
      await db.productVariant.update({
        where: { id: existing.variantId },
        data: { qty: { decrement: existing.qty } },
      });
      await syncStockToGroup(existing.variantId, -existing.qty);
      // Refresh order statuses for ALL variants in the group
      const variant = await db.productVariant.findUnique({
        where: { id: existing.variantId },
        select: { productId: true },
      });
      if (variant) {
        const groupVariantIds = await getGroupVariantIds(variant.productId);
        for (const vid of groupVariantIds) {
          await refreshOrderItemStatuses(vid);
        }
      }
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

    // If completed, remove the added stock before deleting + sync to group
    if (existing.status === "Completed") {
      await db.productVariant.update({
        where: { id: existing.variantId },
        data: { qty: { decrement: existing.qty } },
      });
      await syncStockToGroup(existing.variantId, -existing.qty);
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
