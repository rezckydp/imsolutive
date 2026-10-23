import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/current-user";
import { findMaterialByBarcode } from "@/lib/material-barcode";

// POST /api/materials/scan-io — Scan Material's Input(+)/Output(-) step for
// an already-known barcode. Logs to Riwayat Ambil Material with a source
// that names the transaction type explicitly (the generic "Manual" source
// used by direct field edits doesn't distinguish Input vs Output).
export async function POST(request: NextRequest) {
  const user = getCurrentUser(request);
  try {
    const body = await request.json();
    const code = (body.code || "").toString().trim();
    const direction: "in" | "out" = body.direction === "out" ? "out" : "in";
    const qty = Math.abs(parseInt(body.qty, 10) || 0);

    if (!code || qty <= 0) {
      return NextResponse.json({ error: "code dan qty (lebih dari 0) wajib diisi" }, { status: 400 });
    }

    const match = await findMaterialByBarcode(code);
    if (!match) {
      return NextResponse.json({ error: "Barcode tidak dikenal" }, { status: 404 });
    }

    const delta = direction === "in" ? qty : -qty;
    const source = direction === "in" ? "Scan Material - Input" : "Scan Material - Output";

    if (match.kind === "variant") {
      const updated = await db.materialVariant.update({
        where: { id: match.variant.id },
        data: { stock: { increment: delta } },
      });
      await db.materialMovement.create({
        data: {
          materialId: match.material.id,
          materialVariantId: match.variant.id,
          qty: delta,
          source,
          username: user?.username ?? "unknown",
          productLabel: `${match.material.name} - ${match.variant.label}`,
        },
      });
      return NextResponse.json({
        name: `${match.material.name} — ${match.variant.label}`,
        stock: updated.stock,
        unit: match.material.unit,
      });
    }

    const updated = await db.material.update({
      where: { id: match.material.id },
      data: { stock: { increment: delta } },
    });
    await db.materialMovement.create({
      data: {
        materialId: match.material.id,
        qty: delta,
        source,
        username: user?.username ?? "unknown",
        productLabel: match.material.name,
      },
    });
    return NextResponse.json({
      name: match.material.name,
      stock: updated.stock ?? 0,
      unit: match.material.unit,
    });
  } catch (error) {
    console.error("Error processing scan-io:", error);
    return NextResponse.json({ error: "Gagal memproses transaksi" }, { status: 500 });
  }
}
