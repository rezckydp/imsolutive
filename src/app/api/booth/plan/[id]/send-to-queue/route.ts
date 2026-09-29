import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { resolveToMasterVariantId, syncOrderItemsToQueue } from "@/lib/stock-sync";

// POST send some (or all) of this card's qty to Print Queue — manual action,
// the calendar never does this automatically when scheduledDate arrives.
// Optional body { qty }: how much to send now (defaults to the card's full
// qty). Sending less than the full qty just shrinks the card by that much,
// so the remainder stays visible to send another day — this is how Rezcky
// chips away at a lump-sum "total needed" card at his own daily pace,
// instead of the app guessing a print schedule for him. Sending the full
// remaining qty removes the card entirely.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const plan = await db.boothProductionPlan.findUnique({ where: { id } });
    if (!plan) {
      return NextResponse.json({ error: "Plan not found" }, { status: 404 });
    }

    const body = await request.json().catch(() => ({}));
    const rawQty = body?.qty;
    let sendQty = plan.qty;
    if (rawQty !== undefined && rawQty !== null) {
      const parsed = parseInt(rawQty, 10);
      if (isNaN(parsed) || parsed <= 0) {
        return NextResponse.json({ error: "qty harus lebih dari 0" }, { status: 400 });
      }
      sendQty = Math.min(parsed, plan.qty);
    }

    const printQueueVariantId = await resolveToMasterVariantId(plan.variantId);
    await db.printQueueItem.create({
      data: { variantId: printQueueVariantId, qty: sendQty, status: "Normal", note: "" },
    });
    await syncOrderItemsToQueue(printQueueVariantId, sendQty);

    const remaining = plan.qty - sendQty;
    if (remaining > 0) {
      const updated = await db.boothProductionPlan.update({
        where: { id },
        data: { qty: remaining },
        include: { variant: { include: { product: true } } },
      });
      return NextResponse.json({ success: true, plan: updated });
    }

    await db.boothProductionPlan.delete({ where: { id } });
    return NextResponse.json({ success: true, plan: null });
  } catch (error) {
    console.error("Error sending booth plan card to print queue:", error);
    return NextResponse.json({ error: "Failed to send to print queue" }, { status: 500 });
  }
}
