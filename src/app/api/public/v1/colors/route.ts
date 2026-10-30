import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { guardPublicApi, publicJson } from "@/lib/public-api";

// GET the Color master — read-only, for bysolutive.id
export async function GET(request: NextRequest) {
  const denied = guardPublicApi(request);
  if (denied) return denied;

  try {
    const colors = await db.color.findMany({
      select: { id: true, name: true, hexCode: true, status: true, sortOrder: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });
    return publicJson({
      colors: colors.map((c) => ({
        id: c.id,
        name: c.name,
        hex: c.hexCode,
        active: c.status === "Active",
        sortOrder: c.sortOrder,
      })),
    });
  } catch (error) {
    console.error("Error in public colors API:", error);
    return publicJson({ error: "Failed to fetch colors" }, 500);
  }
}
