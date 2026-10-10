import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

const ADDON_INCLUDE = {
  eligibleProducts: { include: { product: { select: { id: true, sku: true, name: true } } } },
} as const;

// GET all Add-Ons with their eligible products (admin panel listing)
export async function GET() {
  try {
    const addOns = await db.addOn.findMany({
      include: ADDON_INCLUDE,
      orderBy: { name: "asc" },
    });
    return NextResponse.json({ addOns });
  } catch (error) {
    console.error("Error fetching add-ons:", error);
    return NextResponse.json({ error: "Failed to fetch add-ons" }, { status: 500 });
  }
}

// POST create a new Add-On
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { code, name, price, inputType, maxLength, active } = body;

    if (!code || !String(code).trim()) {
      return NextResponse.json({ error: "Kode add-on wajib diisi" }, { status: 400 });
    }
    if (!name || !String(name).trim()) {
      return NextResponse.json({ error: "Nama add-on wajib diisi" }, { status: 400 });
    }
    if (price == null || isNaN(Number(price)) || Number(price) < 0) {
      return NextResponse.json({ error: "Harga add-on harus diisi angka >= 0" }, { status: 400 });
    }
    const normalizedInputType = inputType === "TEXT" ? "TEXT" : "NONE";
    if (normalizedInputType === "TEXT" && (maxLength == null || isNaN(Number(maxLength)) || Number(maxLength) < 1)) {
      return NextResponse.json({ error: "Add-on tipe teks butuh maxLength >= 1" }, { status: 400 });
    }

    const normalizedCode = String(code).trim().toUpperCase();
    const existing = await db.addOn.findUnique({ where: { code: normalizedCode } });
    if (existing) {
      return NextResponse.json({ error: `Kode "${normalizedCode}" sudah dipakai add-on lain` }, { status: 409 });
    }

    const addOn = await db.addOn.create({
      data: {
        code: normalizedCode,
        name: String(name).trim(),
        price: Math.round(Number(price)),
        inputType: normalizedInputType,
        maxLength: normalizedInputType === "TEXT" ? Math.round(Number(maxLength)) : null,
        active: active !== false,
      },
      include: ADDON_INCLUDE,
    });

    return NextResponse.json(addOn, { status: 201 });
  } catch (error) {
    console.error("Error creating add-on:", error);
    return NextResponse.json({ error: "Failed to create add-on" }, { status: 500 });
  }
}
