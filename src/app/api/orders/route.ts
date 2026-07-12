import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { syncStockToGroup } from "@/lib/stock-sync";

// GET all orders with items → variant → product
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const status = searchParams.get("status");
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "20", 10);
    const month = searchParams.get("month");

    const where: Record<string, unknown> = {};
    if (status) {
      where.status = status;
    }
    if (month) {
      // Filter by month (format: YYYY-MM)
      const startDate = new Date(`${month}-01T00:00:00.000Z`);
      const endDate = new Date(startDate);
      endDate.setMonth(endDate.getMonth() + 1);
      where.createdAt = {
        gte: startDate,
        lt: endDate,
      };
    }

    const skip = (page - 1) * limit;

    const [orders, total] = await Promise.all([
      db.order.findMany({
        where: Object.keys(where).length > 0 ? where : undefined,
        include: {
          orderItems: {
            include: {
              variant: {
                include: { product: true },
              },
            },
          },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      db.order.count({
        where: Object.keys(where).length > 0 ? where : undefined,
      }),
    ]);

    return NextResponse.json({
      orders,
      total,
      page,
      limit,
    });
  } catch (error) {
    console.error("Error fetching orders:", error);
    return NextResponse.json(
      { error: "Failed to fetch orders" },
      { status: 500 }
    );
  }
}

// POST create new order with order items (variantId) — with shared stock sync
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { orderNo, status, items } = body;

    if (!orderNo) {
      return NextResponse.json(
        { error: "Order number is required" },
        { status: 400 }
      );
    }

    // Check if order number already exists
    const existing = await db.order.findUnique({ where: { orderNo } });
    if (existing) {
      return NextResponse.json(
        { error: "Order with this number already exists" },
        { status: 409 }
      );
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { error: "At least one order item is required" },
        { status: 400 }
      );
    }

    // Validate all variants exist and pre-read stock for status check
    const variantStocks: Record<string, number> = {};
    for (const item of items) {
      if (!item.variantId) {
        return NextResponse.json(
          { error: "Each order item must have a variantId" },
          { status: 400 }
        );
      }
      const variant = await db.productVariant.findUnique({
        where: { id: item.variantId },
      });
      if (!variant) {
        return NextResponse.json(
          { error: `Variant with id ${item.variantId} not found` },
          { status: 404 }
        );
      }
      variantStocks[item.variantId] = variant.qty;
    }

    // Deduct stock for each order item (allow negative stock) + sync to group
    for (const item of items) {
      const qty = item.qty || 1;

      // Deduct from the ordered variant itself
      await db.productVariant.update({
        where: { id: item.variantId },
        data: { qty: { decrement: qty } },
      });

      // Sync the deduction to all sibling variants in the same group
      await syncStockToGroup(item.variantId, -qty);
    }

    const order = await db.order.create({
      data: {
        orderNo,
        status: status || "Pending",
        orderItems: {
          create: items.map(
            (item: { variantId: string; qty: number; note?: string }) => {
              const qty = item.qty || 1;
              const stockBefore = variantStocks[item.variantId];
              const stockAfter = stockBefore - qty;
              return {
                variantId: item.variantId,
                qty,
                note: item.note || "",
                status: stockAfter >= 0 ? "Ready" : "Not Ready",
              };
            }
          ),
        },
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

    return NextResponse.json(order, { status: 201 });
  } catch (error) {
    console.error("Error creating order:", error);
    return NextResponse.json(
      { error: "Failed to create order" },
      { status: 500 }
    );
  }
}
