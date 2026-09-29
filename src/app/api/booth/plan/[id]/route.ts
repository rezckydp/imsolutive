import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// PATCH update a card — qty (inline edit) and/or scheduledDate (drag & drop
// between date columns move it here).
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { qty, scheduledDate } = body;

    const existing = await db.boothProductionPlan.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Plan not found" }, { status: 404 });
    }

    const updated = await db.boothProductionPlan.update({
      where: { id },
      data: {
        ...(qty !== undefined && { qty: parseInt(qty, 10) }),
        ...(scheduledDate !== undefined && { scheduledDate: new Date(scheduledDate) }),
      },
      include: { variant: { include: { product: true } } },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Error updating booth plan card:", error);
    return NextResponse.json({ error: "Failed to update booth plan card" }, { status: 500 });
  }
}

// DELETE remove a card from the calendar entirely
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const existing = await db.boothProductionPlan.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Plan not found" }, { status: 404 });
    }
    await db.boothProductionPlan.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting booth plan card:", error);
    return NextResponse.json({ error: "Failed to delete booth plan card" }, { status: 500 });
  }
}
