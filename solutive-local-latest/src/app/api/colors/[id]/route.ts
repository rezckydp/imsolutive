import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// PUT update a color
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { name, hexCode, status, sortOrder } = body;

    const existing = await db.color.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { error: "Color not found" },
        { status: 404 }
      );
    }

    // Check duplicate name (exclude self)
    if (name && name.trim() && name.trim() !== existing.name) {
      const duplicate = await db.color.findFirst({
        where: { name: name.trim() },
      });
      if (duplicate) {
        return NextResponse.json(
          { error: `Color "${name.trim()}" already exists` },
          { status: 409 }
        );
      }
    }

    const color = await db.color.update({
      where: { id },
      data: {
        ...(name !== undefined && { name: name.trim() }),
        ...(hexCode !== undefined && { hexCode }),
        ...(status !== undefined && { status }),
        ...(sortOrder !== undefined && { sortOrder }),
      },
    });

    return NextResponse.json(color);
  } catch (error) {
    console.error("Error updating color:", error);
    return NextResponse.json(
      { error: "Failed to update color" },
      { status: 500 }
    );
  }
}

// DELETE a color
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const existing = await db.color.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { error: "Color not found" },
        { status: 404 }
      );
    }

    await db.color.delete({ where: { id } });

    return NextResponse.json({ message: "Color deleted successfully" });
  } catch (error) {
    console.error("Error deleting color:", error);
    return NextResponse.json(
      { error: "Failed to delete color" },
      { status: 500 }
    );
  }
}
