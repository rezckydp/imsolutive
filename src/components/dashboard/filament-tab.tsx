'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Plus, Pencil, Trash2, Minus, Weight, ArrowUpDown, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';

const JENIS_PRESETS = ['PLA', 'PETG', 'ABS', 'TPU'];

interface MaterialVariantRaw {
  id: string;
  label: string;
  stock: number;
  minStock: number;
  brand: string | null;
  materialType: string | null;
  knownBarcodes: string | null;
}

interface MaterialRaw {
  id: string;
  name: string;
  variants: MaterialVariantRaw[];
}

interface ColorOption {
  name: string;
  status: string;
}

interface FilamentRow {
  id: string;
  materialId: string;
  brand: string;
  color: string;
  materialType: string;
  stock: number;
  minStock: number;
  knownBarcodes: string[];
}

function parseKnownBarcodes(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((b) => typeof b === 'string') : [];
  } catch {
    return [];
  }
}

function isFilamentMaterial(name: string) {
  return name.trim().toLowerCase().startsWith('filament');
}

async function ensureFilamentMaterialId(materials: MaterialRaw[]): Promise<string> {
  const exact = materials.find((m) => m.name === 'Filament');
  if (exact) return exact.id;
  const prefixed = materials.find((m) => isFilamentMaterial(m.name));
  if (prefixed) return prefixed.id;

  const res = await fetch('/api/materials', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Filament', unit: 'roll', hasVariants: true }),
  });
  const data = await res.json();
  return data.id;
}

