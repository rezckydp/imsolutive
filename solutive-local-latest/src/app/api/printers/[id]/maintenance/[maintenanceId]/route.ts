import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// PUT update maintenance record
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; maintenanceId: string }> }
) {
  try {
    const { id, maintenanceId } = await params;
    const body = await request.json();
    const { type, customType, lastDone, intervalDays, notes } = body;

    // Verify maintenance record exists and belongs to this printer
    const existing = await db.printerMaintenance.findFirst({
      where: { id: maintenanceId, printerId: id },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Maintenance record not found" },
        { status: 404 }
      );
    }

    if (type !== undefined && type.trim()) {
      const validTypes = ["Nozzle Change", "Lubricant", "Belt Tension", "Full Cleaning", "Custom"];
      if (!validTypes.includes(type)) {
        return NextResponse.json(
          { error: "Invalid maintenance type" },
          { status: 400 }
        );
      }
    }

    if (type === "Custom" && (!customType || !customType.trim())) {
      return NextResponse.json(
        { error: "Custom type name is required when type is Custom" },
        { status: 400 }
      );
    }

    // Calculate nextDue
    const newLastDone = lastDone ? new Date(lastDone) : existing.lastDone;
    const newInterval = intervalDays && intervalDays > 0 ? intervalDays : existing.intervalDays;
    const nextDueDate = new Date(newLastDone);
    nextDueDate.setDate(nextDueDate.getDate() + newInterval);

    const maintenance = await db.printerMaintenance.update({
      where: { id: maintenanceId },
      data: {
        ...(type !== undefined && { type: type.trim() }),
        ...(type === "Custom" && customType !== undefined
          ? { customType: customType.trim() }
          : type !== "Custom"
          ? { customType: null }
          : {}),
        ...(lastDone !== undefined && { lastDone: newLastDone }),
        ...(intervalDays !== undefined && { intervalDays: newInterval }),
        nextDue: nextDueDate,
        ...(notes !== undefined && { notes: notes.trim() }),
      },
    });

    return NextResponse.json(maintenance);
  } catch (error) {
    console.error("Error updating maintenance:", error);
    return NextResponse.json(
      { error: "Failed to update maintenance record" },
      { status: 500 }
    );
  }
}

// DELETE maintenance record
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; maintenanceId: string }> }
) {
  try {
    const { id, maintenanceId } = await params;

    // Verify maintenance record exists and belongs to this printer
    const existing = await db.printerMaintenance.findFirst({
      where: { id: maintenanceId, printerId: id },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Maintenance record not found" },
        { status: 404 }
      );
    }

    await db.printerMaintenance.delete({
      where: { id: maintenanceId },
    });

    return NextResponse.json({ message: "Maintenance record deleted successfully" });
  } catch (error) {
    console.error("Error deleting maintenance:", error);
    return NextResponse.json(
      { error: "Failed to delete maintenance record" },
      { status: 500 }
    );
  }
}
