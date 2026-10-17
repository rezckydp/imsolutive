import { db } from "@/lib/db";
import { getGroupSiblingVariantIds } from "@/lib/stock-sync";

// Real Stock Scan Pipeline (ims-real-stock-scan-pipeline-spec.md §4.5) — the
// one shared formula for "how much of a variant's demand is already covered
// by stock + stuff moving through production", used identically by the
// dashboard Pipeline tab and the Recent Order Summary tab so the two views
// never drift apart on what counts as covered.

export interface PipelineCredit {
  real: number;
  pendingScan: number;
  inProgress: number;
  queue: number;
}

export interface PipelineStatus extends PipelineCredit {
  variantId: string;
  required: number;
  kurang: number;
}

// Raw production-credit numbers per variantId. Pass MASTER/standalone variant
// ids — Print Queue and Production items are always created against the
// master SKU (see resolveToMasterVariantId), so no sibling-id fan-out is
// needed here.
export async function getPipelineCredits(variantIds: string[]): Promise<Record<string, PipelineCredit>> {
  const result: Record<string, PipelineCredit> = {};
  if (variantIds.length === 0) return result;

  for (const id of variantIds) {
    result[id] = { real: 0, pendingScan: 0, inProgress: 0, queue: 0 };
  }

  const [variants, completedOutstanding, inProgressItems, queueItems] = await Promise.all([
    db.productVariant.findMany({
      where: { id: { in: variantIds } },
      select: { id: true, qty: true },
    }),
    db.productionItem.findMany({
      where: { variantId: { in: variantIds }, status: "Completed", closedAt: null },
      select: { variantId: true, qty: true, scannedQty: true, writeOffQty: true },
    }),
    db.productionItem.findMany({
      where: { variantId: { in: variantIds }, status: "In Progress" },
      select: { variantId: true, qty: true },
    }),
    db.printQueueItem.findMany({
      where: { variantId: { in: variantIds } },
      select: { variantId: true, qty: true },
    }),
  ]);

  for (const v of variants) {
    result[v.id].real = v.qty;
  }
  for (const item of completedOutstanding) {
    result[item.variantId].pendingScan += item.qty - item.scannedQty - item.writeOffQty;
  }
  for (const item of inProgressItems) {
    result[item.variantId].inProgress += item.qty;
  }
  for (const item of queueItems) {
    result[item.variantId].queue += item.qty;
  }

  return result;
}

// Full Pipeline-tab status for a set of MASTER variant ids: required =
// MAX(minStock, totalOrderedQty aktif) — demand is summed across sibling
// child-SKU variants too, since an order can be placed against a child SKU
// while stock/production is tracked against the shared master.
export async function getPipelineStatus(masterVariantIds: string[]): Promise<Record<string, PipelineStatus>> {
  const result: Record<string, PipelineStatus> = {};
  if (masterVariantIds.length === 0) return result;

  const siblingToMaster: Record<string, string> = {};
  for (const id of masterVariantIds) {
    const siblings = await getGroupSiblingVariantIds(id);
    for (const sid of siblings) siblingToMaster[sid] = id;
  }
  const allSiblingIds = Object.keys(siblingToMaster);

  const [credits, variants, activeOrderItems] = await Promise.all([
    getPipelineCredits(masterVariantIds),
    db.productVariant.findMany({
      where: { id: { in: masterVariantIds } },
      select: { id: true, product: { select: { minStock: true } } },
    }),
    db.orderItem.findMany({
      where: { variantId: { in: allSiblingIds }, order: { status: { not: "Cancelled" } } },
      select: { variantId: true, qty: true },
    }),
  ]);

  const minStockMap: Record<string, number> = {};
  for (const v of variants) minStockMap[v.id] = v.product.minStock;

  const orderedMap: Record<string, number> = {};
  for (const item of activeOrderItems) {
    const masterId = siblingToMaster[item.variantId];
    if (!masterId) continue;
    orderedMap[masterId] = (orderedMap[masterId] || 0) + item.qty;
  }

  for (const id of masterVariantIds) {
    const c = credits[id];
    const required = Math.max(minStockMap[id] ?? 0, orderedMap[id] ?? 0);
    const covered = c.real + c.pendingScan + c.inProgress + c.queue;
    result[id] = {
      variantId: id,
      required,
      ...c,
      kurang: Math.max(0, required - covered),
    };
  }

  return result;
}
