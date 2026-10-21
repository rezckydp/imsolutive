import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/current-user";
import { DEFAULT_TEMPLATE_ELEMENTS, DEFAULT_GUIDES } from "@/lib/label-render";

// GET the shared Label Studio template — lazy-created on first read, same
// pattern as PosSettings/BoothSettings. `category` defaults to "default"
// (the one row used for both Produk and Material for now).
export async function GET(request: NextRequest) {
  try {
    const category = request.nextUrl.searchParams.get("category") || "default";

    let template = await db.labelTemplate.findFirst({ where: { category } });
    if (!template && category !== "default") {
      template = await db.labelTemplate.findFirst({ where: { category: "default" } });
    }
    if (!template) {
      template = await db.labelTemplate.create({
        data: {
          category: "default",
          elements: JSON.stringify(DEFAULT_TEMPLATE_ELEMENTS),
          guides: JSON.stringify(DEFAULT_GUIDES),
        },
      });
    }

    return NextResponse.json({
      id: template.id,
      category: template.category,
      elements: JSON.parse(template.elements),
      guides: JSON.parse(template.guides),
      updatedAt: template.updatedAt,
      updatedBy: template.updatedBy,
    });
  } catch (error) {
    console.error("Error fetching label template:", error);
    return NextResponse.json({ error: "Failed to fetch label template" }, { status: 500 });
  }
}

// PUT update the shared template — "Simpan Template" (shared across users,
// not localStorage).
export async function PUT(request: NextRequest) {
  const user = getCurrentUser(request);
  try {
    const body = await request.json();
    const category = (body.category || "default").toString();
    const { elements, guides } = body;

    if (!elements) {
      return NextResponse.json({ error: "elements wajib diisi" }, { status: 400 });
    }

    const existing = await db.labelTemplate.findFirst({ where: { category } });
    const data = {
      elements: JSON.stringify(elements),
      guides: JSON.stringify(guides || DEFAULT_GUIDES),
      updatedBy: user?.username ?? "unknown",
    };

    const template = existing
      ? await db.labelTemplate.update({ where: { id: existing.id }, data })
      : await db.labelTemplate.create({ data: { category, ...data } });

    return NextResponse.json({
      id: template.id,
      category: template.category,
      elements: JSON.parse(template.elements),
      guides: JSON.parse(template.guides),
      updatedAt: template.updatedAt,
      updatedBy: template.updatedBy,
    });
  } catch (error) {
    console.error("Error updating label template:", error);
    return NextResponse.json({ error: "Failed to update label template" }, { status: 500 });
  }
}
