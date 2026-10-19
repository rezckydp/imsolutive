'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  Plus,
  PackagePlus,
  Pencil,
  Trash2,
  Package,
  ScanLine,
  AlertTriangle,
  CheckCircle2,
  History,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';

// ============ TYPES ============

interface MaterialVariantData {
  id: string;
  label: string;
  stock: number;
  minStock: number;
  barcode: string | null;
}

interface MaterialData {
  id: string;
  name: string;
  unit: string;
  variants: MaterialVariantData[];
}

interface MovementRow {
  id: string;
  createdAt: string;
  materialName: string;
  variantLabel: string;
  unit: string;
  qty: number;
  source: string;
  username: string;
  productLabel: string;
}

interface TallyEntry {
  label: string;
  qty: number;
  isNew: boolean;
}

type InventoryTab = 'material' | 'riwayat';

function isFilamentMaterialName(name: string) {
  return name.toLowerCase().startsWith('filament');
}

export function InventoryManagementPage() {
  const [tab, setTab] = useState<InventoryTab>('material');
  const [materials, setMaterials] = useState<MaterialData[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string>('');

  const fetchMaterials = useCallback(async () => {
    try {
      const res = await fetch('/api/materials');
      const data = await res.json();
      const list: MaterialData[] = data.materials || [];
      setMaterials(list);
      setSelectedId((prev) => (prev && list.some((m) => m.id === prev)) ? prev : (list[0]?.id || ''));
    } catch {
      // keep whatever was already loaded
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchMaterials(); }, [fetchMaterials]);

  const selected = materials.find((m) => m.id === selectedId) || null;

  const stats = useMemo(() => {
    const totalVariants = materials.reduce((sum, m) => sum + m.variants.length, 0);
    const lowStockCount = materials.reduce(
      (sum, m) => sum + m.variants.filter((v) => v.stock < v.minStock).length,
      0
    );
    return { totalMaterial: materials.length, totalVariants, lowStockCount };
  }, [materials]);

  // ============ ADD MATERIAL ============
  const [showAddMaterial, setShowAddMaterial] = useState(false);
  const [newMaterialName, setNewMaterialName] = useState('');
  const [newMaterialUnit, setNewMaterialUnit] = useState('pcs');
  const [savingMaterial, setSavingMaterial] = useState(false);

  const handleAddMaterial = async () => {
    if (!newMaterialName.trim()) return;
    setSavingMaterial(true);
    try {
      const res = await fetch('/api/materials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newMaterialName.trim(), unit: newMaterialUnit.trim() || 'pcs' }),
      });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || 'Gagal membuat Material');
        return;
      }
      const created = await res.json();
      setShowAddMaterial(false);
      setNewMaterialName('');
      setNewMaterialUnit('pcs');
      await fetchMaterials();
      setSelectedId(created.id);
    } catch {
      alert('Gagal membuat Material. Coba lagi.');
    } finally {
      setSavingMaterial(false);
    }
  };

  // ============ VARIANT ADD/EDIT ============
  const [variantDialog, setVariantDialog] = useState<{ mode: 'add' | 'edit'; materialId: string; variant?: MaterialVariantData } | null>(null);
  const [variantLabel, setVariantLabel] = useState('');
  const [variantStock, setVariantStock] = useState('0');
  const [variantMinStock, setVariantMinStock] = useState('0');
  const [variantBarcode, setVariantBarcode] = useState('');
  const [savingVariant, setSavingVariant] = useState(false);

  const openAddVariant = (materialId: string) => {
    setVariantLabel('');
    setVariantStock('0');
    setVariantMinStock('0');
    setVariantBarcode('');
    setVariantDialog({ mode: 'add', materialId });
  };

  const openEditVariant = (materialId: string, variant: MaterialVariantData) => {
    setVariantLabel(variant.label);
    setVariantStock(String(variant.stock));
    setVariantMinStock(String(variant.minStock));
    setVariantBarcode(variant.barcode || '');
    setVariantDialog({ mode: 'edit', materialId, variant });
  };

  const handleSaveVariant = async () => {
    if (!variantDialog || !variantLabel.trim()) return;
    setSavingVariant(true);
    try {
      const body = {
        label: variantLabel.trim(),
        stock: parseInt(variantStock, 10) || 0,
        minStock: parseInt(variantMinStock, 10) || 0,
        barcode: variantBarcode.trim() || null,
      };
      const url = variantDialog.mode === 'add'
        ? `/api/materials/${variantDialog.materialId}/variants`
        : `/api/materials/variants/${variantDialog.variant!.id}`;
      const res = await fetch(url, {
        method: variantDialog.mode === 'add' ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || 'Gagal menyimpan Variant');
        return;
      }
      setVariantDialog(null);
      fetchMaterials();
    } catch {
      alert('Gagal menyimpan Variant. Coba lagi.');
    } finally {
      setSavingVariant(false);
    }
  };

  // ============ DELETE VARIANT ============
  const [deleteVariant, setDeleteVariant] = useState<MaterialVariantData | null>(null);
  const [deletingVariant, setDeletingVariant] = useState(false);

  const handleDeleteVariant = async () => {
    if (!deleteVariant) return;
    setDeletingVariant(true);
    try {
      const res = await fetch(`/api/materials/variants/${deleteVariant.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || 'Gagal menghapus Variant');
        return;
      }
      setDeleteVariant(null);
      fetchMaterials();
    } catch {
      alert('Gagal menghapus Variant. Coba lagi.');
    } finally {
      setDeletingVariant(false);
    }
  };

  // ============ AMBIL MATERIAL (SCAN SESSION) ============
  const [scanOpen, setScanOpen] = useState(false);
  const [scanInput, setScanInput] = useState('');
  const [scanBusy, setScanBusy] = useState(false);
  const [scanFeedback, setScanFeedback] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);
  const [tally, setTally] = useState<Record<string, TallyEntry>>({});
  const [filamentPrompt, setFilamentPrompt] = useState<{ barcode: string } | null>(null);
  const [filamentBrand, setFilamentBrand] = useState('');
  const [filamentJenis, setFilamentJenis] = useState('');
  const [filamentWarna, setFilamentWarna] = useState('');
  const [filamentBarcode, setFilamentBarcode] = useState('');
  const scanInputRef = useRef<HTMLInputElement>(null);
  const filamentInputRef = useRef<HTMLInputElement>(null);

  const openScanSession = () => {
    setTally({});
    setScanInput('');
    setScanFeedback(null);
    setFilamentPrompt(null);
    setScanOpen(true);
  };

  useEffect(() => {
    if (scanOpen && !filamentPrompt) {
      setTimeout(() => scanInputRef.current?.focus(), 50);
    }
  }, [scanOpen, filamentPrompt]);

  useEffect(() => {
    if (filamentPrompt) {
      setTimeout(() => filamentInputRef.current?.focus(), 50);
    }
  }, [filamentPrompt]);

  const addTally = (key: string, label: string, isNew: boolean) => {
    setTally((prev) => ({
      ...prev,
      [key]: { label, isNew: isNew || prev[key]?.isNew || false, qty: (prev[key]?.qty || 0) + 1 },
    }));
  };

  const handleScanSubmit = async () => {
    const barcode = scanInput.trim();
    if (!barcode || scanBusy) return;
    setScanBusy(true);
    setScanFeedback(null);
    try {
      const res = await fetch('/api/materials/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ barcode }),
      });
      const data = await res.json();
      if (!res.ok) {
        setScanFeedback({ type: 'error', text: data.error || 'Gagal scan' });
        return;
      }
      if (!data.matched) {
        // Unregistered barcode — pop the Filament input form
        setFilamentBrand('');
        setFilamentJenis('');
        setFilamentWarna('');
        setFilamentBarcode(barcode);
        setFilamentPrompt({ barcode });
        return;
      }
      addTally(data.variantId, `${data.materialName} — ${data.label}`, false);
      setScanFeedback({ type: 'ok', text: `${data.materialName} — ${data.label} (+1, stok ${data.stock})` });
      fetchMaterials();
    } catch {
      setScanFeedback({ type: 'error', text: 'Gagal memproses scan' });
    } finally {
      setScanInput('');
      setScanBusy(false);
      setTimeout(() => scanInputRef.current?.focus(), 50);
    }
  };

  const handleFilamentSubmit = async () => {
    if (!filamentPrompt || !filamentWarna.trim() || !filamentBarcode.trim()) return;
    setScanBusy(true);
    try {
      const res = await fetch('/api/materials/scan/new', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brand: filamentBrand.trim(),
          jenis: filamentJenis.trim(),
          warna: filamentWarna.trim(),
          barcode: filamentBarcode.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || 'Gagal menyimpan data filament');
        return;
      }
      addTally(data.variantId, `${data.materialName} — ${data.label}`, true);
      setScanFeedback({ type: 'ok', text: `${data.materialName} — ${data.label} (baru, stok ${data.stock})` });
      setFilamentPrompt(null);
      await fetchMaterials();
    } catch {
      alert('Gagal menyimpan data filament. Coba lagi.');
    } finally {
      setScanBusy(false);
      setTimeout(() => scanInputRef.current?.focus(), 50);
    }
  };

  const tallyTotal = Object.values(tally).reduce((sum, t) => sum + t.qty, 0);

  return (
    <div>
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[var(--t-heading)]">Inventory Management</h1>
          <p className="text-sm text-[var(--t-body)] mt-1">Material & bahan baku pelengkap (packaging, filament)</p>
        </div>
      </div>

      {/* Sub-tab Switcher */}
      <div className="flex items-center bg-[var(--surface)] rounded-lg p-0.5 mb-4 w-fit">
        <button
          onClick={() => setTab('material')}
          className={`px-4 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer ${
            tab === 'material' ? 'bg-[var(--card)] text-[var(--brand)] shadow-sm' : 'text-[var(--t-body)] hover:text-[var(--t-heading)]'
          }`}
        >
          Material
        </button>
        <button
          onClick={() => setTab('riwayat')}
          className={`px-4 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer ${
            tab === 'riwayat' ? 'bg-[var(--card)] text-[var(--brand)] shadow-sm' : 'text-[var(--t-body)] hover:text-[var(--t-heading)]'
          }`}
        >
          Riwayat Ambil Material
        </button>
      </div>

      {tab === 'material' ? (
        <>
          {/* Stat cards */}
          <div className="grid grid-cols-2 gap-3 mb-4 max-w-md">
            <div className="bg-[var(--card)] rounded-xl p-4 border border-[var(--bd)]">
              <p className="text-[11px] text-[var(--t-muted)] uppercase tracking-wider mb-1">Total Material</p>
              <p className="text-xl font-bold text-[var(--t-heading)]">{stats.totalMaterial} jenis · {stats.totalVariants} varian</p>
            </div>
            <div className="bg-[var(--card)] rounded-xl p-4 border border-[var(--bd)]">
              <p className="text-[11px] text-[var(--t-muted)] uppercase tracking-wider mb-1">Low Stock</p>
              <p className={`text-xl font-bold ${stats.lowStockCount > 0 ? 'text-[var(--danger)]' : 'text-[var(--t-heading)]'}`}>
                {stats.lowStockCount} varian
              </p>
            </div>
          </div>

          {/* Header actions */}
          <div className="flex items-center gap-2 mb-4">
            <Button
              onClick={() => setShowAddMaterial(true)}
              className="bg-[var(--brand)] hover:bg-[var(--brand-dark)] text-white rounded-full px-4 h-9 text-sm"
            >
              <Plus className="w-4 h-4 mr-1.5" />
              Tambah Material
            </Button>
            <Button
              onClick={openScanSession}
              variant="outline"
              className="rounded-full px-4 h-9 text-sm border-[var(--bd)]"
            >
              <PackagePlus className="w-4 h-4 mr-1.5" />
              Ambil Material
            </Button>
          </div>

          {/* Master-Detail */}
          {loading ? (
            <p className="text-sm text-[var(--t-muted)]">Memuat...</p>
          ) : materials.length === 0 ? (
            <div className="bg-[var(--card)] rounded-xl p-8 border border-[var(--bd)] text-center">
              <Package className="w-10 h-10 text-[var(--t-muted)] mx-auto mb-2" />
              <p className="text-sm text-[var(--t-body)]">Belum ada Material. Tambah yang pertama.</p>
            </div>
          ) : (
            <div className="flex gap-4">
              {/* Left column — Material list */}
              <div className="w-[280px] flex-shrink-0 bg-[var(--card)] rounded-xl border border-[var(--bd)] overflow-y-auto max-h-[560px]">
                {materials.map((m) => {
                  const lowCount = m.variants.filter((v) => v.stock < v.minStock).length;
                  const isActive = m.id === selectedId;
                  return (
                    <button
                      key={m.id}
                      onClick={() => setSelectedId(m.id)}
                      className={`w-full text-left px-4 py-3 border-b border-[var(--bd)] last:border-b-0 transition-colors cursor-pointer ${
                        isActive ? 'bg-[var(--brand)]/10' : 'hover:bg-[var(--surface)]'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className={`text-sm font-medium truncate ${isActive ? 'text-[var(--brand)]' : 'text-[var(--t-heading)]'}`}>
                          {m.name}
                        </span>
                        {lowCount > 0 && (
                          <Badge className="text-[10px] px-1.5 py-0 rounded-full bg-[var(--danger)]/10 text-[var(--danger)] border-[var(--danger)]/30 flex-shrink-0" variant="outline">
                            {lowCount}
                          </Badge>
                        )}
                      </div>
                      <span className="text-[11px] text-[var(--t-muted)]">{m.variants.length} varian</span>
                    </button>
                  );
                })}
              </div>

              {/* Right column — Variant detail */}
              <div className="flex-1 bg-[var(--card)] rounded-xl border border-[var(--bd)] p-4">
                {selected ? (
                  <>
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-semibold text-[var(--t-heading)]">{selected.name}</h3>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openAddVariant(selected.id)}
                        className="h-8 text-xs rounded-full px-3"
                      >
                        <Plus className="w-3.5 h-3.5 mr-1" />
                        Tambah Varian
                      </Button>
                    </div>

                    {selected.variants.length === 0 ? (
                      <p className="text-sm text-[var(--t-muted)] py-6 text-center">Belum ada varian.</p>
                    ) : (
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-[11px] text-[var(--t-muted)] uppercase tracking-wider border-b border-[var(--bd)]">
                            <th className="pb-2 font-medium">Varian</th>
                            <th className="pb-2 font-medium">Stock</th>
                            <th className="pb-2 font-medium">Min Stock</th>
                            <th className="pb-2 font-medium">Status</th>
                            <th className="pb-2 font-medium">Barcode</th>
                            <th className="pb-2 font-medium text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selected.variants.map((v) => {
                            const isLow = v.stock < v.minStock;
                            return (
                              <tr key={v.id} className="border-b border-[var(--bd)] last:border-b-0">
                                <td className="py-2.5 text-[var(--t-heading)]">{v.label}</td>
                                <td className="py-2.5 text-[var(--t-body)]">{v.stock}</td>
                                <td className="py-2.5 text-[var(--t-body)]">{v.minStock}</td>
                                <td className="py-2.5">
                                  <Badge
                                    className={`text-[10px] px-1.5 py-0 rounded-full border ${
                                      isLow
                                        ? 'bg-[var(--danger)]/10 text-[var(--danger)] border-[var(--danger)]/30'
                                        : 'bg-[var(--success)]/10 text-[var(--success)] border-[var(--success)]/30'
                                    }`}
                                    variant="outline"
                                  >
                                    {isLow ? 'Low Stock' : 'OK'}
                                  </Badge>
                                </td>
                                <td className="py-2.5 text-[var(--t-muted)] font-mono text-xs">
                                  {isFilamentMaterialName(selected.name) ? (v.barcode || '—') : '—'}
                                </td>
                                <td className="py-2.5 text-right">
                                  <button
                                    onClick={() => openEditVariant(selected.id, v)}
                                    className="p-1 rounded hover:bg-[var(--surface)] text-[var(--t-muted)] hover:text-[var(--t-heading)] cursor-pointer"
                                  >
                                    <Pencil className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={() => setDeleteVariant(v)}
                                    className="p-1 rounded hover:bg-[var(--danger)]/10 text-[var(--t-muted)] hover:text-[var(--danger)] cursor-pointer"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-[var(--t-muted)]">Pilih Material di sebelah kiri.</p>
                )}
              </div>
            </div>
          )}
        </>
      ) : (
        <RiwayatTab />
      )}

      {/* ============ ADD MATERIAL DIALOG ============ */}
      <Dialog open={showAddMaterial} onOpenChange={(open) => !open && setShowAddMaterial(false)}>
        <DialogContent className="sm:max-w-sm rounded-xl">
          <DialogHeader>
            <DialogTitle className="text-[var(--t-heading)]">Tambah Material</DialogTitle>
            <DialogDescription className="text-[var(--t-body)]">Isi nama & satuan, lanjut tambahin varian pertamanya.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-[var(--t-heading)]">Nama Material *</Label>
              <Input
                value={newMaterialName}
                onChange={(e) => setNewMaterialName(e.target.value)}
                placeholder="e.g. Kardus, Thankyou Card"
                className="h-10 text-sm bg-[var(--surface)] border-[var(--bd)] rounded-lg"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-[var(--t-heading)]">Unit</Label>
              <Input
                value={newMaterialUnit}
                onChange={(e) => setNewMaterialUnit(e.target.value)}
                placeholder="pcs / roll / dll"
                className="h-10 text-sm bg-[var(--surface)] border-[var(--bd)] rounded-lg w-32"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowAddMaterial(false)} disabled={savingMaterial} className="rounded-full px-5">
              Cancel
            </Button>
            <Button
              onClick={handleAddMaterial}
              disabled={savingMaterial || !newMaterialName.trim()}
              className="bg-[var(--brand)] hover:bg-[var(--brand-dark)] text-white rounded-full px-5 disabled:opacity-50"
            >
              {savingMaterial ? 'Saving...' : 'Tambah'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============ ADD/EDIT VARIANT DIALOG ============ */}
      <Dialog open={!!variantDialog} onOpenChange={(open) => !open && setVariantDialog(null)}>
        <DialogContent className="sm:max-w-sm rounded-xl">
          <DialogHeader>
            <DialogTitle className="text-[var(--t-heading)]">
              {variantDialog?.mode === 'add' ? 'Tambah Varian' : 'Edit Varian'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-[var(--t-heading)]">Label *</Label>
              <Input
                value={variantLabel}
                onChange={(e) => setVariantLabel(e.target.value)}
                placeholder="e.g. 10x10x6, Hitam"
                className="h-10 text-sm bg-[var(--surface)] border-[var(--bd)] rounded-lg"
              />
            </div>
            <div className="flex gap-3">
              <div className="space-y-1.5">
                <Label className="text-sm font-medium text-[var(--t-heading)]">Stock</Label>
                <Input
                  type="number"
                  value={variantStock}
                  onChange={(e) => setVariantStock(e.target.value)}
                  className="h-10 text-sm bg-[var(--surface)] border-[var(--bd)] rounded-lg w-24"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-medium text-[var(--t-heading)]">Min Stock</Label>
                <Input
                  type="number"
                  value={variantMinStock}
                  onChange={(e) => setVariantMinStock(e.target.value)}
                  className="h-10 text-sm bg-[var(--surface)] border-[var(--bd)] rounded-lg w-24"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-[var(--t-heading)]">Barcode <span className="font-normal text-[var(--t-muted)]">(opt)</span></Label>
              <Input
                value={variantBarcode}
                onChange={(e) => setVariantBarcode(e.target.value)}
                placeholder="Khusus Filament"
                className="h-10 text-sm bg-[var(--surface)] border-[var(--bd)] rounded-lg"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setVariantDialog(null)} disabled={savingVariant} className="rounded-full px-5">
              Cancel
            </Button>
            <Button
              onClick={handleSaveVariant}
              disabled={savingVariant || !variantLabel.trim()}
              className="bg-[var(--brand)] hover:bg-[var(--brand-dark)] text-white rounded-full px-5 disabled:opacity-50"
            >
              {savingVariant ? 'Saving...' : 'Simpan'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============ DELETE VARIANT CONFIRM ============ */}
      <Dialog open={!!deleteVariant} onOpenChange={(open) => !open && setDeleteVariant(null)}>
        <DialogContent className="sm:max-w-sm rounded-xl">
          <DialogHeader>
            <DialogTitle className="text-[var(--t-heading)]">Hapus Varian</DialogTitle>
            <DialogDescription className="text-[var(--t-body)]">
              Hapus varian <strong>{deleteVariant?.label}</strong>? Tindakan ini tidak bisa dibatalkan.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeleteVariant(null)} disabled={deletingVariant} className="rounded-full px-5">
              Cancel
            </Button>
            <Button
              onClick={handleDeleteVariant}
              disabled={deletingVariant}
              className="bg-[var(--danger)] hover:bg-[var(--danger-dark)] text-white rounded-full px-5 disabled:opacity-50"
            >
              {deletingVariant ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============ AMBIL MATERIAL (SCAN SESSION) ============ */}
      <Dialog open={scanOpen} onOpenChange={(open) => !open && setScanOpen(false)}>
        <DialogContent className="sm:max-w-lg rounded-xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-[var(--t-heading)] flex items-center gap-2">
              <ScanLine className="w-5 h-5 text-[var(--brand)]" />
              Ambil Material
            </DialogTitle>
            <DialogDescription className="text-[var(--t-body)]">
              Scan barcode tiap box/roll yang baru datang — tiap scan otomatis +1 stok.
            </DialogDescription>
          </DialogHeader>

          {!filamentPrompt ? (
            <div className="space-y-3">
              <input
                ref={scanInputRef}
                type="text"
                value={scanInput}
                onChange={(e) => setScanInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleScanSubmit(); }}
                placeholder="Scan atau ketik barcode..."
                disabled={scanBusy}
                className="w-full h-11 text-sm bg-[var(--surface)] border border-[var(--bd)] rounded-lg px-3 font-mono text-[var(--t-heading)] placeholder:text-[var(--t-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--brand)]/30 disabled:opacity-60"
              />

              {scanFeedback && (
                <div className={`flex items-center gap-2 p-2.5 rounded-lg text-xs ${
                  scanFeedback.type === 'ok'
                    ? 'bg-[var(--success)]/10 text-[var(--success)] border border-[var(--success)]/30'
                    : 'bg-[var(--danger)]/10 text-[var(--danger)] border border-[var(--danger)]/30'
                }`}>
                  {scanFeedback.type === 'ok' ? <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" /> : <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />}
                  {scanFeedback.text}
                </div>
              )}

              {/* Tally panel */}
              <div className="bg-[var(--surface-tint-3)] rounded-lg border border-[var(--bd)] p-3">
                <p className="text-[11px] text-[var(--t-muted)] uppercase tracking-wider mb-2">Tally Sesi Ini</p>
                {Object.keys(tally).length === 0 ? (
                  <p className="text-xs text-[var(--t-muted)]">Belum ada scan.</p>
                ) : (
                  <div className="space-y-1 max-h-[180px] overflow-y-auto">
                    {Object.entries(tally).map(([key, t]) => (
                      <div key={key} className="flex items-center justify-between text-sm">
                        <span className="text-[var(--t-heading)]">
                          {t.label} {t.isNew && <span className="text-[10px] text-[var(--info)]">(baru)</span>}
                        </span>
                        <span className="font-semibold text-[var(--t-heading)]">{t.qty}</span>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex items-center justify-between text-sm font-semibold border-t border-[var(--bd)] mt-2 pt-2">
                  <span className="text-[var(--t-heading)]">Total</span>
                  <span className="text-[var(--brand)]">{tallyTotal}</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="p-3 rounded-lg bg-[var(--warning)]/10 border border-[var(--warning)]/30">
                <p className="text-xs font-medium text-[var(--warning)]">Barcode belum terdaftar — Input Data Filament</p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-medium text-[var(--t-heading)]">Brand Filament</Label>
                <input
                  ref={filamentInputRef}
                  type="text"
                  value={filamentBrand}
                  onChange={(e) => setFilamentBrand(e.target.value)}
                  placeholder="e.g. eSUN"
                  className="w-full h-10 text-sm bg-[var(--surface)] border border-[var(--bd)] rounded-lg px-3 text-[var(--t-heading)] placeholder:text-[var(--t-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--brand)]/30"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-medium text-[var(--t-heading)]">Jenis Filament</Label>
                <Input
                  value={filamentJenis}
                  onChange={(e) => setFilamentJenis(e.target.value)}
                  placeholder="e.g. PLA, PETG"
                  className="h-10 text-sm bg-[var(--surface)] border-[var(--bd)] rounded-lg"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-medium text-[var(--t-heading)]">Warna *</Label>
                <Input
                  value={filamentWarna}
                  onChange={(e) => setFilamentWarna(e.target.value)}
                  placeholder="e.g. Hitam"
                  className="h-10 text-sm bg-[var(--surface)] border-[var(--bd)] rounded-lg"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-medium text-[var(--t-heading)]">Barcode *</Label>
                <Input
                  value={filamentBarcode}
                  onChange={(e) => setFilamentBarcode(e.target.value)}
                  className="h-10 text-sm bg-[var(--surface)] border-[var(--bd)] rounded-lg font-mono"
                />
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => { setFilamentPrompt(null); setTimeout(() => scanInputRef.current?.focus(), 50); }}
                  className="rounded-full px-5 flex-1"
                >
                  Batal
                </Button>
                <Button
                  onClick={handleFilamentSubmit}
                  disabled={scanBusy || !filamentWarna.trim() || !filamentBarcode.trim()}
                  className="bg-[var(--brand)] hover:bg-[var(--brand-dark)] text-white rounded-full px-5 flex-1 disabled:opacity-50"
                >
                  {scanBusy ? 'Saving...' : 'Simpan'}
                </Button>
              </div>
            </div>
          )}

          {!filamentPrompt && (
            <DialogFooter className="gap-2">
              <Button
                onClick={() => { setScanOpen(false); fetchMaterials(); }}
                className="bg-[var(--brand)] hover:bg-[var(--brand-dark)] text-white rounded-full px-5"
              >
                Selesai Sesi
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============ RIWAYAT TAB ============

function RiwayatTab() {
  const [movements, setMovements] = useState<MovementRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/materials/movements')
      .then((res) => res.json())
      .then((data) => setMovements(data.movements || []))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <p className="text-sm text-[var(--t-muted)]">Memuat...</p>;
  }

  if (movements.length === 0) {
    return (
      <div className="bg-[var(--card)] rounded-xl p-8 border border-[var(--bd)] text-center">
        <History className="w-10 h-10 text-[var(--t-muted)] mx-auto mb-2" />
        <p className="text-sm text-[var(--t-body)]">Belum ada riwayat pergerakan stok material.</p>
      </div>
    );
  }

  return (
    <div className="bg-[var(--card)] rounded-xl border border-[var(--bd)] overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[11px] text-[var(--t-muted)] uppercase tracking-wider border-b border-[var(--bd)]">
            <th className="px-4 py-3 font-medium">Tanggal</th>
            <th className="px-4 py-3 font-medium">Material</th>
            <th className="px-4 py-3 font-medium">Varian</th>
            <th className="px-4 py-3 font-medium">Qty</th>
            <th className="px-4 py-3 font-medium">Sumber</th>
            <th className="px-4 py-3 font-medium">Oleh</th>
          </tr>
        </thead>
        <tbody>
          {movements.map((m) => (
            <tr key={m.id} className="border-b border-[var(--bd)] last:border-b-0">
              <td className="px-4 py-2.5 text-[var(--t-body)] whitespace-nowrap">
                {new Date(m.createdAt).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}
              </td>
              <td className="px-4 py-2.5 text-[var(--t-heading)]">{m.materialName}</td>
              <td className="px-4 py-2.5 text-[var(--t-body)]">{m.variantLabel}</td>
              <td className={`px-4 py-2.5 font-semibold ${m.qty >= 0 ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}>
                {m.qty >= 0 ? '+' : ''}{m.qty} {m.unit}
              </td>
              <td className="px-4 py-2.5 text-[var(--t-body)]">{m.source}</td>
              <td className="px-4 py-2.5 text-[var(--t-muted)]">{m.username}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
