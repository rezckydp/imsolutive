import { db } from "@/lib/db";
import type { FixedPackage, BulkTier } from "@/lib/bundle-pricing";

export interface BundleCategoryDTO {
  id: string;
  code: string;
  name: string;
  normalPrice: number;
  bulkMinQty: number | null;
  bulkUnitPrice: number | null;
  bulkTierName: string | null;
}

export interface BundleEngineConfig {
  categories: BundleCategoryDTO[];
  packages: FixedPackage[];
  bulkTiers: BulkTier[];
  normalPriceByCategory: Record<string, number>;
  categoryNameByCode: Record<string, string>;
  categoryByCode: Map<string, BundleCategoryDTO>;
}

// Loads BundleCategory/BundlePackage/BundlePackageRequirement from the DB
// and shapes them into the plain structures src/lib/bundle-pricing.ts's
// engine expects — the ONLY place that bridges Prisma rows to the pure
// pricing engine, reused by both /api/bundle/config (client live preview)
// and /api/pos/checkout (server-side validation), so the two can never
// drift apart.
export async function loadBundleEngineConfig(): Promise<BundleEngineConfig> {
  const [categoryRows, packageRows] = await Promise.all([
    db.bundleCategory.findMany({ orderBy: { name: "asc" } }),
    db.bundlePackage.findMany({
      include: { requirements: { include: { category: true } } },
      orderBy: { price: "asc" },
    }),
  ]);

  const categories: BundleCategoryDTO[] = categoryRows.map((c) => ({
    id: c.id,
    code: c.code,
    name: c.name,
    normalPrice: c.normalPrice,
    bulkMinQty: c.bulkMinQty,
    bulkUnitPrice: c.bulkUnitPrice,
    bulkTierName: c.bulkTierName,
  }));

  const normalPriceByCategory: Record<string, number> = {};
  const categoryNameByCode: Record<string, string> = {};
  const categoryByCode = new Map<string, BundleCategoryDTO>();
  const bulkTiers: BulkTier[] = [];
  for (const c of categories) {
    normalPriceByCategory[c.code] = c.normalPrice;
    categoryNameByCode[c.code] = c.name;
    categoryByCode.set(c.code, c);
    if (c.bulkMinQty != null && c.bulkUnitPrice != null) {
      bulkTiers.push({ categoryCode: c.code, name: c.bulkTierName || c.name, minQty: c.bulkMinQty, unitPrice: c.bulkUnitPrice });
    }
  }

  const packages: FixedPackage[] = packageRows.map((p) => ({
    code: p.code,
    name: p.name,
    price: p.price,
    requirements: Object.fromEntries(p.requirements.map((r) => [r.category.code, r.qty])),
  }));

  return { categories, packages, bulkTiers, normalPriceByCategory, categoryNameByCode, categoryByCode };
}
