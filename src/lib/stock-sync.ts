import { db } from "@/lib/db";

/**
 * Get all product IDs in a group (master + all variants).
 * If standalone, returns only the product itself.
 */
export async function getProductGroup(productId: string): Promise<string[]> {
  const product = await db.product.findUnique({
    where: { id: productId },
    select: { id: true, parentProductId: true },
  });

  if (!product) return [productId];

  // If this product is a variant, find the master
  const masterId = product.parentProductId || product.id;

  // Get all products in the group (master + all children)
  const group = await db.product.findMany({
    where: {
      OR: [
        { id: masterId },
        { parentProductId: masterId },
      ],
    },
    select: { id: true },
  });

  return group.map((p) => p.id);
}

/**
 * Get all variant IDs for a product group (across all products in the group).
 * Useful for refreshing order statuses across the entire group.
 */
export async function getGroupVariantIds(productId: string): Promise<string[]> {
  const groupIds = await getProductGroup(productId);

  const variants = await db.productVariant.findMany({
    where: { productId: { in: groupIds } },
    select: { id: true },
  });

  return variants.map((v) => v.id);
}

/**
 * Get a display label for a variant based on its color and type.
 * - Both color and type: "Red - XL"
 * - Only color: "Red"
 * - Only type: "XL"
 * - Neither: "Default"
 */
export function getVariantLabel(color: string, type: string): string {
  const hasColor = color && color.trim() !== "";
  const hasType = type && type.trim() !== "";
  if (hasColor && hasType) return `${color} - ${type}`;
  if (hasColor) return color;
  if (hasType) return type;
  return "Default";
}

/**
 * Sync stock change across all products in a group.
 * Matches by color AND type to find the corresponding variant in each product.
 *
 * @param variantId - The variant that was changed
 * @param delta - The stock change (positive = add, negative = deduct)
 */
export async function syncStockToGroup(
  variantId: string,
  delta: number
): Promise<void> {
  // Get the variant and its product
  const variant = await db.productVariant.findUnique({
    where: { id: variantId },
    include: { product: true },
  });

  if (!variant) return;

  // Get all product IDs in the group
  const groupIds = await getProductGroup(variant.product.id);

  // If standalone or only 1 product in group, no sync needed
  if (groupIds.length <= 1) return;

  // Find matching variants in all other products in the group (match by color AND type)
  const matchingVariants = await db.productVariant.findMany({
    where: {
      productId: { in: groupIds },
      color: variant.color,
      type: variant.type,
    },
  });

  // Apply the same delta to all matching variants (excluding the one already changed)
  for (const mv of matchingVariants) {
    if (mv.id !== variantId) {
      await db.productVariant.update({
        where: { id: mv.id },
        data: { qty: { increment: delta } },
      });
    }
  }
}

/**
 * Sync variant stock from master to all its children.
 * Called when master's variant qty is edited.
 *
 * @param masterProductId - The master product ID
 * @param color - The color name of the variant to sync
 * @param type - The type name of the variant to sync
 * @param newQty - The new qty to set on all matching variants
 */
export async function syncMasterStockToGroup(
  masterProductId: string,
  color: string,
  type: string,
  newQty: number
): Promise<void> {
  const group = await db.product.findMany({
    where: {
      OR: [
        { id: masterProductId },
        { parentProductId: masterProductId },
      ],
    },
    select: { id: true },
  });

  const groupIds = group.map((p) => p.id);

  // Update all matching variants (by color AND type) across the group
  await db.productVariant.updateMany({
    where: {
      productId: { in: groupIds },
      color,
      type,
    },
    data: { qty: newQty },
  });
}

/**
 * Refresh order item statuses for a specific variant based on current physical stock.
 * Physical stock = variant.qty + sum(all active order deductions).
 * Uses FIFO: oldest items get fulfilled first.
 * Promotes "Not Ready" → "Ready" and "In Queue" → "Ready" when stock is sufficient.
 * Also demotes "Ready" → "Not Ready" when stock is no longer sufficient.
 */
