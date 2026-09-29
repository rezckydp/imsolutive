import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// Singleton row, lazily created on first read — same pattern as PosSettings.
async function getOrCreateSettings() {
  const existing = await db.boothSettings.findFirst();
  if (existing) return existing;
  return db.boothSettings.create({ data: {} });
}

export async function GET() {
  try {
    const settings = await getOrCreateSettings();
    return NextResponse.json(settings);
  } catch (error) {
    console.error("Error fetching booth settings:", error);
    return NextResponse.json({ error: "Failed to fetch booth settings" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { eventDate } = body;
    const settings = await getOrCreateSettings();
    const updated = await db.boothSettings.update({
      where: { id: settings.id },
      data: { eventDate: eventDate ? new Date(eventDate) : null },
    });
    return NextResponse.json(updated);
  } catch (error) {
    console.error("Error updating booth settings:", error);
    return NextResponse.json({ error: "Failed to update booth settings" }, { status: 500 });
  }
}
