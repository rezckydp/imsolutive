import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/current-user";
import { logActivity } from "@/lib/activity-log";

// POST /api/production/[id]/write-off — marks whatever's left unscanned on a
// Completed job as reject/lost, without ever touching ProductVariant.qty
// (ims-real-stock-scan-pipeline-spec.md §4.4). Closes the job so it stops
// counting as "pendingScan" in the Pipeline.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const user = getCurrentUser(request);

    const existing = await db.productionItem.findUnique({
      where: { id },
      include: { variant: { include: { product: true } } },
    });
    if (!existing) {
      return NextResponse.json({ error: "Production item not found" }, { status: 404 });
    }
    if (existing.status !== "Completed") {
      return NextResponse.json(
        { error: "Write-off hanya berlaku untuk item yang sudah Completed" },
        { status: 400 }
      );
    }

    const outstanding = existing.qty - existing.scannedQty - existing.writeOffQty;
    if (outstanding <= 0) {
      return NextResponse.json({ error: "Tidak ada sisa yang perlu ditandai" }, { status: 400 });
    }

    const updated = await db.productionItem.update({
      where: { id },
      data: { writeOffQty: existing.qty - existing.scannedQty, closedAt: new Date() },
    });

    await logActivity({
      userId: user?.id ?? null,
      username: user?.username ?? "unknown",
      action: "UPDATE",
      entityType: "ProductionItem",
      entityId: id,
      entityLabel: `${existing.variant.product.sku} — ${existing.variant.color}${existing.variant.type ? ` - ${existing.variant.type}` : ""}`,
      before: { writeOffQty: existing.writeOffQty, closedAt: existing.closedAt },
      after: { writeOffQty: updated.writeOffQty, closedAt: updated.closedAt, reason: "write-off", outstanding },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Error writing off production item:", error);
    return NextResponse.json({ error: "Failed to write off production item" }, { status: 500 });
  }
}
