import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET a single stock opname session with all items (include variant with product data)
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const session = await db.stockOpname.findUnique({
      where: { id },
      include: {
        items: {
          include: {
            variant: {
              include: { product: true },
            },
          },
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!session) {
      return NextResponse.json(
        { error: "Stock opname session not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(session);
  } catch (error) {
    console.error("Error fetching stock opname session:", error);
    return NextResponse.json(
      { error: "Failed to fetch stock opname session" },
      { status: 500 }
    );
  }
}

// PUT update notes and/or status of a stock opname session
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { notes, status } = body;

    const existing = await db.stockOpname.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { error: "Stock opname session not found" },
        { status: 404 }
      );
    }

    const data: Record<string, unknown> = {};
    if (notes !== undefined) data.notes = notes;
    if (status !== undefined) {
      if (!["In Progress", "Completed", "Cancelled"].includes(status)) {
        return NextResponse.json(
          { error: "Status must be 'In Progress', 'Completed', or 'Cancelled'" },
          { status: 400 }
        );
      }
      data.status = status;
      if (status === "Completed" || status === "Cancelled") {
        data.completedAt = new Date();
      }
    }

    const session = await db.stockOpname.update({
      where: { id },
      data,
    });

    return NextResponse.json(session);
  } catch (error) {
    console.error("Error updating stock opname session:", error);
    return NextResponse.json(
      { error: "Failed to update stock opname session" },
      { status: 500 }
    );
  }
}

// DELETE a stock opname session (cascade deletes items)
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const existing = await db.stockOpname.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { error: "Stock opname session not found" },
        { status: 404 }
      );
    }

    await db.stockOpname.delete({ where: { id } });

    return NextResponse.json({
      message: "Stock opname session deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting stock opname session:", error);
    return NextResponse.json(
      { error: "Failed to delete stock opname session" },
      { status: 500 }
    );
  }
}
