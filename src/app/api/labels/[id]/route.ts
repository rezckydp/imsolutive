import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET a single Label — prefills the Generate form when clicking "Edit".
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const label = await db.label.findUnique({ where: { id } });
    if (!label) {
      return NextResponse.json({ error: "Label tidak ditemukan" }, { status: 404 });
    }
    return NextResponse.json({ ...label, fonts: label.fonts ? JSON.parse(label.fonts) : null });
  } catch (error) {
    console.error("Error fetching label:", error);
    return NextResponse.json({ error: "Failed to fetch label" }, { status: 500 });
  }
}

// PUT update an existing Label — "Simpan ke Library" while editing updates
// the same row instead of creating a duplicate.
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const existing = await db.label.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Label tidak ditemukan" }, { status: 404 });
    }

    const body = await request.json();
    const skuName = body.skuName !== undefined ? body.skuName.toString().trim() : undefined;
    const qrCode = body.qrCode !== undefined ? body.qrCode.toString().trim() : undefined;

    if ((skuName !== undefined && !skuName) || (qrCode !== undefined && !qrCode)) {
      return NextResponse.json({ error: "Nama SKU dan Kode untuk QR wajib diisi" }, { status: 400 });
    }

    const label = await db.label.update({
      where: { id },
      data: {
        ...(body.type !== undefined && { type: body.type }),
        ...(body.sourceRef !== undefined && { sourceRef: body.sourceRef || null }),
        ...(skuName !== undefined && { skuName }),
        ...(qrCode !== undefined && { qrCode }),
        ...(body.productName !== undefined && { productName: body.productName.toString().trim() }),
        ...(body.color !== undefined && { color: body.color.toString().trim() }),
        ...(body.keterangan !== undefined && { keterangan: body.keterangan ? body.keterangan.toString().trim() : null }),
        ...(body.fonts !== undefined && { fonts: body.fonts ? JSON.stringify(body.fonts) : null }),
      },
    });

    return NextResponse.json({ ...label, fonts: label.fonts ? JSON.parse(label.fonts) : null });
  } catch (error) {
    console.error("Error updating label:", error);
    return NextResponse.json({ error: "Failed to update label" }, { status: 500 });
  }
}

// DELETE a Label.
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const existing = await db.label.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Label tidak ditemukan" }, { status: 404 });
    }
    await db.label.delete({ where: { id } });
    return NextResponse.json({ message: "Label deleted successfully" });
  } catch (error) {
    console.error("Error deleting label:", error);
    return NextResponse.json({ error: "Failed to delete label" }, { status: 500 });
  }
}
