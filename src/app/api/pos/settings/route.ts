import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// Only one PosSettings row should ever exist — fetch it, or create one with
// defaults on first use so callers never have to special-case "not set up yet".
async function getOrCreateSettings() {
  const existing = await db.posSettings.findFirst();
  if (existing) return existing;
  return db.posSettings.create({ data: {} });
}

export async function GET() {
  try {
    const settings = await getOrCreateSettings();
    return NextResponse.json(settings);
  } catch (error) {
    console.error("Error fetching POS settings:", error);
    return NextResponse.json({ error: "Failed to fetch POS settings" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { storeName, paperWidthMm, favoriteProductIds, discountPresets, cashPresets } = body;

    if (paperWidthMm !== undefined && paperWidthMm !== 58 && paperWidthMm !== 80) {
      return NextResponse.json({ error: "Lebar kertas harus 58 atau 80" }, { status: 400 });
    }

    const settings = await getOrCreateSettings();
    const updated = await db.posSettings.update({
      where: { id: settings.id },
      data: {
        ...(storeName !== undefined && { storeName }),
        ...(paperWidthMm !== undefined && { paperWidthMm }),
        ...(favoriteProductIds !== undefined && {
          favoriteProductIds: Array.isArray(favoriteProductIds) ? favoriteProductIds.join(",") : favoriteProductIds,
        }),
        ...(discountPresets !== undefined && { discountPresets: JSON.stringify(discountPresets) }),
        ...(cashPresets !== undefined && { cashPresets: JSON.stringify(cashPresets) }),
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Error updating POS settings:", error);
    return NextResponse.json({ error: "Failed to update POS settings" }, { status: 500 });
  }
}
