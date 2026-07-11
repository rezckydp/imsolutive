import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET lookup product variant by barcode or SKU
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const code = searchParams.get("code");

    if (!code) {
      return NextResponse.json(
        { error: "Query parameter 'code' is required" },
        { status: 400 }
      );
    }

    // Try to find by barcode on variant first
    let variant = await db.productVariant.findFirst({
      where: { barcode: code },
      include: { product: true },
    });

    if (!variant) {
      // Try to find product by SKU
      const product = await db.product.findUnique({
        where: { sku: code.toUpperCase() },
        include: { variants: true },
      });

      if (product && product.variants.length > 0) {
        // Return all variants for the SKU
        return NextResponse.json({
          sku: product.sku,
          name: product.name,
          minStock: product.minStock,
          variants: product.variants,
        });
      }

      return NextResponse.json(
        { error: "Product not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      variantId: variant.id,
      sku: variant.product.sku,
      name: variant.product.name,
      color: variant.color,
      colorHex: variant.colorHex,
      type: variant.type,
      qty: variant.qty,
      barcode: variant.barcode,
    });
  } catch (error) {
    console.error("Error looking up barcode:", error);
    return NextResponse.json(
      { error: "Failed to lookup barcode" },
      { status: 500 }
    );
  }
}
