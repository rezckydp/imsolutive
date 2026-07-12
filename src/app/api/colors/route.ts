import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET all colors (active first, sorted by sortOrder)
export async function GET() {
  try {
    const colors = await db.color.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });
    return NextResponse.json(colors);
  } catch (error) {
    console.error("Error fetching colors:", error);
    return NextResponse.json(
      { error: "Failed to fetch colors" },
      { status: 500 }
    );
  }
}

// POST create a new color
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, hexCode, status, sortOrder } = body;

    if (!name || !name.trim()) {
      return NextResponse.json(
        { error: "Color name is required" },
        { status: 400 }
      );
    }

    // Check duplicate name
    const existing = await db.color.findFirst({
      where: { name: name.trim() },
    });
    if (existing) {
      return NextResponse.json(
        { error: `Color "${name.trim()}" already exists` },
        { status: 409 }
      );
    }

    const color = await db.color.create({
      data: {
        name: name.trim(),
        hexCode: hexCode || "#4b5563",
        status: status || "Active",
        sortOrder: sortOrder ?? 0,
      },
    });

    return NextResponse.json(color, { status: 201 });
  } catch (error) {
    console.error("Error creating color:", error);
    return NextResponse.json(
      { error: "Failed to create color" },
      { status: 500 }
    );
  }
}

import { NextRequest } from "next/server";
