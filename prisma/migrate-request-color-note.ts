// One-time migration for ims-feature-custom-engrave-request-warna.md §A:
// the old "Request Color" trigger was detected by "req" appearing in the
// variant's color or type text (no DB flag at all), replaced here by an
// explicit `requestColorNote` toggle per variant. Backfills that flag on
// every existing variant that already matches the old pattern, so their
// behavior stays exactly the same without anyone having to re-configure
// them by hand.
//
// Run AFTER `bun run db:push` (needs the new requestColorNote column to
// exist). Safe to re-run: only flips variants that still need it.
import { db } from '../src/lib/db';

function looksLikeOldRequestColor(color: string, type: string): boolean {
  return color.toLowerCase().includes('req') || type.toLowerCase().includes('req');
}

async function main() {
  const variants = await db.productVariant.findMany({
    where: { requestColorNote: false },
    select: { id: true, color: true, type: true, product: { select: { sku: true } } },
  });

  const toFlip = variants.filter((v) => looksLikeOldRequestColor(v.color, v.type));
  console.log(`Found ${toFlip.length} variant(s) matching the old "req" pattern out of ${variants.length} checked.`);

  for (const v of toFlip) {
    await db.productVariant.update({
      where: { id: v.id },
      data: { requestColorNote: true },
    });
    console.log(`  - ${v.product.sku}: "${v.color}" / "${v.type}"`);
  }

  console.log(`Done — set requestColorNote=true on ${toFlip.length} variant(s).`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
