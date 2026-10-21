import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/current-user";

// GET all labels — Library Label list. Optional ?q= (skuName/productName/
// color) and ?type=produk|material filters.
export async function GET(request: NextRequest) {
  try {
    const q = request.nextUrl.searchParams.get("q")?.trim() || "";
    const type = request.nextUrl.searchParams.get("type") || "";

    const where: Record<string, unknown> = {};
    if (type === "produk" || type === "material") {
      where.type = type;
    }
    if (q) {
      where.OR = [
        { skuName: { contains: q } },
        { productName: { contains: q } },
        { color: { contains: q } },
      ];
    }

    const labels = await db.label.findMany({
      where: Object.keys(where).length > 0 ? where : undefined,
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({
      labels: labels.map((l) => ({
        ...l,
        fonts: l.fonts ? JSON.parse(l.fonts) : null,
      })),
    });
  } catch (error) {
    console.error("Error fetching labels:", error);
    return NextResponse.json({ error: "Failed to fetch labels" }, { status: 500 });
  }
}

// POST create a new Label — "Simpan ke Library" on a fresh Generate form.
export async function POST(request: NextRequest) {
  const user = getCurrentUser(request);
  try {
    const body = await request.json();
    const type = (body.type || "produk").toString();
    const skuName = (body.skuName || "").toString().trim();
    const qrCode = (body.qrCode || "").toString().trim();
    const productName = (body.productName || "").toString().trim();

    if (!skuName || !qrCode) {
      return NextResponse.json({ error: "Nama SKU dan Kode untuk QR wajib diisi" }, { status: 400 });
    }

    const label = await db.label.create({
      data: {
        type,
        sourceRef: body.sourceRef || null,
        skuName,
        qrCode,
        productName,
        color: (body.color || "").toString().trim(),
        keterangan: body.keterangan ? body.keterangan.toString().trim() : null,
        fonts: body.fonts ? JSON.stringify(body.fonts) : null,
        createdBy: user?.username ?? "unknown",
      },
    });

    return NextResponse.json({ ...label, fonts: label.fonts ? JSON.parse(label.fonts) : null }, { status: 201 });
  } catch (error) {
    console.error("Error creating label:", error);
    return NextResponse.json({ error: "Failed to create label" }, { status: 500 });
  }
}
