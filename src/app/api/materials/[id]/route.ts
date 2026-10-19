import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// PUT update a Material (Nama, Unit)
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const name = body.name !== undefined ? body.name.toString().trim() : undefined;
    const unit = body.unit !== undefined ? body.unit.toString().trim() : undefined;

    const existing = await db.material.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Material tidak ditemukan" }, { status: 404 });
    }

    const material = await db.material.update({
      where: { id },
      data: {
        ...(name !== undefined && name !== "" && { name }),
        ...(unit !== undefined && unit !== "" && { unit }),
      },
      include: { variants: { orderBy: { label: "asc" } } },
    });

    return NextResponse.json(material);
  } catch (error) {
    console.error("Error updating material:", error);
    return NextResponse.json({ error: "Failed to update material" }, { status: 500 });
  }
}

// DELETE a Material — cascades its variants, their BOM links and movement log.
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const existing = await db.material.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Material tidak ditemukan" }, { status: 404 });
    }

    await db.material.delete({ where: { id } });
    return NextResponse.json({ message: "Material deleted successfully" });
  } catch (error) {
    console.error("Error deleting material:", error);
    return NextResponse.json({ error: "Failed to delete material" }, { status: 500 });
  }
}
