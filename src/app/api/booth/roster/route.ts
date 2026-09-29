import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/current-user";
import { logActivity, snapshotProduct } from "@/lib/activity-log";

// GET all booth-enabled Master products with their variants, each carrying
// computed "queued" (Print Queue + In Production qty) and "kurang" (target -
// (stock + queued)) so the Target Stok table can render without extra client math.
export async function GET() {
  try {
    const products = await db.product.findMany({
      where: { parentProductId: null, isBoothEnabled: true },
      include: {
        variants: {
          orderBy: [{ type: "asc" }, { color: "asc" }],
          include: {
            printQueueItems: { select: { qty: true } },
            productionItems: { select: { qty: true } },
          },
        },
      },
      orderBy: { name: "asc" },
    });

    const roster = products.map((p) => ({
      id: p.id,
      sku: p.sku,
      name: p.name,
      variants: p.variants.map((v) => {
        const queued =
          v.printQueueItems.reduce((s, i) => s + i.qty, 0) +
          v.productionItems.reduce((s, i) => s + i.qty, 0);
        const target = v.boothMinStock ?? 0;
        return {
          id: v.id,
          color: v.color,
          colorHex: v.colorHex,
          type: v.type,
          qty: v.qty,
          queued,
          boothMinStock: v.boothMinStock,
          kurang: target - (v.qty + queued),
        };
      }),
    }));

    return NextResponse.json({ roster });
  } catch (error) {
    console.error("Error fetching booth roster:", error);
    return NextResponse.json({ error: "Failed to fetch booth roster" }, { status: 500 });
  }
}

// POST add a Master SKU (+ its children) to the booth roster
export async function POST(request: NextRequest) {
  const user = getCurrentUser(request);
  try {
    const body = await request.json();
    const { sku } = body;
    if (!sku) {
      return NextResponse.json({ error: "sku is required" }, { status: 400 });
    }

    const product = await db.product.findUnique({
      where: { sku },
      include: { childProducts: { select: { id: true } } },
    });
    if (!product) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }
    if (product.parentProductId) {
      return NextResponse.json(
        { error: "Hanya Master SKU yang bisa ditambah ke roster Booth" },
        { status: 400 }
      );
    }
    if (product.isBoothEnabled) {
      return NextResponse.json({ error: "SKU sudah ada di roster Booth" }, { status: 409 });
    }

    const updated = await db.product.update({
      where: { id: product.id },
      data: { isBoothEnabled: true },
    });
    if (product.childProducts.length > 0) {
      await db.product.updateMany({
        where: { parentProductId: product.id },
        data: { isBoothEnabled: true },
      });
    }

    await logActivity({
      userId: user?.id ?? null,
      username: user?.username ?? "unknown",
      action: "UPDATE",
      entityType: "Product",
      entityId: updated.id,
      entityLabel: updated.sku,
      before: snapshotProduct(product),
      after: snapshotProduct(updated),
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error adding to booth roster:", error);
    return NextResponse.json({ error: "Failed to add to booth roster" }, { status: 500 });
  }
}
