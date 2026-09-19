import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/pos/history?from=ISO&to=ISO&search=POS-000001
// Lists POS transactions (prefix "POS") plus a summary for the filtered
// period — total omzet, transaction count, Cash vs QRIS breakdown. No
// pagination in v1: booth-scale transaction volume, and the summary needs
// the full filtered set anyway.
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const search = searchParams.get("search")?.trim();

    const where: Record<string, unknown> = {
      orderNo: search ? { startsWith: "POS", contains: search.toUpperCase() } : { startsWith: "POS" },
    };
    if (from && to) {
      where.createdAt = {
        gte: new Date(from),
        lte: new Date(new Date(to).setHours(23, 59, 59, 999)),
      };
    }

    const orders = await db.order.findMany({
      where,
      include: {
        orderItems: {
          include: { variant: { include: { product: true } } },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const summary = {
      totalOmzet: 0,
      transactionCount: orders.length,
      cashCount: 0,
      cashTotal: 0,
      qrisCount: 0,
      qrisTotal: 0,
    };
    for (const o of orders) {
      const amount = o.totalAmount || 0;
      summary.totalOmzet += amount;
      if (o.paymentMethod === "Cash") {
        summary.cashCount += 1;
        summary.cashTotal += amount;
      } else if (o.paymentMethod === "QRIS") {
        summary.qrisCount += 1;
        summary.qrisTotal += amount;
      }
    }

    return NextResponse.json({ orders, summary });
  } catch (error) {
    console.error("Error fetching POS history:", error);
    return NextResponse.json({ error: "Failed to fetch POS history" }, { status: 500 });
  }
}
