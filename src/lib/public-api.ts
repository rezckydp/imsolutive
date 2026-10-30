import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { db } from "@/lib/db";
import { sortVariantsForDisplay } from "@/lib/stock-sync";

// ---------------------------------------------------------------------------
// Read-only API for bysolutive.id (/api/public/v1/*).
//
// Only reachable server-to-server: bysolutive.id calls IMSolutive directly on
// http://127.0.0.1:<port>, never through Nginx. Every request must:
//   1. carry `Authorization: Bearer <IMS_API_TOKEN>` (constant-time compare),
//   2. address a loopback Host (127.0.0.1 / localhost / [::1]),
//   3. carry no outside client address (a non-loopback X-Forwarded-For, or any
//      X-Real-IP / Forwarded) — that means it came in through Nginx.
// If IMS_API_TOKEN is not set the whole API is off. Any failure returns a
// plain 404 so outsiders can't even tell the endpoint exists.
//
// Stock is pooled per Master group (see stock-sync.ts): child products mirror
// the Master's variants, so only the Master's variants are reported here.
// ---------------------------------------------------------------------------

const LOOPBACK_HOSTS = ["127.0.0.1", "localhost", "[::1]"];

function isLoopbackIp(ip: string): boolean {
  return ip === "::1" || ip.startsWith("127.") || ip.startsWith("::ffff:127.");
}

function notFound() {
  return NextResponse.json({ error: "Not found" }, { status: 404 });
}

export function guardPublicApi(request: NextRequest): NextResponse | null {
  const expected = process.env.IMS_API_TOKEN || "";
  if (expected.length < 32) return notFound();

  const auth = request.headers.get("authorization") || "";
  const given = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return notFound();

  const host = (request.headers.get("host") || "").toLowerCase();
  const hostname = host.startsWith("[") ? host.slice(0, host.indexOf("]") + 1) : host.split(":")[0];
  if (!LOOPBACK_HOSTS.includes(hostname)) return notFound();

  // Next.js itself fills X-Forwarded-For with the socket address, so it is
  // always present; only reject it when it names a non-loopback client.
  const forwardedFor = (request.headers.get("x-forwarded-for") || "")
    .split(",")
    .map((ip) => ip.trim())
    .filter(Boolean);
  if (
    forwardedFor.some((ip) => !isLoopbackIp(ip)) ||
    request.headers.has("x-real-ip") ||
    request.headers.has("forwarded")
  ) {
    return notFound();
  }

  return null;
}

export function publicJson(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

// Color names on variants are free text; match them to the Color master by
// name (case-insensitive) to expose a stable colorId when one exists.
export async function getColorIdByName(): Promise<Map<string, string>> {
  const colors = await db.color.findMany({ select: { id: true, name: true } });
  return new Map(colors.map((c) => [c.name.trim().toLowerCase(), c.id]));
}

type MasterWithVariants = {
  id: string;
  sku: string;
  name: string;
  variasi1Name: string;
  updatedAt: Date;
  childProducts: { id: string; sku: string; name: string }[];
  variants: {
    id: string;
    type: string;
    color: string;
    colorHex: string;
    price: number | null;
    qty: number;
    updatedAt: Date;
  }[];
};

export const masterProductSelect = {
  id: true,
  sku: true,
  name: true,
  variasi1Name: true,
  updatedAt: true,
  childProducts: { select: { id: true, sku: true, name: true }, orderBy: { sku: "asc" as const } },
  variants: {
    select: {
      id: true,
      type: true,
      color: true,
      colorHex: true,
      price: true,
      qty: true,
      updatedAt: true,
    },
  },
};

export function serializeProduct(p: MasterWithVariants, colorIdByName: Map<string, string>) {
  return {
    id: p.id,
    sku: p.sku,
    name: p.name,
    variasi1Name: p.variasi1Name,
    childSkus: p.childProducts,
    updatedAt: p.updatedAt.toISOString(),
    variants: sortVariantsForDisplay(p.variants).map((v) => ({
      id: v.id,
      type: v.type,
      color: v.color,
      colorId: v.color.trim() ? colorIdByName.get(v.color.trim().toLowerCase()) ?? null : null,
      colorHex: v.colorHex,
      price: v.price,
      stock: Math.max(0, v.qty),
      updatedAt: v.updatedAt.toISOString(),
    })),
  };
}
