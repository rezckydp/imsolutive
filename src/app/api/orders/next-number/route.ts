import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/orders/next-number?type=picking|adjustment
// Scans existing order numbers matching the prefix, finds the highest one,
// and returns the next number formatted with the same digit-padding as
// whatever's already in use (so it stays consistent with the person's own
// numbering habits rather than forcing a fixed format).
export async function GET(request: NextRequest) {
  try {
    const type = request.nextUrl.searchParams.get("type") === "adjustment" ? "adjustment" : "picking";
    const prefix = type === "adjustment" ? "ADJ" : "PICK";

    const orders = await db.order.findMany({
      where: { orderNo: { startsWith: prefix } },
      select: { orderNo: true },
    });

    // Match "PICK-000864", "PICK000864", "ADJ014", "ADJ-014", etc — prefix
    // followed by an optional dash then digits.
    const pattern = new RegExp(`^${prefix}-?(\\d+)$`, "i");

    let maxNum = 0;
    let digitWidth = type === "adjustment" ? 3 : 6; // sensible defaults if nothing exists yet
    let usesDash = type === "picking"; // PICK conventionally uses a dash, ADJ conventionally doesn't

    for (const o of orders) {
      const match = o.orderNo.trim().match(pattern);
      if (!match) continue;
      const num = parseInt(match[1], 10);
      if (num > maxNum) {
        maxNum = num;
        digitWidth = match[1].length;
        usesDash = o.orderNo.includes("-");
      }
    }

    const nextNum = maxNum + 1;
    const padded = String(nextNum).padStart(digitWidth, "0");
    const nextOrderNo = `${prefix}${usesDash ? "-" : ""}${padded}`;

    return NextResponse.json({ nextOrderNo });
  } catch (error) {
    console.error("Error computing next order number:", error);
    return NextResponse.json({ error: "Failed to compute next order number" }, { status: 500 });
  }
}
