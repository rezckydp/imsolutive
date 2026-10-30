import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import {
  guardPublicApi,
  publicJson,
  getColorIdByName,
  masterProductSelect,
  serializeProduct,
} from "@/lib/public-api";

// GET one product by id — a child SKU resolves to its Master, since stock is pooled there
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = guardPublicApi(request);
  if (denied) return denied;

  try {
    const { id } = await params;
    const found = await db.product.findUnique({
      where: { id },
      select: { id: true, parentProductId: true },
    });
    if (!found) {
      return publicJson({ error: "Not found" }, 404);
    }

    const [product, colorIdByName] = await Promise.all([
      db.product.findUnique({
        where: { id: found.parentProductId || found.id },
        select: masterProductSelect,
      }),
      getColorIdByName(),
    ]);
    if (!product) {
      return publicJson({ error: "Not found" }, 404);
    }
    return publicJson({ product: serializeProduct(product, colorIdByName) });
  } catch (error) {
    console.error("Error in public product API:", error);
    return publicJson({ error: "Failed to fetch product" }, 500);
  }
}
