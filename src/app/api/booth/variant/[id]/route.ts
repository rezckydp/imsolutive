import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/current-user";
import { logActivity, snapshotVariant } from "@/lib/activity-log";

// PATCH update the booth target (boothMinStock) for one roster variant —
// the inline-editable "Target" column in the Target Stok table.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = getCurrentUser(request);
  try {
    const { id } = await params;
    const body = await request.json();
    const { boothMinStock } = body;

    const existing = await db.productVariant.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Variant not found" }, { status: 404 });
    }

    const nextValue =
      boothMinStock === null || boothMinStock === "" || boothMinStock === undefined
        ? null
        : parseInt(boothMinStock, 10);

    const updated = await db.productVariant.update({
      where: { id },
      data: { boothMinStock: nextValue },
    });

    await logActivity({
      userId: user?.id ?? null,
      username: user?.username ?? "unknown",
      action: "UPDATE",
      entityType: "ProductVariant",
      entityId: updated.id,
      entityLabel: `Target Booth — ${updated.color || updated.type || "Default"}`,
      before: snapshotVariant(existing),
      after: snapshotVariant(updated),
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Error updating booth target:", error);
    return NextResponse.json({ error: "Failed to update booth target" }, { status: 500 });
  }
}
