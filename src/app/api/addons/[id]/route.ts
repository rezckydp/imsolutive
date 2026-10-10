import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

const ADDON_INCLUDE = {
  eligibleProducts: { include: { product: { select: { id: true, sku: true, name: true } } } },
} as const;

// PATCH update an Add-On's fields (not product eligibility — see
// /api/addons/[id]/products for that)
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { code, name, price, inputType, maxLength, active } = body;

    const existing = await db.addOn.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Add-on tidak ditemukan" }, { status: 404 });
    }

    const data: Record<string, unknown> = {};
    if (code !== undefined) {
      const normalizedCode = String(code).trim().toUpperCase();
      if (!normalizedCode) return NextResponse.json({ error: "Kode add-on wajib diisi" }, { status: 400 });
      if (normalizedCode !== existing.code) {
        const dup = await db.addOn.findUnique({ where: { code: normalizedCode } });
        if (dup) return NextResponse.json({ error: `Kode "${normalizedCode}" sudah dipakai add-on lain` }, { status: 409 });
      }
      data.code = normalizedCode;
    }
    if (name !== undefined) {
      if (!String(name).trim()) return NextResponse.json({ error: "Nama add-on wajib diisi" }, { status: 400 });
      data.name = String(name).trim();
    }
    if (price !== undefined) {
      if (price == null || isNaN(Number(price)) || Number(price) < 0) {
        return NextResponse.json({ error: "Harga add-on harus diisi angka >= 0" }, { status: 400 });
      }
      data.price = Math.round(Number(price));
    }
    if (inputType !== undefined || maxLength !== undefined) {
      const nextInputType = inputType !== undefined ? (inputType === "TEXT" ? "TEXT" : "NONE") : existing.inputType;
      const nextMaxLength = maxLength !== undefined ? maxLength : existing.maxLength;
      if (nextInputType === "TEXT" && (nextMaxLength == null || isNaN(Number(nextMaxLength)) || Number(nextMaxLength) < 1)) {
        return NextResponse.json({ error: "Add-on tipe teks butuh maxLength >= 1" }, { status: 400 });
      }
      data.inputType = nextInputType;
      data.maxLength = nextInputType === "TEXT" ? Math.round(Number(nextMaxLength)) : null;
    }
    if (active !== undefined) {
      data.active = !!active;
    }

    const updated = await db.addOn.update({ where: { id }, data, include: ADDON_INCLUDE });
    return NextResponse.json(updated);
  } catch (error) {
    console.error("Error updating add-on:", error);
    return NextResponse.json({ error: "Failed to update add-on" }, { status: 500 });
  }
}

// DELETE an Add-On — refuses if it's already attached to any transaction
// (that history must keep its priceSnapshot/value intact forever); turn it
// off (active: false) instead if it just shouldn't be offered anymore.
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const addOn = await db.addOn.findUnique({
      where: { id },
      include: { orderItemAddOns: { select: { id: true }, take: 1 } },
    });
    if (!addOn) {
      return NextResponse.json({ error: "Add-on tidak ditemukan" }, { status: 404 });
    }
    if (addOn.orderItemAddOns.length > 0) {
      return NextResponse.json(
        { error: "Add-on ini udah kepakai di transaksi — nonaktifkan aja (toggle Aktif) biar histori tetap utuh" },
        { status: 409 }
      );
    }

    await db.addOn.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting add-on:", error);
    return NextResponse.json({ error: "Failed to delete add-on" }, { status: 500 });
  }
}
