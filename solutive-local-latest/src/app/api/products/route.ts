import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { syncMasterStockToGroup } from "@/lib/stock-sync";

// GET all products with variants and group info
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const search = searchParams.get("search") || "";
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "50", 10);
    const lowStockOnly = searchParams.get("lowStock") === "true";
    const mastersOnly = searchParams.get("mastersOnly") === "true";

    const where: Record<string, unknown> = {};

    // If mastersOnly, only fetch master/standalone products (no variants of a master)
    if (mastersOnly) {
      where.parentProductId = null;
    }

    if (search) {
      where.OR = [
        { sku: { contains: search } },
        { name: { contains: search } },
        { variants: { some: { color: { contains: search } } } },
        { variants: { some: { type: { contains: search } } } },
        { variants: { some: { barcode: { contains: search } } } },
      ];
    }

    const skip = (page - 1) * limit;

    const [products, total] = await Promise.all([
      db.product.findMany({
        where: Object.keys(where).length > 0 ? where : undefined,
        include: {
          parentProduct: {
            select: { id: true, sku: true, name: true },
          },
          childProducts: {
            select: { id: true, sku: true, name: true },
            orderBy: { sku: "asc" },
          },
          variants: { orderBy: [{ type: "asc" }, { color: "asc" }] },
          parts: {
            orderBy: { sortOrder: "asc" },
            include: { partColors: { orderBy: { color: "asc" } } },
          },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      db.product.count({
        where: Object.keys(where).length > 0 ? where : undefined,
      }),
    ]);

    // Low stock filter: any variant below minStock
    let filtered = products;
    if (lowStockOnly) {
      filtered = products.filter((p) =>
        p.variants.some((v) => v.qty < p.minStock)
      );
    }

    return NextResponse.json({
      products: filtered,
      total: lowStockOnly ? filtered.length : total,
      page,
      limit,
    });
  } catch (error) {
    console.error("Error fetching products:", error);
    return NextResponse.json(
      { error: "Failed to fetch products" },
      { status: 500 }
    );
  }
}

// POST create new product (with optional variants, parts, and parentProductId)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sku, name, minStock, variants, parts, parentProductId } = body;

    if (!sku || !name) {
      return NextResponse.json(
        { error: "SKU and name are required" },
        { status: 400 }
      );
    }

    // Check if SKU already exists
    const existing = await db.product.findUnique({ where: { sku } });
    if (existing) {
      return NextResponse.json(
        { error: "Product with this SKU already exists" },
        { status: 409 }
      );
    }

    // If parentProductId is set, validate the parent exists and is a master
    if (parentProductId) {
      const parent = await db.product.findUnique({
        where: { id: parentProductId },
        include: { variants: { orderBy: [{ type: "asc" }, { color: "asc" }] } },
      });
      if (!parent) {
        return NextResponse.json(
          { error: "Parent product not found" },
          { status: 404 }
        );
      }
      // Parent must be a master (no parent itself)
      if (parent.parentProductId) {
        return NextResponse.json(
          { error: "Cannot add variant to another variant. Parent must be a master product." },
          { status: 400 }
        );
      }

      // If variants are provided, they must match master's variants (color and/or type)
      if (variants && Array.isArray(variants) && variants.length > 0) {
        // Validate that provided variants match master's variants
        const masterVariants = parent.variants;
        for (const v of variants) {
          const vColor = (v.color || "").toLowerCase();
          const vType = (v.type || "").toLowerCase();
          const found = masterVariants.find(
            (mv) => mv.color.toLowerCase() === vColor && mv.type.toLowerCase() === vType
          );
          if (!found) {
            const label = vColor && vType ? `${v.color} - ${v.type}` : vColor || v.type;
            return NextResponse.json(
              {
                error: `Variant "${label}" not found in master. Master variants: ${masterVariants.map((mv) => {
                  const c = mv.color || "";
                  const t = mv.type || "";
                  return c && t ? `${c} - ${t}` : c || t;
                }).join(", ")}`,
              },
              { status: 400 }
            );
          }
        }

        // Auto-sync stock from master for each variant
        const syncedVariants = variants.map(
          (v: { color?: string; type?: string; colorHex?: string; qty?: number; barcode?: string }) => {
            const masterVariant = parent.variants.find(
              (mv) => mv.color.toLowerCase() === (v.color || "").toLowerCase() && mv.type.toLowerCase() === (v.type || "").toLowerCase()
            );
            return {
              ...v,
              qty: masterVariant ? masterVariant.qty : 0,
            };
          }
        );

        const product = await db.product.create({
          data: {
            sku,
            name,
            minStock: parent.minStock, // Inherit master's minStock
            parentProductId,
            variants: {
              create: syncedVariants.map(
                (v: { color?: string; type?: string; colorHex?: string; qty?: number; barcode?: string }) => ({
                  color: v.color || "",
                  colorHex: v.colorHex || "#2d3436",
                  type: v.type || "",
                  qty: v.qty ?? 0,
                  barcode: v.barcode || null,
                })
              ),
            },
          },
          include: {
            parentProduct: {
              select: { id: true, sku: true, name: true },
            },
            childProducts: {
              select: { id: true, sku: true, name: true },
            },
            variants: true,
          },
        });

        return NextResponse.json(product, { status: 201 });
      }
    }

    // If variant of master but no colors provided, use master's colors
    if (parentProductId) {
      const parent = await db.product.findUnique({
        where: { id: parentProductId },
        include: { variants: { orderBy: [{ type: "asc" }, { color: "asc" }] } },
      });
      if (parent) {
        const product = await db.product.create({
          data: {
            sku,
            name,
            minStock: parent.minStock,
            parentProductId,
            variants: {
              create: parent.variants.map((v) => ({
                color: v.color || "",
                colorHex: v.colorHex,
                type: v.type || "",
                qty: v.qty, // Sync from master
                barcode: null,
              })),
            },
          },
          include: {
            parentProduct: {
              select: { id: true, sku: true, name: true },
            },
            childProducts: {
              select: { id: true, sku: true, name: true },
            },
            variants: true,
          },
        });

        return NextResponse.json(product, { status: 201 });
      }
    }

    const product = await db.product.create({
      data: {
        sku,
        name,
        minStock: minStock ?? 10,
        ...(variants &&
          Array.isArray(variants) &&
          variants.length > 0 && {
            variants: {
              create: variants.map(
                (v: { color?: string; type?: string; colorHex?: string; qty?: number; barcode?: string }) => ({
                  color: v.color || "",
                  colorHex: v.colorHex || "#2d3436",
                  type: v.type || "",
                  qty: v.qty ?? 0,
                  barcode: v.barcode || null,
                })
              ),
            },
          }),
        ...(parts &&
          Array.isArray(parts) &&
          parts.length > 0 && {
            parts: {
              create: parts.map(
                (
                  p: {
                    name: string;
                    barcode?: string;
                    sortOrder: number;
                    partColors?: Array<{
                      color: string;
                      colorHex?: string;
                      qty?: number;
                      minStock?: number;
                      barcode?: string;
                    }>;
                  },
                  idx: number
                ) => ({
                  name: p.name || `Part ${idx + 1}`,
                  barcode: p.barcode || null,
                  sortOrder: p.sortOrder ?? idx,
                  ...(p.partColors &&
                    Array.isArray(p.partColors) &&
                    p.partColors.length > 0 && {
                      partColors: {
                        create: p.partColors.map(
                          (c: { color: string; colorHex?: string; qty?: number; minStock?: number; barcode?: string }) => ({
                        color: c.color || "",
                        colorHex: c.colorHex || "#2d3436",
                        qty: c.qty ?? 0,
                        minStock: c.minStock ?? 10,
                        barcode: c.barcode || null,
                      })
                        ),
                      },
                    }),
                })
              ),
            },
          }),
      },
      include: {
        parentProduct: {
          select: { id: true, sku: true, name: true },
        },
        childProducts: {
          select: { id: true, sku: true, name: true },
        },
        variants: true,
        parts: {
          orderBy: { sortOrder: "asc" },
          include: { partColors: { orderBy: { color: "asc" } } },
        },
      },
    });

    return NextResponse.json(product, { status: 201 });
  } catch (error) {
    console.error("Error creating product:", error);
    return NextResponse.json(
      { error: "Failed to create product" },
      { status: 500 }
    );
  }
}
