import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET active Add-Ons shaped for the /pos client — which products each one
// is eligible on, so the cart can show "+ Engrave" only where it applies.
// Checkout independently re-validates eligibility/maxLength server-side —
// this only feeds the UI, same pattern as /api/bundle/config.
export async function GET() {
  try {
    const addOns = await db.addOn.findMany({
      where: { active: true },
      include: { eligibleProducts: { select: { productId: true } } },
      orderBy: { name: "asc" },
    });

    return NextResponse.json({
      addOns: addOns.map((a) => ({
        id: a.id,
        code: a.code,
        name: a.name,
        price: a.price,
        inputType: a.inputType,
        maxLength: a.maxLength,
        productIds: a.eligibleProducts.map((ep) => ep.productId),
      })),
    });
  } catch (error) {
    console.error("Error loading add-on config:", error);
    return NextResponse.json({ error: "Failed to load add-on config" }, { status: 500 });
  }
}
