import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/dashboard/orders-count?from=ISO&to=ISO
// No from/to → total order count all-time (same as the default dashboard summary).
export async function GET(request: NextRequest) {
  try {
    const from = request.nextUrl.searchParams.get("from");
    const to = request.nextUrl.searchParams.get("to");

    const where =
      from && to
        ? {
            createdAt: {
              gte: new Date(from),
              lte: new Date(new Date(to).setHours(23, 59, 59, 999)),
            },
          }
        : {};

    const count = await db.order.count({ where });

    return NextResponse.json({ count });
  } catch (error) {
    console.error("Error counting orders:", error);
    return NextResponse.json({ error: "Failed to count orders" }, { status: 500 });
  }
}
