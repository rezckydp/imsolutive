'use client';

import { useState, useEffect, useImperativeHandle, forwardRef } from 'react';
import { Info } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface MaterialVariantData {
  id: string;
  label: string;
  stock: number;
  unit?: string;
}

interface MaterialData {
  id: string;
  name: string;
  unit: string;
  variants: MaterialVariantData[];
}

export interface BomRow {
  materialVariantId: string;
  qty: number;
}

export interface BomChecklistHandle {
  getPayload: () => BomRow[];
}

interface Props {
  // Existing BOM rows for this Product, keyed by the Material they belong to
  // so we know which checkbox starts checked. Empty/undefined = no BOM yet.
  initialBom?: Array<{ materialVariantId: string; qty: number; materialVariant?: { materialId: string } }>;
}

interface RowState {
  checked: boolean;
  materialVariantId: string;
  qty: string;
}

export const ProductBomChecklist = forwardRef<BomChecklistHandle, Props>(function ProductBomChecklist(
  { initialBom },
  ref
) {
  const [materials, setMaterials] = useState<MaterialData[]>([]);
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Record<string, RowState>>({});

  useEffect(() => {
    let mounted = true;
    fetch('/api/materials')
      .then((res) => res.json())
      .then((data) => {
        if (!mounted) return;
        const list: MaterialData[] = data.materials || [];
        setMaterials(list);

        const seeded: Record<string, RowState> = {};
        for (const m of list) {
          const existing = (initialBom || []).find((b) =>
            m.variants.some((v) => v.id === b.materialVariantId)
          );
          seeded[m.id] = {
            checked: !!existing,
            materialVariantId: existing?.materialVariantId || m.variants[0]?.id || '',
            qty: existing ? String(existing.qty) : '1',
          };
        }
        setRows(seeded);
      })
      .finally(() => mounted && setLoading(false));
    return () => { mounted = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useImperativeHandle(ref, () => ({
    getPayload: () =>
      Object.values(rows)
        .filter((r) => r.checked && r.materialVariantId)
        .map((r) => ({
          materialVariantId: r.materialVariantId,
          qty: parseInt(r.qty, 10) || 1,
        })),
  }));

  const toggleChecked = (materialId: string) => {
    setRows((prev) => ({
      ...prev,
      [materialId]: { ...prev[materialId], checked: !prev[materialId]?.checked },
    }));
  };

  const updateRow = (materialId: string, field: 'materialVariantId' | 'qty', value: string) => {
    setRows((prev) => ({
      ...prev,
      [materialId]: { ...prev[materialId], [field]: value },
    }));
  };

  if (loading) {
    return (
      <div className="space-y-2">
        <Label className="text-sm font-medium text-[var(--t-heading)]">Material Pelengkap (BOM)</Label>
        <p className="text-xs text-[var(--t-muted)]">Memuat katalog Material...</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Label className="text-sm font-medium text-[var(--t-heading)]">Material Pelengkap (BOM)</Label>

      <div className="flex items-start gap-2 p-2.5 rounded-lg bg-[var(--info)]/5 border border-[var(--info)]/20">
        <Info className="w-3.5 h-3.5 text-[var(--info)] flex-shrink-0 mt-0.5" />
        <p className="text-[11px] text-[var(--t-body)]">
          List material di-pull dari katalog Material di halaman Inventory Management — nambah material baru lewat sana dulu, baru bisa dicentang di sini.
        </p>
      </div>

      {materials.length === 0 ? (
        <p className="text-xs text-[var(--t-muted)] p-2">Belum ada Material di katalog Inventory Management.</p>
      ) : (
        <div className="max-h-[260px] overflow-y-auto space-y-1.5 pr-1" style={{ scrollbarWidth: 'thin', scrollbarColor: '#d1d5db transparent' }}>
          {materials.map((m) => {
            const row = rows[m.id];
            if (!row) return null;
            const totalStock = m.variants.reduce((sum, v) => sum + v.stock, 0);
            return (
              <div key={m.id} className="rounded-lg border border-[var(--bd)] bg-[var(--surface-tint-3)] overflow-hidden">
                <label className="flex items-center gap-2.5 p-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={row.checked}
                    onChange={() => toggleChecked(m.id)}
                    className="w-4 h-4 rounded border-[var(--bd)] accent-[var(--brand)] cursor-pointer flex-shrink-0"
                  />
                  <span className="text-sm text-[var(--t-heading)] flex-1">{m.name}</span>
                  <span className="text-[11px] text-[var(--t-muted)]">stok: {totalStock} {m.unit}</span>
                </label>

                {row.checked && (
                  <div className="flex gap-2 px-2.5 pb-2.5">
                    <div className="flex-1 space-y-1">
                      <Label className="text-[10px] text-[var(--t-body)] uppercase tracking-wider">Variant</Label>
                      <Select
                        value={row.materialVariantId}
                        onValueChange={(v) => updateRow(m.id, 'materialVariantId', v)}
                      >
                        <SelectTrigger className="h-8 text-xs bg-[var(--card)] border-[var(--bd)]">
                          <SelectValue placeholder="Pilih variant..." />
                        </SelectTrigger>
                        <SelectContent>
                          {m.variants.map((v) => (
                            <SelectItem key={v.id} value={v.id}>
                              {v.label} (stok: {v.stock})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="w-24 space-y-1">
                      <Label className="text-[10px] text-[var(--t-body)] uppercase tracking-wider">Qty / pcs</Label>
                      <Input
                        type="number"
                        min={1}
                        value={row.qty}
                        onChange={(e) => updateRow(m.id, 'qty', e.target.value)}
                        className="h-8 text-xs bg-[var(--card)] border-[var(--bd)]"
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
});
