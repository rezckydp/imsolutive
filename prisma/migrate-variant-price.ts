// One-time migration for the Variant Matrix feature: price moves from
// Product.price to ProductVariant.price (see variant-matrix-spec.md).
//
// MUST be run AFTER `bun run db:generate` (so ProductVariant.price exists on
// the generated client) but BEFORE `bun run db:push` (which physically drops
// the Product.price column once the schema no longer declares it). Reads the
// old column via raw SQL specifically so it still works even though the
// Prisma Client's TypeScript types no longer expose Product.price.
//
// Safe to re-run: only fills ProductVariant rows that are still unpriced.
import { db } from '../src/lib/db';

async function main() {
  let products: Array<{ id: string; price: number | null }>;
  try {
    products = await db.$queryRawUnsafe<Array<{ id: string; price: number | null }>>(
      'SELECT id, price FROM Product WHERE price IS NOT NULL'
    );
  } catch (error) {
    console.error(
      '\nFailed to read Product.price — if you already ran `bun run db:push`, ' +
        'that column is gone and this migration can no longer recover its values.\n'
    );
    throw error;
  }

  console.log(`Found ${products.length} Product row(s) with a price to migrate.`);

  let updatedVariants = 0;
  for (const p of products) {
    if (p.price == null) continue;
    const result = await db.productVariant.updateMany({
      where: { productId: p.id, price: null },
      data: { price: p.price },
    });
    updatedVariants += result.count;
  }

  console.log(`Done — set price on ${updatedVariants} ProductVariant row(s).`);
  console.log('Now safe to run: bun run db:push');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
