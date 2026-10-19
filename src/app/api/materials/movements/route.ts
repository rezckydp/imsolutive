import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET Riwayat Ambil Material — every stock movement, newest first.
export async function GET() {
  try {
    const movements = await db.materialMovement.findMany({
      include: { materialVariant: { include: { material: true } } },
      orderBy: { createdAt: "desc" },
      take: 500,
    });

    return NextResponse.json({
      movements: movements.map((m) => ({
        id: m.id,
        createdAt: m.createdAt,
        materialName: m.materialVariant.material.name,
        variantLabel: m.materialVariant.label,
        unit: m.materialVariant.material.unit,
        qty: m.qty,
        source: m.source,
        username: m.username,
        productLabel: m.productLabel,
      })),
    });
  } catch (error) {
    console.error("Error fetching material movements:", error);
    return NextResponse.json({ error: "Failed to fetch movements" }, { status: 500 });
  }
}