export function FilamentTab() {
  const [materials, setMaterials] = useState<MaterialRaw[]>([]);
  const [colors, setColors] = useState<ColorOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<'brand' | 'color'>('brand');
  const [adjustDrafts, setAdjustDrafts] = useState<Record<string, string>>({});
  const [adjustingId, setAdjustingId] = useState<string | null>(null);

  const fetchMaterials = useCallback(async () => {
    try {
      const res = await fetch('/api/materials');
      const data = await res.json();
      setMaterials(data.materials || []);
    } catch {
      // keep whatever was already loaded
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchMaterials(); }, [fetchMaterials]);

  useEffect(() => {
    fetch('/api/colors')
      .then((res) => res.json())
      .then((data) => setColors(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

  const activeColorNames = useMemo(() => colors.filter((c) => c.status === 'Active').map((c) => c.name), [colors]);

  const rows = useMemo(() => {
    const out: FilamentRow[] = [];
    for (const m of materials) {
      if (!isFilamentMaterial(m.name)) continue;
      for (const v of m.variants) {
        out.push({
          id: v.id,
          materialId: m.id,
          brand: v.brand || '',
          color: v.label,
          materialType: v.materialType || '',
          stock: v.stock,
          minStock: v.minStock,
          knownBarcodes: parseKnownBarcodes(v.knownBarcodes),
        });
      }
    }
    return out.sort((a, b) => (sortBy === 'brand' ? a.brand.localeCompare(b.brand) : a.color.localeCompare(b.color)));
  }, [materials, sortBy]);

  // ============ QUICK ADD/SUBTRACT STOCK — empty input defaults to 1 Roll ============
  const handleQuickAdjust = async (row: FilamentRow, sign: 1 | -1) => {
    const amount = adjustDrafts[row.id]?.trim() ? parseInt(adjustDrafts[row.id], 10) : 1;
    if (!amount || amount <= 0) return;
    setAdjustingId(row.id);
    try {
      const newStock = row.stock + sign * amount;
      const res = await fetch(`/api/materials/variants/${row.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stock: newStock }),
      });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || 'Gagal update stok');
        return;
      }
      setAdjustDrafts((prev) => ({ ...prev, [row.id]: '' }));
      fetchMaterials();
    } catch {
      alert('Gagal update stok. Coba lagi.');
    } finally {
      setAdjustingId(null);
    }
  };

  // ============ ADD/EDIT DIALOG ============
  const [formOpen, setFormOpen] = useState(false);
  const [editingRow, setEditingRow] = useState<FilamentRow | null>(null);
  const [formBrand, setFormBrand] = useState('');
  const [formColor, setFormColor] = useState('');
  const [formJenisPreset, setFormJenisPreset] = useState('PLA');
  const [formJenisCustom, setFormJenisCustom] = useState('');
  const [formStock, setFormStock] = useState('0');
  const [formMinStock, setFormMinStock] = useState('0');
  const [formBarcodes, setFormBarcodes] = useState<string[]>([]);
  const [formNewBarcode, setFormNewBarcode] = useState('');
  const [saving, setSaving] = useState(false);

  const openAdd = () => {
    setEditingRow(null);
    setFormBrand('');
    setFormColor('');
    setFormJenisPreset('PLA');
    setFormJenisCustom('');
    setFormStock('0');
    setFormMinStock('0');
    setFormBarcodes([]);
    setFormNewBarcode('');
    setFormOpen(true);
  };

  const openEdit = (row: FilamentRow) => {
    setEditingRow(row);
    setFormBrand(row.brand);
    setFormColor(row.color);
    if (row.materialType && !JENIS_PRESETS.includes(row.materialType)) {
      setFormJenisPreset('Lainnya');
      setFormJenisCustom(row.materialType);
    } else {
      setFormJenisPreset(row.materialType || 'PLA');
      setFormJenisCustom('');
    }
    setFormStock(String(row.stock));
    setFormMinStock(String(row.minStock));
    setFormBarcodes(row.knownBarcodes);
    setFormNewBarcode('');
    setFormOpen(true);
  };

  const addFormBarcode = () => {
    const code = formNewBarcode.trim();
    if (!code || formBarcodes.includes(code)) return;
    setFormBarcodes((prev) => [...prev, code]);
    setFormNewBarcode('');
  };

  const removeFormBarcode = (code: string) => {
    setFormBarcodes((prev) => prev.filter((b) => b !== code));
  };

  const handleSaveForm = async () => {
    const jenis = formJenisPreset === 'Lainnya' ? formJenisCustom.trim() : formJenisPreset;
    if (!formColor.trim()) return;
    setSaving(true);
    try {
      if (editingRow) {
        const res = await fetch(`/api/materials/variants/${editingRow.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            label: formColor.trim(),
            brand: formBrand.trim(),
            materialType: jenis,
            stock: parseInt(formStock, 10) || 0,
            minStock: parseInt(formMinStock, 10) || 0,
            knownBarcodes: formBarcodes,
          }),
        });
        if (!res.ok) {
          const data = await res.json();
          alert(data.error || 'Gagal menyimpan');
          return;
        }
      } else {
        const materialId = await ensureFilamentMaterialId(materials);
        const res = await fetch(`/api/materials/${materialId}/variants`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            label: formColor.trim(),
            brand: formBrand.trim(),
            materialType: jenis,
            stock: parseInt(formStock, 10) || 0,
            minStock: parseInt(formMinStock, 10) || 0,
            knownBarcodes: formBarcodes,
          }),
        });
        if (!res.ok) {
          const data = await res.json();
          alert(data.error || 'Gagal membuat Filament');
          return;
        }
      }
      setFormOpen(false);
      fetchMaterials();
    } catch {
      alert('Gagal menyimpan. Coba lagi.');
    } finally {
      setSaving(false);
    }
  };

  // ============ DELETE ============
  const [deleteTarget, setDeleteTarget] = useState<FilamentRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/materials/variants/${deleteTarget.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || 'Gagal menghapus');
        return;
      }
      setDeleteTarget(null);
      fetchMaterials();
    } catch {
      alert('Gagal menghapus. Coba lagi.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <Button onClick={openAdd} className="bg-[var(--brand)] hover:bg-[var(--brand-dark)] text-white rounded-full px-4 h-9 text-sm">
          <Plus className="w-4 h-4 mr-1.5" />
          Tambah Filament Baru
        </Button>
        <button
          onClick={() => setSortBy((s) => (s === 'brand' ? 'color' : 'brand'))}
          className="flex items-center gap-1.5 px-3 h-9 rounded-full text-xs font-medium border border-[var(--bd)] text-[var(--t-body)] hover:bg-[var(--surface)] cursor-pointer"
        >
          <ArrowUpDown className="w-3.5 h-3.5" />
          Sort: {sortBy === 'brand' ? 'Brand' : 'Warna'}
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-[var(--t-muted)]">Memuat...</p>
      ) : rows.length === 0 ? (
        <div className="bg-[var(--card)] rounded-xl p-10 border border-[var(--bd)] text-center">
          <Weight className="w-10 h-10 text-[var(--t-muted)] mx-auto mb-2" />
          <p className="text-sm text-[var(--t-body)]">Belum ada Filament. Tambah yang pertama.</p>
        </div>
      ) : (
        <div className="bg-[var(--card)] rounded-xl border border-[var(--bd)] overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] text-[var(--t-muted)] uppercase tracking-wider border-b border-[var(--bd)]">
                <th className="px-4 py-3 font-medium">Brand</th>
                <th className="px-4 py-3 font-medium">Warna</th>
                <th className="px-4 py-3 font-medium">Jenis Bahan</th>
                <th className="px-4 py-3 font-medium">Stok (Roll)</th>
                <th className="px-4 py-3 font-medium">Quick Add/Kurangi</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const isLow = row.stock < row.minStock;
                return (
                  <tr key={row.id} className="border-b border-[var(--bd)] last:border-b-0">
                    <td className="px-4 py-2.5 text-[var(--t-heading)]">{row.brand || '—'}</td>
                    <td className="px-4 py-2.5 text-[var(--t-body)]">{row.color}</td>
                    <td className="px-4 py-2.5 text-[var(--t-body)]">{row.materialType || '—'}</td>
                    <td className="px-4 py-2.5">
                      <span className={`font-semibold ${isLow ? 'text-[var(--danger)]' : 'text-[var(--t-heading)]'}`}>{row.stock} Roll</span>
                      {isLow && (
                        <Badge className="ml-2 text-[10px] px-1.5 py-0 rounded-full bg-[var(--danger)]/10 text-[var(--danger)] border-[var(--danger)]/30" variant="outline">
                          Low Stock
                        </Badge>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-1.5">
                        <Input
                          type="number"
                          min={0}
                          placeholder="Roll"
                          value={adjustDrafts[row.id] || ''}
                          onChange={(e) => setAdjustDrafts((prev) => ({ ...prev, [row.id]: e.target.value }))}
                          className="h-8 w-20 text-xs bg-[var(--surface)] border-[var(--bd)]"
                        />
                        <button
                          onClick={() => handleQuickAdjust(row, 1)}
                          disabled={adjustingId === row.id}
                          title="Tambah stok"
                          className="p-1.5 rounded-md bg-[var(--success)]/10 hover:bg-[var(--success)]/20 text-[var(--success)] cursor-pointer disabled:opacity-50"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleQuickAdjust(row, -1)}
                          disabled={adjustingId === row.id}
                          title="Kurangi stok"
                          className="p-1.5 rounded-md bg-[var(--danger)]/10 hover:bg-[var(--danger)]/20 text-[var(--danger)] cursor-pointer disabled:opacity-50"
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <button onClick={() => openEdit(row)} className="p-1 rounded hover:bg-[var(--surface)] text-[var(--t-muted)] hover:text-[var(--t-heading)] cursor-pointer">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => setDeleteTarget(row)} className="p-1 rounded hover:bg-[var(--danger)]/10 text-[var(--t-muted)] hover:text-[var(--danger)] cursor-pointer">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ============ ADD/EDIT FILAMENT DIALOG ============ */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="sm:max-w-sm rounded-xl">
          <DialogHeader>
            <DialogTitle className="text-[var(--t-heading)]">
              {editingRow ? 'Edit Filament' : 'Tambah Filament Baru'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-[var(--t-heading)]">Brand</Label>
              <Input value={formBrand} onChange={(e) => setFormBrand(e.target.value)} placeholder="e.g. eSUN" className="h-10 text-sm bg-[var(--surface)] border-[var(--bd)] rounded-lg" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-[var(--t-heading)]">Warna *</Label>
              {activeColorNames.length === 0 ? (
                <p className="text-[11px] text-[var(--t-muted)]">Belum ada Color Variant — tambah dulu di Database &gt; Color Variant.</p>
              ) : (
                <Select value={formColor} onValueChange={setFormColor}>
                  <SelectTrigger className="h-10 text-sm bg-[var(--surface)] border-[var(--bd)] rounded-lg">
                    <SelectValue placeholder="Pilih warna..." />
                  </SelectTrigger>
                  <SelectContent>
                    {activeColorNames.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-[var(--t-heading)]">Jenis Bahan</Label>
              <Select value={formJenisPreset} onValueChange={setFormJenisPreset}>
                <SelectTrigger className="h-10 text-sm bg-[var(--surface)] border-[var(--bd)] rounded-lg">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {JENIS_PRESETS.map((j) => (
                    <SelectItem key={j} value={j}>{j}</SelectItem>
                  ))}
                  <SelectItem value="Lainnya">Lainnya...</SelectItem>
                </SelectContent>
              </Select>
              {formJenisPreset === 'Lainnya' && (
                <Input
                  value={formJenisCustom}
                  onChange={(e) => setFormJenisCustom(e.target.value)}
                  placeholder="Ketik jenis bahan"
                  className="h-10 text-sm bg-[var(--surface)] border-[var(--bd)] rounded-lg mt-1.5"
                />
              )}
            </div>
            <div className="flex gap-3">
              <div className="space-y-1.5">
                <Label className="text-sm font-medium text-[var(--t-heading)]">Stok (Roll)</Label>
                <Input type="number" value={formStock} onChange={(e) => setFormStock(e.target.value)} className="h-10 text-sm bg-[var(--surface)] border-[var(--bd)] rounded-lg w-28" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-medium text-[var(--t-heading)]">Min Stock (Roll)</Label>
                <Input type="number" value={formMinStock} onChange={(e) => setFormMinStock(e.target.value)} className="h-10 text-sm bg-[var(--surface)] border-[var(--bd)] rounded-lg w-28" />
              </div>
            </div>

            {/* Barcode kemasan — Filament bisa punya lebih dari satu (beda
                batch/supplier), dipakai buat lookup di Scan Material */}
            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-[var(--t-heading)]">Barcode Kemasan <span className="font-normal text-[var(--t-muted)]">(opt)</span></Label>
              {formBarcodes.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-1.5">
                  {formBarcodes.map((code) => (
                    <span key={code} className="inline-flex items-center gap-1 text-[11px] font-mono bg-[var(--surface)] border border-[var(--bd)] rounded-full pl-2.5 pr-1 py-0.5">
                      {code}
                      <button onClick={() => removeFormBarcode(code)} className="p-0.5 rounded-full hover:bg-[var(--danger)]/10 text-[var(--t-muted)] hover:text-[var(--danger)] cursor-pointer">
                        <X className="w-2.5 h-2.5" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <Input
                  value={formNewBarcode}
                  onChange={(e) => setFormNewBarcode(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addFormBarcode(); } }}
                  placeholder="Scan/ketik barcode kemasan"
                  className="h-9 text-xs bg-[var(--surface)] border-[var(--bd)] rounded-lg font-mono flex-1"
                />
                <Button type="button" variant="outline" onClick={addFormBarcode} className="h-9 px-3 text-xs rounded-lg">
                  Tambah
                </Button>
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setFormOpen(false)} disabled={saving} className="rounded-full px-5">
              Cancel
            </Button>
            <Button
              onClick={handleSaveForm}
              disabled={saving || !formColor.trim()}
              className="bg-[var(--brand)] hover:bg-[var(--brand-dark)] text-white rounded-full px-5 disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Simpan'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============ DELETE CONFIRM ============ */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-sm rounded-xl">
          <DialogHeader>
            <DialogTitle className="text-[var(--t-heading)]">Hapus Filament</DialogTitle>
            <DialogDescription className="text-[var(--t-body)]">
              Hapus <strong>{deleteTarget?.brand} - {deleteTarget?.color} - {deleteTarget?.materialType}</strong>? Tindakan ini nggak bisa dibatalkan.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleting} className="rounded-full px-5">
              Cancel
            </Button>
            <Button
              onClick={handleDelete}
              disabled={deleting}
              className="bg-[var(--danger)] hover:bg-[var(--danger-dark)] text-white rounded-full px-5 disabled:opacity-50"
            >
              {deleting ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
