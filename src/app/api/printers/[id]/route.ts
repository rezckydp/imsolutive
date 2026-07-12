import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET single printer by ID
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const printer = await db.printer.findUnique({ where: { id } });

    if (!printer) {
      return NextResponse.json(
        { error: "Printer not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(printer);
  } catch (error) {
    console.error("Error fetching printer:", error);
    return NextResponse.json(
      { error: "Failed to fetch printer" },
      { status: 500 }
    );
  }
}

// PUT update printer
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { name, brand, model, status, location, notes, purchaseDate, purchasePrice } = body;

    const existing = await db.printer.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { error: "Printer not found" },
        { status: 404 }
      );
    }

    const validStatuses = ["Working", "Need Maintenance", "Offline"];
    if (status && !validStatuses.includes(status)) {
      return NextResponse.json(
        { error: "Status must be 'Working', 'Need Maintenance', or 'Offline'" },
        { status: 400 }
      );
    }

    // Check name uniqueness if changing
    if (name && name.trim() !== existing.name) {
      const nameExists = await db.printer.findUnique({
        where: { name: name.trim() },
      });
      if (nameExists) {
        return NextResponse.json(
          { error: "Printer with this name already exists" },
          { status: 409 }
        );
      }
    }

    const printer = await db.printer.update({
      where: { id },
      data: {
        ...(name !== undefined && { name: name.trim() }),
        ...(brand !== undefined && { brand: brand.trim() }),
        ...(model !== undefined && { model: model.trim() }),
        ...(status !== undefined && { status }),
        ...(location !== undefined && { location: location.trim() }),
        ...(notes !== undefined && { notes: notes.trim() }),
        ...(purchaseDate !== undefined && {
          purchaseDate: purchaseDate ? new Date(purchaseDate) : null,
        }),
        ...(purchasePrice !== undefined && {
          purchasePrice:
            purchasePrice === null || purchasePrice === ""
              ? null
              : parseInt(purchasePrice, 10),
        }),
      },
    });

    return NextResponse.json(printer);
  } catch (error) {
    console.error("Error updating printer:", error);
    return NextResponse.json(
      { error: "Failed to update printer" },
      { status: 500 }
    );
  }
}

// DELETE printer
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const existing = await db.printer.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { error: "Printer not found" },
        { status: 404 }
      );
    }

    await db.printer.delete({ where: { id } });

    return NextResponse.json({ message: "Printer deleted successfully" });
  } catch (error) {
    console.error("Error deleting printer:", error);
    return NextResponse.json(
      { error: "Failed to delete printer" },
      { status: 500 }
    );
  }
}
