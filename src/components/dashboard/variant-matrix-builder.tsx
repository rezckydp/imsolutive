'use client';

import { useState, useImperativeHandle, forwardRef, useMemo } from 'react';
import { Plus, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

// ============ TYPES ============

export interface MatrixRow {
  id?: string;
  variasi1: string; // '' if this combo has no Variasi 1 — stored in ProductVariant.type
  color: string;
  colorHex: string;
  price: string; // controlled-input string; parsed to Int on submit
  qty: number;
  barcode: string;
}

export interface MatrixBuilderHandle {
  getRows: () => MatrixRow[];
  getVariasi1Name: () => string;
}

interface ColorPreset {
  name: string;
  hex: string;
}

interface Props {
  masterSku: string;
  initialRows: MatrixRow[];
  initialVariasi1Name: string;
  dbColors: ColorPreset[];
  /**
   * Child SKU (Master-Child) — combinations (Variasi 1 options + colors) and
   * qty are synced from the Master and can't be added/removed/edited here;
   * only price and barcode are this SKU's own (variant-matrix-spec.md: price
   * is never inherited Master -> children).
   */
  childMode?: boolean;
}

function slug(s: string): string {
  return s.trim().toUpperCase().replace(/\s+/g, '-').replace(/[^A-Z0-9-]/g, '');
}

function suggestBarcode(masterSku: string, variasi1: string, color: string): string {
  const parts = [slug(masterSku)];
  if (variasi1.trim()) parts.push(slug(variasi1));
  parts.push(slug(color));
  return parts.filter(Boolean).join('-');
}

// Builds a Prisma-ready `variants` array for PUT /api/products/[sku] — upserts
// every row still present, and marks any original id missing from the final
// rows as deleted. `type` carries the Variasi 1 label (field already exists
// on ProductVariant — see variant-matrix-spec.md, no new column needed).
export function buildVariantMatrixPayload(
  originalVariantIds: string[],
  rows: MatrixRow[]
): Array<Record<string, unknown>> {
  const finalIds = new Set(rows.filter((r) => r.id).map((r) => r.id));
  const deleted = originalVariantIds
    .filter((id) => !finalIds.has(id))
    .map((id) => ({ id, _delete: true }));
  const upserts = rows.map((r) => ({
    ...(r.id && { id: r.id }),
    color: r.color,
    colorHex: r.colorHex,
    type: r.variasi1,
    qty: r.qty,
    barcode: r.barcode.trim() || null,
    price: r.price.trim() ? parseInt(r.price, 10) : null,
  }));
  return [...upserts, ...deleted];
}

// ============ COMPONENT ============

export const VariantMatrixBuilder = forwardRef<MatrixBuilderHandle, Props>(function VariantMatrixBuilder(
  { masterSku, initialRows, initialVariasi1Name, dbColors, childMode },
  ref
) {
  const [variasi1Name, setVariasi1Name] = useState(initialVariasi1Name);
  const [rows, setRows] = useState<MatrixRow[]>(initialRows);
  const [newOptionInput, setNewOptionInput] = useState('');
  const [applyPrice, setApplyPrice] = useState('');
  const [applyStock, setApplyStock] = useState('');
  const [applyBarcode, setApplyBarcode] = useState('');

  useImperativeHandle(ref, () => ({
    getRows: () => rows,
    getVariasi1Name: () => variasi1Name,
  }));

  const hasVariasi1 = variasi1Name.trim() !== '';

  const variasi1Options = useMemo(() => {
    const seen = new Set<string>();
    const list: string[] = [];
    for (const r of rows) {
      if (r.variasi1 && !seen.has(r.variasi1)) {
        seen.add(r.variasi1);
        list.push(r.variasi1);
      }
    }
    return list;
  }, [rows]);

  const colors = useMemo(() => {
    const seen = new Set<string>();
    const list: ColorPreset[] = [];
    for (const r of rows) {
      const key = r.color.toLowerCase();
      if (r.color && !seen.has(key)) {
        seen.add(key);
        list.push({ name: r.color, hex: r.colorHex });
      }
    }
    return list;
  }, [rows]);

  const addVariasi1Block = () => setVariasi1Name('Ukuran');

  const removeVariasi1Block = () => {
    // Collapse back to color-only: keep the first option's rows per color, drop the rest.
    const firstOption = variasi1Options[0];
    setRows((prev) =>
      prev.filter((r) => !r.variasi1 || r.variasi1 === firstOption).map((r) => ({ ...r, variasi1: '' }))
    );
    setVariasi1Name('');
  };

  const addVariasi1Option = () => {
    const name = newOptionInput.trim();
    if (!name || variasi1Options.includes(name)) return;
    setNewOptionInput('');
    setRows((prev) => {
      // First option ever added — the existing color-only rows become this option's rows.
      if (variasi1Options.length === 0 && prev.some((r) => !r.variasi1)) {
        return prev.map((r) => (!r.variasi1 ? { ...r, variasi1: name } : r));
      }
      const baseColors = colors.length > 0 ? colors : [{ name: 'Black', hex: '#000000' }];
      const newRows: MatrixRow[] = baseColors.map((c) => ({
        variasi1: name,
        color: c.name,
        colorHex: c.hex,
        price: '',
        qty: 0,
        barcode: suggestBarcode(masterSku, name, c.name),
      }));
      return [...prev, ...newRows];
    });
  };

  const removeVariasi1Option = (name: string) => {
    setRows((prev) => prev.filter((r) => r.variasi1 !== name));
  };

  const addColor = (name: string, hex: string) => {
    if (colors.some((c) => c.name.toLowerCase() === name.toLowerCase())) return;
    setRows((prev) => {
      const groups = hasVariasi1 ? variasi1Options : [''];
      const newRows: MatrixRow[] = groups.map((v1) => ({
        variasi1: v1,
        color: name,
        colorHex: hex,
        price: '',
        qty: 0,
        barcode: suggestBarcode(masterSku, v1, name),
      }));
      return [...prev, ...newRows];
    });
  };

  const removeColor = (name: string) => {
    setRows((prev) => prev.filter((r) => r.color.toLowerCase() !== name.toLowerCase()));
  };

  const updateRow = (variasi1: string, color: string, field: 'price' | 'qty' | 'barcode', value: string | number) => {
    setRows((prev) =>
      prev.map((r) => (r.variasi1 === variasi1 && r.color === color ? { ...r, [field]: value } : r))
    );
  };

  const applyToAll = () => {
    setRows((prev) =>
      prev.map((r) => ({
        ...r,
        ...(applyPrice.trim() && { price: applyPrice.trim() }),
        ...(applyStock.trim() && { qty: parseInt(applyStock, 10) || 0 }),
        ...(applyBarcode.trim() && { barcode: applyBarcode.trim() }),
      }))
    );
  };

  const availableColors = dbColors.filter((c) => !colors.some((x) => x.name.toLowerCase() === c.name.toLowerCase()));

  const renderRow = (row: MatrixRow) => (
    <div
      key={`${row.variasi1}::${row.color}`}
      className="grid grid-cols-[auto_1fr_90px_90px_1fr] gap-2 px-3 py-2 items-center border-t border-[#f0f0f0] first:border-t-0"
    >
      <span className="w-5 h-5 rounded-full border border-[#e8e8e8] flex-shrink-0" style={{ backgroundColor: row.colorHex }} />
      <span className="text-sm text-[#2d3436] truncate">{row.color}</span>
      <Input
        type="number"
        min={0}
        value={row.price}
        onChange={(e) => updateRow(row.variasi1, row.color, 'price', e.target.value)}
        placeholder="Rp"
        className="h-8 text-xs bg-white border-[#e8e8e8] rounded-lg"
      />
      <Input
        type="number"
        min={0}
        disabled={childMode}
        value={row.qty}
        onChange={(e) => updateRow(row.variasi1, row.color, 'qty', parseInt(e.target.value) || 0)}
        title={childMode ? 'Stok sync dari Master' : undefined}
        className="h-8 text-xs bg-white border-[#e8e8e8] rounded-lg disabled:opacity-60"
      />
      <Input
        value={row.barcode}
        onChange={(e) => updateRow(row.variasi1, row.color, 'barcode', e.target.value)}
        placeholder="Barcode/SKU"
        className="h-8 text-xs bg-white border-[#e8e8e8] rounded-lg"
      />
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Variasi 1 (optional) — not editable from a child SKU, combinations come from Master */}
      {!hasVariasi1 ? (
        childMode ? null : (
        <button
          type="button"
          onClick={addVariasi1Block}
          className="w-full border border-dashed border-[#d1d5db] rounded-lg py-2.5 text-xs font-medium text-[#6b7280] hover:border-[#4a6741] hover:text-[#4a6741] transition-colors cursor-pointer flex items-center justify-center gap-1.5"
        >
          <Plus className="w-3.5 h-3.5" />
          Tambah Variasi (mis. Ukuran, Bundle)
        </button>
        )
      ) : childMode ? (
        <div className="rounded-lg border border-[#e8e8e8] p-3">
          <p className="text-xs text-[#6b7280]">
            Variasi: <span className="font-semibold text-[#2d3436]">{variasi1Name}</span>{' '}
            <span className="text-[11px] text-[#2563eb]">(sync dari Master)</span>
          </p>
        </div>
      ) : (
        <div className="relative rounded-lg border border-[#e8e8e8] p-3 space-y-2">
          <button
            type="button"
            onClick={removeVariasi1Block}
            title="Hapus Variasi ini"
            className="absolute top-2 right-2 p-1 rounded text-[#9ca3af] hover:text-[#dc2626] hover:bg-[#dc2626]/10 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
          <Input
            value={variasi1Name}
            onChange={(e) => setVariasi1Name(e.target.value)}
            placeholder="Nama Variasi (mis. Ukuran)"
            className="h-8 text-sm bg-white border-[#e8e8e8] rounded-lg w-56"
          />
          <div className="flex flex-wrap items-center gap-1.5">
            {variasi1Options.map((opt) => (
              <Badge key={opt} className="text-xs px-2 py-1 rounded-full bg-[#f5f6fa] text-[#2d3436] border-[#e8e8e8] gap-1" variant="outline">
                {opt}
                <button type="button" onClick={() => removeVariasi1Option(opt)} className="cursor-pointer">
                  <X className="w-3 h-3" />
                </button>
              </Badge>
            ))}
            <Input
              value={newOptionInput}
              onChange={(e) => setNewOptionInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addVariasi1Option();
                }
              }}
              placeholder="Opsi baru"
              className="h-7 w-28 text-xs bg-white border-[#e8e8e8] rounded-lg"
            />
            <button
              type="button"
              onClick={addVariasi1Option}
              className="text-xs text-[#4a6741] font-semibold hover:underline cursor-pointer whitespace-nowrap"
            >
              + Tambah Opsi
            </button>
          </div>
        </div>
      )}

      {/* Variasi 2 — Warna (always present) */}
      <div className="space-y-1.5">
        <Label className="text-sm font-medium text-[#2d3436]">
          Warna {childMode && <span className="text-[11px] text-[#2563eb] font-normal">(sync dari Master)</span>}
        </Label>
        <div className="flex flex-wrap items-center gap-1.5">
          {colors.map((c) => (
            <Badge key={c.name} className="text-xs px-2 py-1 rounded-full bg-[#f5f6fa] text-[#2d3436] border-[#e8e8e8] gap-1.5" variant="outline">
              <span className="w-2.5 h-2.5 rounded-full border border-gray-300" style={{ backgroundColor: c.hex }} />
              {c.name}
              {!childMode && (
                <button type="button" onClick={() => removeColor(c.name)} className="cursor-pointer">
                  <X className="w-3 h-3" />
                </button>
              )}
            </Badge>
          ))}
          {!childMode && (
            <select
              value=""
              onChange={(e) => {
                const preset = dbColors.find((c) => c.hex === e.target.value);
                if (preset) addColor(preset.name, preset.hex);
              }}
              className="h-7 text-xs bg-white border border-[#e8e8e8] rounded-full px-2.5 cursor-pointer text-[#4a6741] font-semibold"
            >
              <option value="">+ Tambah Warna</option>
              {availableColors.map((c) => (
                <option key={c.hex} value={c.hex}>{c.name}</option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* Apply To All */}
      <div className="flex flex-wrap items-end gap-2 bg-[#f5f6fa] rounded-lg p-2.5">
        <div className="space-y-1">
          <Label className="text-[10px] text-[#6b7280] uppercase">Price</Label>
          <Input type="number" min={0} value={applyPrice} onChange={(e) => setApplyPrice(e.target.value)} placeholder="Rp" className="h-8 w-24 text-xs bg-white border-[#e8e8e8] rounded-lg" />
        </div>
        {!childMode && (
          <div className="space-y-1">
            <Label className="text-[10px] text-[#6b7280] uppercase">Stock</Label>
            <Input type="number" min={0} value={applyStock} onChange={(e) => setApplyStock(e.target.value)} className="h-8 w-20 text-xs bg-white border-[#e8e8e8] rounded-lg" />
          </div>
        )}
        <div className="space-y-1 flex-1 min-w-[120px]">
          <Label className="text-[10px] text-[#6b7280] uppercase">SKU/Barcode</Label>
          <Input value={applyBarcode} onChange={(e) => setApplyBarcode(e.target.value)} className="h-8 text-xs bg-white border-[#e8e8e8] rounded-lg" />
        </div>
        <Button type="button" onClick={applyToAll} className="h-8 bg-[#4a6741] hover:bg-[#3d5535] text-white text-xs">
          Apply To All
        </Button>
      </div>

      {/* Grid — grouped by Variasi 1 option if present */}
      {rows.length === 0 ? (
        <p className="text-xs text-[#6b7280] text-center py-6">Tambah minimal 1 warna dulu.</p>
      ) : (
        <div className="space-y-3">
          {(hasVariasi1 ? variasi1Options : ['']).map((group) => (
            <div key={group || '_none'} className="rounded-lg border border-[#e8e8e8] overflow-hidden">
              {hasVariasi1 && (
                <div className="px-3 py-1.5 bg-[#4a6741]/5 text-xs font-semibold text-[#4a6741]">
                  {variasi1Name}: {group}
                </div>
              )}
              <div className="grid grid-cols-[auto_1fr_90px_90px_1fr] gap-2 px-3 py-1.5 bg-[#f0f0f0] items-end">
                <span />
                <span className="text-[11px] font-medium text-[#6b7280] uppercase tracking-wide">Warna</span>
                <span className="text-[11px] font-medium text-[#6b7280] uppercase tracking-wide">Harga</span>
                <span className="text-[11px] font-medium text-[#6b7280] uppercase tracking-wide">Stock</span>
                <span className="text-[11px] font-medium text-[#6b7280] uppercase tracking-wide">Barcode/SKU</span>
              </div>
              {rows.filter((r) => r.variasi1 === group).map(renderRow)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
});
