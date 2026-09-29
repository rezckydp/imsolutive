import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/current-user";
import { logActivity, snapshotProduct } from "@/lib/activity-log";

// DELETE remove a Master SKU (+ its children) from the booth roster.
// Deliberately does NOT touch boothMinStock — those targets stay saved so
// re-adding the SKU later doesn't require re-entering them from scratch.
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ sku: string }> }
) {
  const user = getCurrentUser(request);
  try {
    const { sku } = await params;
    const product = await db.product.findUnique({
      where: { sku },
      include: { childProducts: { select: { id: true } } },
    });
    if (!product) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }
    if (product.parentProductId) {
      return NextResponse.json(
        { error: "Hanya Master SKU yang bisa dihapus dari roster Booth" },
        { status: 400 }
      );
    }

    const updated = await db.product.update({
      where: { id: product.id },
      data: { isBoothEnabled: false },
    });
    if (product.childProducts.length > 0) {
      await db.product.updateMany({
        where: { parentProductId: product.id },
        data: { isBoothEnabled: false },
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
    console.error("Error removing from booth roster:", error);
    return NextResponse.json({ error: "Failed to remove from booth roster" }, { status: 500 });
  }
}
