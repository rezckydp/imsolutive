import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

const PACKAGE_INCLUDE = {
  requirements: { include: { category: { select: { id: true, code: true, name: true } } } },
} as const;

// GET all Bundle Packages (Single/Couple/Finisher/dst) with their category requirements
export async function GET() {
  try {
    const packages = await db.bundlePackage.findMany({
      include: PACKAGE_INCLUDE,
      orderBy: { price: "asc" },
    });
    return NextResponse.json({ packages });
  } catch (error) {
    console.error("Error fetching bundle packages:", error);
    return NextResponse.json({ error: "Failed to fetch bundle packages" }, { status: 500 });
  }
}

interface RequirementInput {
  categoryId: string;
  qty: number;
}

// POST create a new Bundle Package + its category requirements
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { code, name, price, requirements } = body as {
      code: string;
      name: string;
      price: number;
      requirements: RequirementInput[];
    };

    if (!code || !String(code).trim()) {
      return NextResponse.json({ error: "Kode paket wajib diisi" }, { status: 400 });
    }
    if (!name || !String(name).trim()) {
      return NextResponse.json({ error: "Nama paket wajib diisi" }, { status: 400 });
    }
    if (price == null || isNaN(Number(price)) || Number(price) < 0) {
      return NextResponse.json({ error: "Harga paket harus diisi angka >= 0" }, { status: 400 });
    }
    if (!Array.isArray(requirements) || requirements.length === 0) {
      return NextResponse.json({ error: "Paket butuh minimal 1 requirement kategori" }, { status: 400 });
    }
    for (const r of requirements) {
      if (!r.categoryId || !r.qty || r.qty < 1) {
        return NextResponse.json({ error: "Tiap requirement butuh kategori & qty >= 1" }, { status: 400 });
      }
    }
    const categoryIds = requirements.map((r) => r.categoryId);
    if (new Set(categoryIds).size !== categoryIds.length) {
      return NextResponse.json({ error: "Satu kategori cuma boleh muncul 1x per paket" }, { status: 400 });
    }

    const normalizedCode = String(code).trim().toUpperCase();
    const existing = await db.bundlePackage.findUnique({ where: { code: normalizedCode } });
    if (existing) {
      return NextResponse.json({ error: `Kode "${normalizedCode}" sudah dipakai paket lain` }, { status: 409 });
    }

    const categories = await db.bundleCategory.findMany({ where: { id: { in: categoryIds } } });
    if (categories.length !== categoryIds.length) {
      return NextResponse.json({ error: "Salah satu kategori tidak ditemukan" }, { status: 404 });
    }

    const pkg = await db.bundlePackage.create({
      data: {
        code: normalizedCode,
        name: String(name).trim(),
        price: Math.round(Number(price)),
        requirements: {
          create: requirements.map((r) => ({ categoryId: r.categoryId, qty: Math.round(r.qty) })),
        },
      },
      include: PACKAGE_INCLUDE,
    });

    return NextResponse.json(pkg, { status: 201 });
  } catch (error) {
    console.error("Error creating bundle package:", error);
    return NextResponse.json({ error: "Failed to create bundle package" }, { status: 500 });
  }
}
