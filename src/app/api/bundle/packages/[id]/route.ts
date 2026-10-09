import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

const PACKAGE_INCLUDE = {
  requirements: { include: { category: { select: { id: true, code: true, name: true } } } },
} as const;

interface RequirementInput {
  categoryId: string;
  qty: number;
}

// PATCH update a Bundle Package's fields and/or fully replace its requirements
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { code, name, price, requirements } = body as {
      code?: string;
      name?: string;
      price?: number;
      requirements?: RequirementInput[];
    };

    const existing = await db.bundlePackage.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Paket tidak ditemukan" }, { status: 404 });
    }

    const data: Record<string, unknown> = {};
    if (code !== undefined) {
      const normalizedCode = String(code).trim().toUpperCase();
      if (!normalizedCode) return NextResponse.json({ error: "Kode paket wajib diisi" }, { status: 400 });
      if (normalizedCode !== existing.code) {
        const dup = await db.bundlePackage.findUnique({ where: { code: normalizedCode } });
        if (dup) return NextResponse.json({ error: `Kode "${normalizedCode}" sudah dipakai paket lain` }, { status: 409 });
      }
      data.code = normalizedCode;
    }
    if (name !== undefined) {
      if (!String(name).trim()) return NextResponse.json({ error: "Nama paket wajib diisi" }, { status: 400 });
      data.name = String(name).trim();
    }
    if (price !== undefined) {
      if (price == null || isNaN(Number(price)) || Number(price) < 0) {
        return NextResponse.json({ error: "Harga paket harus diisi angka >= 0" }, { status: 400 });
      }
      data.price = Math.round(Number(price));
    }

    if (requirements !== undefined) {
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
      const categories = await db.bundleCategory.findMany({ where: { id: { in: categoryIds } } });
      if (categories.length !== categoryIds.length) {
        return NextResponse.json({ error: "Salah satu kategori tidak ditemukan" }, { status: 404 });
      }
    }

    await db.$transaction([
      db.bundlePackage.update({ where: { id }, data }),
      ...(requirements !== undefined
        ? [
            db.bundlePackageRequirement.deleteMany({ where: { packageId: id } }),
            db.bundlePackageRequirement.createMany({
              data: requirements!.map((r) => ({ packageId: id, categoryId: r.categoryId, qty: Math.round(r.qty) })),
            }),
          ]
        : []),
    ]);

    const updated = await db.bundlePackage.findUnique({ where: { id }, include: PACKAGE_INCLUDE });
    return NextResponse.json(updated);
  } catch (error) {
    console.error("Error updating bundle package:", error);
    return NextResponse.json({ error: "Failed to update bundle package" }, { status: 500 });
  }
}

// DELETE a Bundle Package (its requirements cascade via onDelete: Cascade)
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const existing = await db.bundlePackage.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Paket tidak ditemukan" }, { status: 404 });
    }
    await db.bundlePackage.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting bundle package:", error);
    return NextResponse.json({ error: "Failed to delete bundle package" }, { status: 500 });
  }
}
