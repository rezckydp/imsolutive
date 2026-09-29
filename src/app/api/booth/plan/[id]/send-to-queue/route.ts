import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { resolveToMasterVariantId, syncOrderItemsToQueue } from "@/lib/stock-sync";

// POST send this card's qty to Print Queue (manual action — the calendar
// never does this automatically when scheduledDate arrives) and remove the
// card, since it's now represented as a real Print Queue entry instead.
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const plan = await db.boothProductionPlan.findUnique({ where: { id } });
    if (!plan) {
      return NextResponse.json({ error: "Plan not found" }, { status: 404 });
    }

    const printQueueVariantId = await resolveToMasterVariantId(plan.variantId);
    await db.printQueueItem.create({
      data: { variantId: printQueueVariantId, qty: plan.qty, status: "Normal", note: "" },
    });
    await syncOrderItemsToQueue(printQueueVariantId, plan.qty);
    await db.boothProductionPlan.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error sending booth plan card to print queue:", error);
    return NextResponse.json({ error: "Failed to send to print queue" }, { status: 500 });
  }
}
