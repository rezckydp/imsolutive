import { db } from '@/lib/db';

// Every entity type restore knows how to handle. Adding a new module to
// activity logging means adding its Prisma model here too.
export const ENTITY_MODELS = {
  Product: db.product,
  ProductVariant: db.productVariant,
  Order: db.order,
  OrderItem: db.orderItem,
  PrintQueueItem: db.printQueueItem,
  ProductionItem: db.productionItem,
  Printer: db.printer,
  PrinterMaintenance: db.printerMaintenance,
  Color: db.color,
  StockOpname: db.stockOpname,
  StockOpnameItem: db.stockOpnameItem,
} as const;

export type EntityType = keyof typeof ENTITY_MODELS;

interface LogActivityParams {
  userId: string | null;
  username: string;
  action: 'CREATE' | 'UPDATE' | 'DELETE';
  entityType: EntityType;
  entityId: string;
  entityLabel?: string;
  before?: unknown;
  after?: unknown;
}

// Snapshot helpers — pick only the entity's own scalar columns (never
// relations) so a snapshot can be fed straight back into model.update()/
// model.create() during a restore.

export function snapshotProduct(p: {
  id: string; sku: string; name: string; minStock: number;
  estPrintMinutes: number | null; parentProductId: string | null;
  createdAt: Date; updatedAt: Date;
}) {
  return {
    id: p.id, sku: p.sku, name: p.name, minStock: p.minStock,
    estPrintMinutes: p.estPrintMinutes, parentProductId: p.parentProductId,
    createdAt: p.createdAt, updatedAt: p.updatedAt,
  };
}

export function snapshotVariant(v: {
  id: string; productId: string; color: string; colorHex: string; type: string;
  qty: number; barcode: string | null; createdAt: Date; updatedAt: Date;
}) {
  return {
    id: v.id, productId: v.productId, color: v.color, colorHex: v.colorHex,
    type: v.type, qty: v.qty, barcode: v.barcode,
    createdAt: v.createdAt, updatedAt: v.updatedAt,
  };
}

export function snapshotOrder(o: {
  id: string; orderNo: string; status: string; createdAt: Date; updatedAt: Date;
}) {
  return { id: o.id, orderNo: o.orderNo, status: o.status, createdAt: o.createdAt, updatedAt: o.updatedAt };
}

export function snapshotOrderItem(i: {
  id: string; orderId: string; variantId: string; qty: number; status: string;
  note: string; createdAt: Date;
}) {
  return {
    id: i.id, orderId: i.orderId, variantId: i.variantId, qty: i.qty,
    status: i.status, note: i.note, createdAt: i.createdAt,
  };
}

export function snapshotStockOpname(s: {
  id: string; sessionNo: string; type: string; status: string; notes: string;
  totalItems: number; totalDiff: number; startedAt: Date; completedAt: Date | null;
  createdAt: Date; updatedAt: Date;
}) {
  return {
    id: s.id, sessionNo: s.sessionNo, type: s.type, status: s.status, notes: s.notes,
    totalItems: s.totalItems, totalDiff: s.totalDiff, startedAt: s.startedAt,
    completedAt: s.completedAt, createdAt: s.createdAt, updatedAt: s.updatedAt,
  };
}

export function snapshotStockOpnameItem(i: {
  id: string; opnameId: string; variantId: string; systemQty: number;
  actualQty: number; difference: number; adjusted: boolean;
  createdAt: Date; updatedAt: Date;
}) {
  return {
    id: i.id, opnameId: i.opnameId, variantId: i.variantId, systemQty: i.systemQty,
    actualQty: i.actualQty, difference: i.difference, adjusted: i.adjusted,
    createdAt: i.createdAt, updatedAt: i.updatedAt,
  };
}

// Records one create/edit/delete for the Activity Log. Never throws — a
// logging failure should never take down the actual mutation it's recording.
export async function logActivity(params: LogActivityParams): Promise<void> {
  try {
    await db.activityLog.create({
      data: {
        userId: params.userId,
        username: params.username,
        action: params.action,
        entityType: params.entityType,
        entityId: params.entityId,
        entityLabel: params.entityLabel || '',
        beforeData: params.before !== undefined ? JSON.stringify(params.before) : null,
        afterData: params.after !== undefined ? JSON.stringify(params.after) : null,
      },
    });
  } catch (error) {
    console.error('Failed to write activity log:', error);
  }
}
