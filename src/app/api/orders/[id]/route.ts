import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { syncStockToGroup } from "@/lib/stock-sync";

// GET single order by ID
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const order = await db.order.findUnique({
      where: { id },
      include: {
        orderItems: {
          include: {
            variant: {
              include: { product: true },
            },
          },
        },
      },
    });

    if (!order) {
      return NextResponse.json(
        { error: "Order not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(order);
  } catch (error) {
    console.error("Error fetching order:", error);
    return NextResponse.json(
      { error: "Failed to fetch order" },
      { status: 500 }
    );
  }
}

// PUT update order status — with shared stock sync on cancel/uncancel
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { status, orderNo } = body;

    const existing = await db.order.findUnique({
      where: { id },
      include: { orderItems: true },
    });
    if (!existing) {
      return NextResponse.json(
        { error: "Order not found" },
        { status: 404 }
      );
    }

    const validStatuses = ["Pending", "Processing", "Completed", "Cancelled"];
    if (status && !validStatuses.includes(status)) {
      return NextResponse.json(
        { error: `Invalid status. Must be one of: ${validStatuses.join(", ")}` },
        { status: 400 }
      );
    }

    // Restore stock when order is cancelled + sync to group
    if (status === "Cancelled" && existing.status !== "Cancelled") {
      for (const item of existing.orderItems) {
        await db.productVariant.update({
          where: { id: item.variantId },
          data: { qty: { increment: item.qty } },
        });
        await syncStockToGroup(item.variantId, item.qty);
      }
    }

    // Re-deduct stock if cancelled order is changed back to non-cancelled + sync to group
    if (existing.status === "Cancelled" && status && status !== "Cancelled") {
      for (const item of existing.orderItems) {
        await db.productVariant.update({
          where: { id: item.variantId },
          data: { qty: { decrement: item.qty } },
        });
        await syncStockToGroup(item.variantId, -item.qty);
      }
    }

    const order = await db.order.update({
      where: { id },
      data: {
        ...(status && { status }),
        ...(orderNo && { orderNo }),
      },
      include: {
        orderItems: {
          include: {
            variant: {
              include: { product: true },
            },
          },
        },
      },
    });

    return NextResponse.json(order);
  } catch (error) {
    console.error("Error updating order:", error);
    return NextResponse.json(
      { error: "Failed to update order" },
      { status: 500 }
    );
  }
}

// DELETE order — with shared stock restore
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const existing = await db.order.findUnique({
      where: { id },
      include: { orderItems: true },
    });
    if (!existing) {
      return NextResponse.json(
        { error: "Order not found" },
        { status: 404 }
      );
    }

    // Restore stock for each order item (unless order was already cancelled) + sync to group
    if (existing.status !== "Cancelled") {
      for (const item of existing.orderItems) {
        await db.productVariant.update({
          where: { id: item.variantId },
          data: { qty: { increment: item.qty } },
        });
        await syncStockToGroup(item.variantId, item.qty);
      }
    }

    await db.order.delete({ where: { id } });

    return NextResponse.json({ message: "Order deleted successfully" });
  } catch (error) {
    console.error("Error deleting order:", error);
    return NextResponse.json(
      { error: "Failed to delete order" },
      { status: 500 }
    );
  }
}
