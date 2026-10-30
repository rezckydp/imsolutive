import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import {
  guardPublicApi,
  publicJson,
  getColorIdByName,
  masterProductSelect,
  serializeProduct,
} from "@/lib/public-api";

// GET all Master/Standalone products with their (pooled) variants — read-only, for bysolutive.id
export async function GET(request: NextRequest) {
  const denied = guardPublicApi(request);
  if (denied) return denied;

  try {
    const [products, colorIdByName] = await Promise.all([
      db.product.findMany({
        where: { parentProductId: null },
        select: masterProductSelect,
        orderBy: { name: "asc" },
      }),
      getColorIdByName(),
    ]);
    return publicJson({ products: products.map((p) => serializeProduct(p, colorIdByName)) });
  } catch (error) {
    console.error("Error in public products API:", error);
    return publicJson({ error: "Failed to fetch products" }, 500);
  }
}
