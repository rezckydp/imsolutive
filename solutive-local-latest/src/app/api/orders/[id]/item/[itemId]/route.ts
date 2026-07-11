import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { syncStockToGroup, refreshOrderItemStatuses } from "@/lib/stock-sync";

// PUT update order item quantity — adjusts stock difference
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  try {
    const { id, itemId } = await params;
    const body = await request.json();
    const { qty, note } = body;

    // Support updating note only (without changing qty)
    if (note !== undefined && qty === undefined) {
      const updatedItem = await db.orderItem.update({
        where: { id: itemId },
        data: { note },
        include: { variant: { include: { product: true } } },
      });
      return NextResponse.json(updatedItem);
    }

    if (!qty || qty < 1) {
      return NextResponse.json(
        { error: "Quantity must be at least 1" },
        { status: 400 }
      );
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
