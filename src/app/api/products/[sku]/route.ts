import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { syncMasterStockToGroup, refreshOrderItemStatuses } from "@/lib/stock-sync";

// GET single product by SKU with variants and group info
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ sku: string }> }
) {
  try {
    const { sku } = await params;
    const product = await db.product.findUnique({
      where: { sku },
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
    });

    if (!product) {
      return NextResponse.json(
        { error: "Product not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(product);
  } catch (error) {
    console.error("Error fetching product:", error);
    return NextResponse.json(
      { error: "Failed to fetch product" },
      { status: 500 }
    );
  }
}

// PUT update product and its variants (with group sync for masters)
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ sku: string }> }
) {
  try {
    const { sku } = await params;
    const body = await request.json();
    const { sku: newSku, name, minStock, variants, parts } = body;

    // Check product exists
    const existing = await db.product.findUnique({
      where: { sku },
      include: {
        variants: true,
        childProducts: { select: { id: true } },
      },
    });
    if (!existing) {
      return NextResponse.json(
        { error: "Product not found" },
        { status: 404 }
      );
    }

    // Handle SKU change
    const trimmedNewSku = typeof newSku === 'string' ? newSku.trim() : '';
    if (trimmedNewSku && trimmedNewSku !== sku) {
      // Check if new SKU already exists
      const skuConflict = await db.product.findUnique({ where: { sku: trimmedNewSku } });
      if (skuConflict) {
        return NextResponse.json(
          { error: `SKU "${trimmedNewSku}" already exists. Please use a different SKU.` },
          { status: 409 }
        );
      }
      // Update SKU
      await db.product.update({
        where: { sku },
        data: { sku: trimmedNewSku },
      });
    }

    // Determine if this product is a master (has children or no parent)
    const isMaster = !existing.parentProductId;
    const currentSku = trimmedNewSku || sku;

    // Update product fields
    await db.product.update({
      where: { sku: currentSku },
      data: {
        ...(name !== undefined && { name }),
        ...(minStock !== undefined && { minStock }),
      },
    });

    // If master and minStock changed, sync to all children
    if (isMaster && minStock !== undefined && existing.childProducts.length > 0) {
      await db.product.updateMany({
        where: { parentProductId: existing.id },
        data: { minStock },
      });
    }

    // Handle variants if provided
    if (variants && Array.isArray(variants)) {
      const existingVariantIds = new Set(existing.variants.map((v) => v.id));
      const changedVariantIds: string[] = []; // Track variants whose qty changed

      for (const v of variants) {
        if (v._delete) {
          // Delete variant
          if (v.id) {
            await db.productVariant.delete({ where: { id: v.id } });
          }
        } else if (v.id) {
          // Update existing variant
          const oldVariant = existing.variants.find((ev) => ev.id === v.id);

          await db.productVariant.update({
            where: { id: v.id },
            data: {
              ...(v.color !== undefined && { color: v.color }),
              ...(v.colorHex !== undefined && { colorHex: v.colorHex }),
              ...(v.type !== undefined && { type: v.type }),
              ...(v.qty !== undefined && { qty: v.qty }),
              ...(v.barcode !== undefined && { barcode: v.barcode || null }),
            },
          });

          // If this is a master and qty changed, sync to all children variants
          if (
            isMaster &&
            v.qty !== undefined &&
            oldVariant &&
            v.qty !== oldVariant.qty
          ) {
            await syncMasterStockToGroup(existing.id, v.color || "", v.type || "", v.qty);
            changedVariantIds.push(v.id);
          } else if (v.qty !== undefined && oldVariant && v.qty !== oldVariant.qty) {
            // Non-master product with qty change
            changedVariantIds.push(v.id);
          }
        } else {
          // Create new variant
          const newVariant = await db.productVariant.create({
            data: {
              productId: existing.id,
              color: v.color || "",
              colorHex: v.colorHex || "#2d3436",
              type: v.type || "",
              qty: v.qty ?? 0,
              barcode: v.barcode || null,
            },
          });

          // If master, also create the same variant on all children with synced qty
          if (isMaster && existing.childProducts.length > 0) {
            for (const child of existing.childProducts) {
              await db.productVariant.create({
                data: {
                  productId: child.id,
                  color: v.color || "",
                  colorHex: v.colorHex || "#2d3436",
                  type: v.type || "",
                  qty: v.qty ?? 0,
                  barcode: null,
                },
              });
            }
          }
        }
      }

      // After all variant updates, refresh order statuses for changed variants
      for (const variantId of changedVariantIds) {
        await refreshOrderItemStatuses(variantId);
      }
    }

    // Handle parts if provided
    if (parts && Array.isArray(parts)) {
      const existingParts = await db.part.findMany({
        where: { productId: existing.id },
        include: { partColors: true },
      });
      const existingPartIds = new Set(existingParts.map((p) => p.id));

      for (const p of parts) {
        if (p._delete) {
          if (p.id) {
            await db.part.delete({ where: { id: p.id } });
          }
        } else if (p.id) {
          // Update existing part
          await db.part.update({
            where: { id: p.id },
            data: {
              ...(p.name !== undefined && { name: p.name }),
              ...(p.barcode !== undefined && { barcode: p.barcode || null }),
              ...(p.sortOrder !== undefined && { sortOrder: p.sortOrder }),
            },
          });

          // Handle part colors
          if (p.partColors && Array.isArray(p.partColors)) {
            const existingColors = await db.partColor.findMany({
              where: { partId: p.id },
            });
            const existingColorIds = new Set(existingColors.map((c) => c.id));

            for (const c of p.partColors) {
              if (c._delete) {
                if (c.id) await db.partColor.delete({ where: { id: c.id } });
              } else if (c.id) {
                await db.partColor.update({
                  where: { id: c.id },
                  data: {
                    ...(c.color !== undefined && { color: c.color }),
                    ...(c.colorHex !== undefined && { colorHex: c.colorHex }),
                    ...(c.qty !== undefined && { qty: c.qty }),
                    ...(c.minStock !== undefined && { minStock: c.minStock }),
                    ...(c.barcode !== undefined && { barcode: c.barcode || null }),
                  },
                });
              } else {
                await db.partColor.create({
                  data: {
                    partId: p.id,
                    color: c.color || "",
                    colorHex: c.colorHex || "#2d3436",
                    qty: c.qty ?? 0,
                    minStock: c.minStock ?? 10,
                    barcode: c.barcode || null,
                  },
                });
              }
            }
          }
        } else {
          // Create new part
          const newPart = await db.part.create({
            data: {
              productId: existing.id,
              name: p.name || "",
              barcode: p.barcode || null,
              sortOrder: p.sortOrder ?? 0,
            },
          });

          // Create part colors if provided
          if (p.partColors && Array.isArray(p.partColors)) {
            for (const c of p.partColors) {
              if (!c._delete) {
                await db.partColor.create({
                  data: {
                    partId: newPart.id,
                    color: c.color || "",
                    colorHex: c.colorHex || "#2d3436",
                    qty: c.qty ?? 0,
                    minStock: c.minStock ?? 10,
                    barcode: c.barcode || null,
                  },
                });
              }
            }
          }
        }
      }
    }

    // Return updated product with variants, parts, partColors, and group info
    const updated = await db.product.findUnique({
      where: { sku: currentSku },
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
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Error updating product:", error);
    return NextResponse.json(
      { error: "Failed to update product" },
      { status: 500 }
    );
  }
}

// DELETE product by SKU (cascades to variants, and children if master)
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ sku: string }> }
) {
  try {
    const { sku } = await params;

    const existing = await db.product.findUnique({ where: { sku } });
    if (!existing) {
      return NextResponse.json(
        { error: "Product not found" },
        { status: 404 }
      );
    }

    await db.product.delete({ where: { sku } });

    return NextResponse.json({ message: "Product deleted successfully" });
  } catch (error) {
    console.error("Error deleting product:", error);
    return NextResponse.json(
      { error: "Failed to delete product" },
      { status: 500 }
    );
  }
}