export async function refreshOrderItemStatuses(variantId: string): Promise<void> {
  try {
    const variant = await db.productVariant.findUnique({
      where: { id: variantId },
    });
    if (!variant) return;

    // Get ALL active order items for this variant (not cancelled)
    const activeItems = await db.orderItem.findMany({
      where: {
        variantId,
        order: { status: { not: "Cancelled" } },
      },
      orderBy: { createdAt: "asc" }, // FIFO
    });

    if (activeItems.length === 0) return;

    // Physical stock = variant.qty (which has deductions baked in) + sum(all active order qty)
    const totalOrdered = activeItems.reduce((s, i) => s + i.qty, 0);
    const physicalStock = variant.qty + totalOrdered;

    // Go through items in FIFO order, fulfill as many as possible
    let available = physicalStock;
    for (const item of activeItems) {
      if (available >= item.qty) {
        // Enough stock — promote/maintain Ready
        if (item.status !== "Ready") {
          await db.orderItem.update({
            where: { id: item.id },
            data: { status: "Ready" },
          });
        }
        available -= item.qty;
      } else {
        // Not enough stock — demote/maintain Not Ready
        if (item.status === "Ready" || item.status === "In Queue") {
          await db.orderItem.update({
            where: { id: item.id },
            data: { status: "Not Ready" },
          });
        }
        // Already Not Ready — no update needed
      }
    }
  } catch (error) {
    console.error(`Error refreshing order statuses for variant ${variantId}:`, error);
    // Don't throw — let other refreshes continue
  }
}

/**
 * When qty is added to the Print Queue for a variant, mark that many
 * "Not Ready" order items (FIFO, oldest first, whole-item only) as "In Queue".
 * This keeps Recent Order's "In Queue" status in sync no matter where the
 * Print Queue item was created from (manual add, or the Send-to-Queue button).
 */
export async function syncOrderItemsToQueue(variantId: string, qtyQueued: number): Promise<void> {
  if (qtyQueued <= 0) return;
  try {
    const candidates = await db.orderItem.findMany({
      where: {
        variantId,
        status: "Not Ready",
        order: { status: { not: "Cancelled" } },
      },
      orderBy: { createdAt: "asc" }, // FIFO — oldest waiting order gets queued first
    });

    let remaining = qtyQueued;
    for (const item of candidates) {
      if (remaining <= 0) break;
      if (item.qty <= remaining) {
        await db.orderItem.update({ where: { id: item.id }, data: { status: "In Queue" } });
        remaining -= item.qty;
      }
      // If an item's qty is bigger than what's left of this queue addition,
      // skip it (can't partially queue a single order item) and keep looking
      // at smaller ones further down the FIFO line.
    }
  } catch (error) {
    console.error(`Error syncing order items to queue for variant ${variantId}:`, error);
  }
}

/**
 * When qty is removed from the Print Queue for a variant (item deleted or
 * qty reduced), revert that many "In Queue" order items back to "Not Ready".
 * There's no direct link between a PrintQueueItem and the OrderItem(s) it
 * represents, so this reverts the most recently created "In Queue" orders
 * first — a reasonable approximation since those are typically the last
 * ones queued.
 */
export async function revertOrderItemsFromQueue(variantId: string, qtyRemoved: number): Promise<void> {
  if (qtyRemoved <= 0) return;
  try {
    const candidates = await db.orderItem.findMany({
      where: {
        variantId,
        status: "In Queue",
        order: { status: { not: "Cancelled" } },
      },
      orderBy: { createdAt: "desc" },
    });

    let remaining = qtyRemoved;
    for (const item of candidates) {
      if (remaining <= 0) break;
      if (item.qty <= remaining) {
        await db.orderItem.update({ where: { id: item.id }, data: { status: "Not Ready" } });
        remaining -= item.qty;
      }
    }
  } catch (error) {
    console.error(`Error reverting order items from queue for variant ${variantId}:`, error);
  }
}
/**
 * When qty is sent from Print Queue → Production, promote that many
 * "In Queue" order items (FIFO, whole-item only) to "In Production".
 */
