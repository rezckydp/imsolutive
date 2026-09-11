import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAdmin } from '@/lib/current-user';
import { ENTITY_MODELS, type EntityType } from '@/lib/activity-log';

// POST restore an activity log entry to its previous state — Admin only.
//
// - UPDATE entries: the entity is set back to its `beforeData` snapshot.
// - DELETE entries: the entity is re-created from its `beforeData` snapshot
//   (same id, so anything still referencing it keeps working).
// - CREATE entries: "restoring" means undoing the creation, i.e. deleting it.
//
// Known limitation: if the original change cascade-deleted related rows
// (e.g. deleting a Product also deletes its ProductVariants via onDelete:
// Cascade), this only restores the logged entity itself — cascade-deleted
// children are not automatically brought back.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = requireAdmin(request);
  if (!admin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;
  const log = await db.activityLog.findUnique({ where: { id } });
  if (!log) {
    return NextResponse.json({ error: 'Log tidak ditemukan' }, { status: 404 });
  }
  if (log.restoredAt) {
    return NextResponse.json({ error: 'Sudah pernah di-restore sebelumnya' }, { status: 400 });
  }

  const model = ENTITY_MODELS[log.entityType as EntityType] as {
    create: (args: { data: Record<string, unknown> }) => Promise<unknown>;
    update: (args: { where: { id: string }; data: Record<string, unknown> }) => Promise<unknown>;
    delete: (args: { where: { id: string } }) => Promise<unknown>;
  } | undefined;
  if (!model) {
    return NextResponse.json({ error: `Entity type "${log.entityType}" tidak didukung untuk restore` }, { status: 400 });
  }

  const before = log.beforeData ? (JSON.parse(log.beforeData) as Record<string, unknown>) : null;

  try {
    if (log.action === 'DELETE') {
      if (!before) {
        return NextResponse.json({ error: 'Tidak ada data sebelumnya untuk direstore' }, { status: 400 });
      }
      await model.create({ data: before });
    } else if (log.action === 'UPDATE') {
      if (!before) {
        return NextResponse.json({ error: 'Tidak ada data sebelumnya untuk direstore' }, { status: 400 });
      }
      const { id: _id, ...rest } = before;
      await model.update({ where: { id: log.entityId }, data: rest });
    } else if (log.action === 'CREATE') {
      await model.delete({ where: { id: log.entityId } });
    }
  } catch (error) {
    console.error('Restore failed:', error);
    return NextResponse.json({ error: 'Gagal restore — entity mungkin sudah berubah lagi setelahnya' }, { status: 409 });
  }

  await db.activityLog.update({
    where: { id },
    data: { restoredAt: new Date(), restoredBy: admin.username },
  });

  return NextResponse.json({ success: true });
}
