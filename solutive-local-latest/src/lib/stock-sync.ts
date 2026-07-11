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
