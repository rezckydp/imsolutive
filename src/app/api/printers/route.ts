import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET all printers
export async function GET() {
  try {
    const printers = await db.printer.findMany({
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(printers);
  } catch (error) {
    console.error("Error fetching printers:", error);
    return NextResponse.json(
      { error: "Failed to fetch printers" },
      { status: 500 }
    );
  }
}

// POST create new printer
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, brand, model, status, location, notes, purchaseDate, purchasePrice } = body;

    if (!name || !name.trim()) {
      return NextResponse.json(
        { error: "Printer name is required" },
        { status: 400 }
      );
    }

    const validStatuses = ["Working", "Need Maintenance", "Offline"];
    if (status && !validStatuses.includes(status)) {
      return NextResponse.json(
        { error: "Status must be 'Working', 'Need Maintenance', or 'Offline'" },
        { status: 400 }
      );
    }

    // Check if printer name already exists
    const existing = await db.printer.findUnique({ where: { name: name.trim() } });
    if (existing) {
      return NextResponse.json(
        { error: "Printer with this name already exists" },
        { status: 409 }
      );
    }

    const printer = await db.printer.create({
      data: {
        name: name.trim(),
        brand: brand?.trim() || "",
        model: model?.trim() || "",
        status: status || "Working",
        location: location?.trim() || "",
        notes: notes?.trim() || "",
        purchaseDate: purchaseDate ? new Date(purchaseDate) : null,
        purchasePrice: purchasePrice !== undefined && purchasePrice !== null && purchasePrice !== ""
          ? parseInt(purchasePrice, 10)
          : null,
      },
    });

    return NextResponse.json(printer, { status: 201 });
  } catch (error) {
    console.error("Error creating printer:", error);
    return NextResponse.json(
      { error: "Failed to create printer" },
      { status: 500 }
    );
  }
}
