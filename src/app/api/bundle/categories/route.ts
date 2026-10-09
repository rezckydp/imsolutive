import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET all Bundle Categories, with their assigned products (for the admin
// panel's "Kelola Kategori Bundle" list + multi-select assignment UI).
export async function GET() {
  try {
    const categories = await db.bundleCategory.findMany({
      include: {
        products: { select: { id: true, sku: true, name: true }, orderBy: { sku: "asc" } },
      },
      orderBy: { name: "asc" },
    });
    return NextResponse.json({ categories });
  } catch (error) {
    console.error("Error fetching bundle categories:", error);
    return NextResponse.json({ error: "Failed to fetch bundle categories" }, { status: 500 });
  }
}

// POST create a new Bundle Category
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { code, name, normalPrice, bulkMinQty, bulkUnitPrice, bulkTierName } = body;

    if (!code || !String(code).trim()) {
      return NextResponse.json({ error: "Kode kategori wajib diisi" }, { status: 400 });
    }
    if (!name || !String(name).trim()) {
      return NextResponse.json({ error: "Nama kategori wajib diisi" }, { status: 400 });
    }
    if (normalPrice == null || isNaN(Number(normalPrice)) || Number(normalPrice) < 0) {
      return NextResponse.json({ error: "Harga normal harus diisi angka >= 0" }, { status: 400 });
    }

    const normalizedCode = String(code).trim().toUpperCase();
    const existing = await db.bundleCategory.findUnique({ where: { code: normalizedCode } });
    if (existing) {
      return NextResponse.json({ error: `Kode "${normalizedCode}" sudah dipakai kategori lain` }, { status: 409 });
    }

    const hasBulk = bulkMinQty != null && bulkMinQty !== "" && bulkUnitPrice != null && bulkUnitPrice !== "";
    const category = await db.bundleCategory.create({
      data: {
        code: normalizedCode,
        name: String(name).trim(),
        normalPrice: Math.round(Number(normalPrice)),
        bulkMinQty: hasBulk ? Math.round(Number(bulkMinQty)) : null,
        bulkUnitPrice: hasBulk ? Math.round(Number(bulkUnitPrice)) : null,
        bulkTierName: bulkTierName && String(bulkTierName).trim() ? String(bulkTierName).trim() : null,
      },
      include: { products: { select: { id: true, sku: true, name: true } } },
    });

    return NextResponse.json(category, { status: 201 });
  } catch (error) {
    console.error("Error creating bundle category:", error);
    return NextResponse.json({ error: "Failed to create bundle category" }, { status: 500 });
  }
}