export async function promoteOrderItemsToProduction(variantId: string, qty: number): Promise<void> {
  if (qty <= 0) return;
  try {
    const candidates = await db.orderItem.findMany({
      where: {
        variantId,
        status: "In Queue",
        order: { status: { not: "Cancelled" } },
      },
      orderBy: { createdAt: "asc" },
    });

    let remaining = qty;
    for (const item of candidates) {
      if (remaining <= 0) break;
      if (item.qty <= remaining) {
        await db.orderItem.update({ where: { id: item.id }, data: { status: "In Production" } });
        remaining -= item.qty;
      }
    }
  } catch (error) {
    console.error(`Error promoting order items to production for variant ${variantId}:`, error);
  }
}

/**
 * When a Production item is sent back to Print Queue, demote that many
 * "In Production" order items (FIFO, whole-item only) back to "In Queue".
 */
export async function demoteProductionItemsToQueue(variantId: string, qty: number): Promise<void> {
  if (qty <= 0) return;
  try {
    const candidates = await db.orderItem.findMany({
      where: {
        variantId,
        status: "In Production",
        order: { status: { not: "Cancelled" } },
      },
      orderBy: { createdAt: "desc" },
    });

    let remaining = qty;
    for (const item of candidates) {
      if (remaining <= 0) break;
      if (item.qty <= remaining) {
        await db.orderItem.update({ where: { id: item.id }, data: { status: "In Queue" } });
        remaining -= item.qty;
      }
    }
  } catch (error) {
    console.error(`Error demoting production items to queue for variant ${variantId}:`, error);
  }
}
/**
 * Full repair pass for one variant: recompute the In Queue / In Production
 * split from scratch based on current Print Queue + Production Item totals.
 * Walks active (non-Ready) order items oldest-first, allocates the first
 * `productionQty` worth to "In Production", the next `queuedQty` worth to
 * "In Queue", and leaves the remainder as "Not Ready". Safe to re-run —
 * used by the manual "Sync Status" repair action.
 */
export async function resyncOrderItemStatuses(
  variantId: string,
  queuedQty: number,
  productionQty: number
): Promise<void> {
  try {
    const candidates = await db.orderItem.findMany({
      where: {
        variantId,
        status: { in: ["Not Ready", "In Queue", "In Production"] },
        order: { status: { not: "Cancelled" } },
      },
      orderBy: { createdAt: "asc" }, // FIFO
    });
    if (candidates.length === 0) return;

    let productionBudget = productionQty;
    let queueBudget = queuedQty;

    for (const item of candidates) {
      let targetStatus: "In Production" | "In Queue" | "Not Ready" = "Not Ready";
      if (item.qty <= productionBudget) {
        targetStatus = "In Production";
        productionBudget -= item.qty;
      } else if (item.qty <= queueBudget) {
        targetStatus = "In Queue";
        queueBudget -= item.qty;
      }
      if (item.status !== targetStatus) {
        await db.orderItem.update({ where: { id: item.id }, data: { status: targetStatus } });
      }
    }
  } catch (error) {
    console.error(`Error resyncing order item statuses for variant ${variantId}:`, error);
  }
}

/**
 * Refresh order statuses for ALL variants that have active order items.
 * Useful for dashboard load to ensure all statuses are up-to-date.
 */
export async function refreshAllOrderStatuses(): Promise<void> {
  try {
    // Find all active order items (non-cancelled, any status) and collect unique variant IDs
    const activeItems = await db.orderItem.findMany({
      where: {
        order: { status: { not: "Cancelled" } },
      },
      select: { variantId: true },
    });

    // Deduplicate variant IDs using Set (more reliable than Prisma distinct in SQLite)
    const variantIds = [...new Set(activeItems.map((i) => i.variantId))];

    // Refresh each variant's order statuses
    for (const variantId of variantIds) {
      await refreshOrderItemStatuses(variantId);
    }
  } catch (error) {
    console.error("Error in refreshAllOrderStatuses:", error);
    // Don't throw — let dashboard continue with potentially stale data
  }
}
