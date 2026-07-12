import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// PATCH update print queue item (qty, status)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { qty, status } = body;

    const existing = await db.printQueueItem.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { error: "Print queue item not found" },
        { status: 404 }
      );
    }

    const updateData: Record<string, unknown> = {};
    if (qty !== undefined) {
      const parsedQty = parseInt(qty, 10);
      if (isNaN(parsedQty) || parsedQty < 1) {
        return NextResponse.json(
          { error: "qty must be a positive integer" },
          { status: 400 }
        );
      }
      updateData.qty = parsedQty;
    }
    if (status !== undefined) {
      const validStatuses = ["Priority", "Normal", "Urgent"];
      if (!validStatuses.includes(status)) {
        return NextResponse.json(
          { error: `Invalid status. Must be one of: ${validStatuses.join(", ")}` },
          { status: 400 }
        );
      }
      updateData.status = status;
    }

    const updated = await db.printQueueItem.update({
      where: { id },
      data: updateData,
      include: {
        variant: {
          include: { product: true },
        },
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Error updating print queue item:", error);
    return NextResponse.json(
      { error: "Failed to update print queue item" },
      { status: 500 }
    );
  }
}

// DELETE remove item from print queue
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const existing = await db.printQueueItem.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { error: "Print queue item not found" },
        { status: 404 }
      );
    }

    await db.printQueueItem.delete({ where: { id } });

    return NextResponse.json({
      message: "Print queue item removed successfully",
    });
  } catch (error) {
    console.error("Error deleting print queue item:", error);
    return NextResponse.json(
      { error: "Failed to delete print queue item" },
      { status: 500 }
    );
  }
}
