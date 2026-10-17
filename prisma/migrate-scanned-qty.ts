// One-time migration for the Real Stock Scan Pipeline feature
// (ims-real-stock-scan-pipeline-spec.md §3): ProductionItem rows that were
// already Completed before this update already incremented ProductVariant.qty
// under the old behavior, so they must be treated as implicitly fully
// scanned — otherwise they'd show up as false "Nunggu Scan" in the Pipeline.
//
// Run AFTER `bun run db:push` (needs the new scannedQty/closedAt columns to
// exist). Safe to re-run: only touches Completed rows that aren't closed yet.
import { db } from '../src/lib/db';

async function main() {
  const staleCompleted = await db.productionItem.findMany({
    where: { status: 'Completed', closedAt: null },
    select: { id: true, qty: true },
  });

  console.log(`Found ${staleCompleted.length} old Completed row(s) to backfill.`);

  for (const item of staleCompleted) {
    await db.productionItem.update({
      where: { id: item.id },
      data: { scannedQty: item.qty, closedAt: new Date() },
    });
  }

  console.log(`Done — backfilled scannedQty/closedAt on ${staleCompleted.length} row(s).`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
