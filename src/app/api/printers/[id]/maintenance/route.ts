import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET all maintenance records for a printer
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Verify printer exists
    const printer = await db.printer.findUnique({ where: { id } });
    if (!printer) {
      return NextResponse.json(
        { error: "Printer not found" },
        { status: 404 }
      );
    }

    const maintenances = await db.printerMaintenance.findMany({
      where: { printerId: id },
      orderBy: { nextDue: "asc" },
    });

    return NextResponse.json(maintenances);
  } catch (error) {
    console.error("Error fetching maintenances:", error);
    return NextResponse.json(
      { error: "Failed to fetch maintenance records" },
      { status: 500 }
    );
  }
}

// POST create new maintenance record
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { type, customType, lastDone, intervalDays, notes } = body;

    // Verify printer exists
    const printer = await db.printer.findUnique({ where: { id } });
    if (!printer) {
      return NextResponse.json(
        { error: "Printer not found" },
        { status: 404 }
      );
    }

    if (!type || !type.trim()) {
      return NextResponse.json(
        { error: "Maintenance type is required" },
        { status: 400 }
      );
    }

    if (!lastDone) {
      return NextResponse.json(
        { error: "Last done date is required" },
        { status: 400 }
      );
    }

    const validTypes = ["Nozzle Change", "Lubricant", "Belt Tension", "Full Cleaning", "Custom"];
    if (!validTypes.includes(type)) {
      return NextResponse.json(
        { error: "Invalid maintenance type" },
        { status: 400 }
      );
    }

    if (type === "Custom" && (!customType || !customType.trim())) {
      return NextResponse.json(
        { error: "Custom type name is required when type is Custom" },
        { status: 400 }
      );
    }

    const interval = intervalDays && intervalDays > 0 ? intervalDays : 90;
    const lastDoneDate = new Date(lastDone);
    const nextDueDate = new Date(lastDoneDate);
    nextDueDate.setDate(nextDueDate.getDate() + interval);

    const maintenance = await db.printerMaintenance.create({
      data: {
        printerId: id,
        type: type.trim(),
        customType: type === "Custom" ? customType.trim() : null,
        lastDone: lastDoneDate,
        intervalDays: interval,
        nextDue: nextDueDate,
        notes: notes?.trim() || "",
      },
    });

    return NextResponse.json(maintenance, { status: 201 });
  } catch (error) {
    console.error("Error creating maintenance:", error);
    return NextResponse.json(
      { error: "Failed to create maintenance record" },
      { status: 500 }
    );
  }
}
