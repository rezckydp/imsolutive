import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { syncStockToGroup, refreshOrderItemStatuses } from "@/lib/stock-sync";

// PUT update order item quantity, note, and/or variant (color swap) — adjusts stock accordingly
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  try {
    const { id, itemId } = await params;
    const body = await request.json();
    const { qty, note, variantId: newVariantId } = body;

    // Support updating note only (without changing qty/variant)
    if (note !== undefined && qty === undefined && newVariantId === undefined) {
      const updatedItem = await db.orderItem.update({
        where: { id: itemId },
        data: { note },
        include: { variant: { include: { product: true } } },
      });
      return NextResponse.json(updatedItem);
    }

    // Find the order with items
    const order = await db.order.findUnique({
      where: { id },
      include: { orderItems: true },
    });

    if (!order) {
      return NextResponse.json(
        { error: "Order not found" },
        { status: 404 }
      );
    }

    // Find the specific order item
    const orderItem = order.orderItems.find((item) => item.id === itemId);
    if (!orderItem) {
      return NextResponse.json(
        { error: "Order item not found" },
        { status: 404 }
      );
    }

    if (orderItem.status === "In Queue") {
      return NextResponse.json(
        { error: "Item sudah di Print Queue, tidak bisa diedit dari sini. Batalkan dulu di Print Queue." },
        { status: 400 }
      );
    }

    const finalQty = qty && qty >= 1 ? qty : orderItem.qty;
    const isVariantChange = newVariantId && newVariantId !== orderItem.variantId;

    if (isVariantChange) {
      const newVariant = await db.productVariant.findUnique({ where: { id: newVariantId } });
      if (!newVariant) {
        return NextResponse.json({ error: "Varian tujuan tidak ditemukan" }, { status: 404 });
      }

      if (order.status !== "Cancelled") {
        // Restore stock to the OLD variant
        await db.productVariant.update({
          where: { id: orderItem.variantId },
          data: { qty: { increment: orderItem.qty } },
        });
        await syncStockToGroup(orderItem.variantId, orderItem.qty);

        // Deduct stock from the NEW variant
        await db.productVariant.update({
          where: { id: newVariantId },
          data: { qty: { decrement: finalQty } },
        });
        await syncStockToGroup(newVariantId, -finalQty);
      }

      const updatedItem = await db.orderItem.update({
        where: { id: itemId },
        data: {
          variantId: newVariantId,
          qty: finalQty,
          ...(note !== undefined ? { note } : {}),
        },
        include: { variant: { include: { product: true } } },
      });

      // Recalculate FIFO statuses for both the old and new variant's orders
      await refreshOrderItemStatuses(orderItem.variantId);
      await refreshOrderItemStatuses(newVariantId);

      return NextResponse.json(updatedItem);
    }

    if (!qty || qty < 1) {
      return NextResponse.json(
        { error: "Quantity must be at least 1" },
        { status: 400 }
      );
    }

    // Calculate stock difference
    const diff = orderItem.qty - qty; // positive = restore stock, negative = deduct more

    // Update variant stock (only if order is not cancelled)
    if (order.status !== "Cancelled") {
      await db.productVariant.update({
        where: { id: orderItem.variantId },
        data: { qty: { increment: diff } },
      });
      // Sync to group
      await syncStockToGroup(orderItem.variantId, diff);
    }

    // Update the order item quantity and note
    const updatedItem = await db.orderItem.update({
      where: { id: itemId },
      data: { qty, ...(note !== undefined ? { note } : {}) },
      include: {
        variant: {
          include: { product: true },
        },
      },
    });

    // Use FIFO-aware refresh to recalculate all order statuses for this variant
    await refreshOrderItemStatuses(orderItem.variantId);

    // Return the refreshed item
    const refreshedItem = await db.orderItem.findUnique({
      where: { id: itemId },
      include: {
        variant: {
          include: { product: true },
        },
      },
    });

    return NextResponse.json(refreshedItem);
  } catch (error) {
    console.error("Error updating order item:", error);
    return NextResponse.json(
      { error: "Failed to update order item" },
      { status: 500 }
    );
  }
}

// DELETE — remove a single order item from its Picking List, restoring stock.
// If this was the last item in the order, the parent order is deleted too.
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  try {
    const { id, itemId } = await params;

    const order = await db.order.findUnique({
      where: { id },
      include: { orderItems: true },
    });

    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    const orderItem = order.orderItems.find((item) => item.id === itemId);
    if (!orderItem) {
      return NextResponse.json({ error: "Order item not found" }, { status: 404 });
    }

    if (orderItem.status === "In Queue") {
      return NextResponse.json(
        { error: "Item sudah di Print Queue, batalkan dulu dari Print Queue sebelum menghapus." },
        { status: 400 }
      );
    }

    // Restore stock (unless the order was already cancelled — stock already restored then)
    if (order.status !== "Cancelled") {
      await db.productVariant.update({
        where: { id: orderItem.variantId },
        data: { qty: { increment: orderItem.qty } },
      });
      await syncStockToGroup(orderItem.variantId, orderItem.qty);
    }

    await db.orderItem.delete({ where: { id: itemId } });

    // If that was the last item in this Picking List, clean up the empty order
    const remaining = order.orderItems.length - 1;
    if (remaining <= 0) {
      await db.order.delete({ where: { id } });
    }

    await refreshOrderItemStatuses(orderItem.variantId);

    return NextResponse.json({ success: true, orderDeleted: remaining <= 0 });
  } catch (error) {
    console.error("Error deleting order item:", error);
    return NextResponse.json(
      { error: "Failed to delete order item" },
      { status: 500 }
    );
  }
}

// PATCH send order item to Print Queue (Not Ready → In Queue)
export async function PATCH(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  try {
    const { id, itemId } = await params;

    // Find the order item
    const orderItem = await db.orderItem.findUnique({
      where: { id: itemId },
      include: {
        order: true,
        variant: { include: { product: true } },
      },
    });

    if (!orderItem || orderItem.orderId !== id) {
      return NextResponse.json(
        { error: "Order item not found" },
        { status: 404 }
      );
    }

    if (orderItem.order.status === "Cancelled") {
      return NextResponse.json(
        { error: "Cannot process cancelled order" },
        { status: 400 }
      );
    }

    if (orderItem.status !== "Not Ready") {
      return NextResponse.json(
        { error: `Item status is "${orderItem.status}", only "Not Ready" items can be sent to Print Queue` },
        { status: 400 }
      );
    }

    // Create Print Queue item — carry over the note from the order item
    await db.printQueueItem.create({
      data: {
        variantId: orderItem.variantId,
        qty: orderItem.qty,
        status: "Normal",
        note: orderItem.note || "",
      },
    });

    // Update order item status to In Queue
    const updated = await db.orderItem.update({
      where: { id: itemId },
      data: { status: "In Queue" },
      include: {
        variant: { include: { product: true } },
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Error sending to print queue:", error);
    return NextResponse.json(
      { error: "Failed to send to Print Queue" },
      { status: 500 }
    );
  }
}
