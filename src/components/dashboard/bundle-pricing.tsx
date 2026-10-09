'use client';

import { useState, useEffect, useCallback } from 'react';
import { Plus, X, Pencil, Trash2, Loader2, Tag, Package2, Search, Layers } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';

// ============ TYPES ============

interface CategoryProduct {
  id: string;
  sku: string;
  name: string;
}

interface BundleCategoryRow {
  id: string;
  code: string;
  name: string;
  normalPrice: number;
  bulkMinQty: number | null;
  bulkUnitPrice: number | null;
  bulkTierName: string | null;
  products: CategoryProduct[];
}

interface PackageRequirement {
  id: string;
  qty: number;
  category: { id: string; code: string; name: string };
}

interface BundlePackageRow {
  id: string;
  code: string;
  name: string;
  price: number;
  requirements: PackageRequirement[];
}

interface CandidateProduct {
  id: string;
  sku: string;
  name: string;
  isBoothEnabled: boolean;
  parentProductId: string | null;
  bundleCategory: { id: string; name: string } | null;
}

function formatRupiah(n: number): string {
  return `Rp ${n.toLocaleString('id-ID')}`;
}

function requirementsLabel(reqs: PackageRequirement[]): string {
  return reqs.map((r) => `${r.qty} ${r.category.name}`).join(' + ');
}

// ============ CATEGORY FORM DIALOG ============

function CategoryFormDialog({
  open,
  onClose,
  editing,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  editing: BundleCategoryRow | null;
  onSaved: () => void;
}) {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [normalPrice, setNormalPrice] = useState('');
  const [bulkMinQty, setBulkMinQty] = useState('');
  const [bulkUnitPrice, setBulkUnitPrice] = useState('');
  const [bulkTierName, setBulkTierName] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCode(editing?.code ?? '');
    setName(editing?.name ?? '');
    setNormalPrice(editing ? String(editing.normalPrice) : '');
    setBulkMinQty(editing?.bulkMinQty != null ? String(editing.bulkMinQty) : '');
    setBulkUnitPrice(editing?.bulkUnitPrice != null ? String(editing.bulkUnitPrice) : '');
    setBulkTierName(editing?.bulkTierName ?? '');
  }, [open, editing]);

  const handleSave = async () => {
    if (!code.trim() || !name.trim() || normalPrice === '') {
      toast.error('Kode, nama, dan harga normal wajib diisi');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        code: code.trim(),
        name: name.trim(),
        normalPrice: parseInt(normalPrice, 10),
        bulkMinQty: bulkMinQty.trim() === '' ? null : parseInt(bulkMinQty, 10),
        bulkUnitPrice: bulkUnitPrice.trim() === '' ? null : parseInt(bulkUnitPrice, 10),
        bulkTierName: bulkTierName.trim() || null,
      };
      const res = await fetch(editing ? `/api/bundle/categories/${editing.id}` : '/api/bundle/categories', {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Gagal menyimpan kategori');
      toast.success(editing ? `${payload.name} diperbarui` : `${payload.name} ditambahkan`);
      onSaved();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal menyimpan kategori');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit Kategori Bundle' : 'Tambah Kategori Bundle'}</DialogTitle>
          <DialogDescription>
            Produk dalam 1 kategori dihitung sama & boleh dicampur dalam 1 paket (mis. semua model Charging Stand).
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs font-medium text-[var(--t-muted)] mb-1 block">Kode (internal)</Label>
              <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="STAND" className="h-9 bg-[var(--card)] border-[var(--bd)] rounded-lg" />
            </div>
            <div>
              <Label className="text-xs font-medium text-[var(--t-muted)] mb-1 block">Nama Tampilan</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Charging Stand" className="h-9 bg-[var(--card)] border-[var(--bd)] rounded-lg" />
            </div>
          </div>
          <div>
            <Label className="text-xs font-medium text-[var(--t-muted)] mb-1 block">Harga Normal per pcs (Rp)</Label>
            <Input type="number" min={0} value={normalPrice} onChange={(e) => setNormalPrice(e.target.value)} placeholder="79900" className="h-9 bg-[var(--card)] border-[var(--bd)] rounded-lg" />
          </div>
          <div className="pt-1 border-t border-[var(--bd)]">
            <p className="text-xs font-medium text-[var(--t-heading)] mt-2 mb-2">Bulk Tier (opsional)</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-medium text-[var(--t-muted)] mb-1 block">Min Qty</Label>
                <Input type="number" min={1} value={bulkMinQty} onChange={(e) => setBulkMinQty(e.target.value)} placeholder="4" className="h-9 bg-[var(--card)] border-[var(--bd)] rounded-lg" />
              </div>
              <div>
                <Label className="text-xs font-medium text-[var(--t-muted)] mb-1 block">Harga per pcs (Rp)</Label>
                <Input type="number" min={0} value={bulkUnitPrice} onChange={(e) => setBulkUnitPrice(e.target.value)} placeholder="55000" className="h-9 bg-[var(--card)] border-[var(--bd)] rounded-lg" />
              </div>
            </div>
            <div className="mt-3">
              <Label className="text-xs font-medium text-[var(--t-muted)] mb-1 block">Nama Tier di Struk (opsional)</Label>
              <Input value={bulkTierName} onChange={(e) => setBulkTierName(e.target.value)} placeholder="Squad" className="h-9 bg-[var(--card)] border-[var(--bd)] rounded-lg" />
              <p className="text-[11px] text-[var(--t-subtle)] mt-1">Kosongkan buat pakai nama kategori. Tampil di struk sebagai &quot;{bulkTierName.trim() || name.trim() || 'Nama'} ({bulkMinQty.trim() || 'N'})&quot;.</p>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Batal</Button>
          <Button onClick={handleSave} disabled={saving} className="bg-[var(--brand)] hover:bg-[var(--brand-dark)] text-white">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Simpan'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============ CATEGORY PRODUCT ASSIGNMENT DIALOG ============

function CategoryProductsDialog({
  open,
  onClose,
  category,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  category: BundleCategoryRow | null;
  onSaved: () => void;
}) {
  const [search, setSearch] = useState('');
  const [candidates, setCandidates] = useState<CandidateProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !category) return;
    setSelected(new Set(category.products.map((p) => p.id)));
    setSearch('');
  }, [open, category]);

  const fetchCandidates = useCallback(async (q: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ mastersOnly: 'true', limit: '50' });
      if (q) params.set('search', q);
      const res = await fetch(`/api/products?${params}`);
      if (res.ok) {
        const data = await res.json();
        setCandidates(
          (data.products || []).map((p: CandidateProduct) => ({
            id: p.id,
            sku: p.sku,
            name: p.name,
            isBoothEnabled: p.isBoothEnabled,
            parentProductId: p.parentProductId,
            bundleCategory: p.bundleCategory ? { id: p.bundleCategory.id, name: p.bundleCategory.name } : null,
          }))
        );
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => fetchCandidates(search), 250);
    return () => clearTimeout(t);
  }, [open, search, fetchCandidates]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSave = async () => {
    if (!category) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/bundle/categories/${category.id}/products`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productIds: Array.from(selected) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Gagal menyimpan produk');
      toast.success(`Produk ${category.name} diperbarui`);
      onSaved();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal menyimpan produk');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Kelola Produk — {category?.name}</DialogTitle>
          <DialogDescription>Pilih Master SKU yang masuk kategori ini. Anak SKU-nya ikut otomatis.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--t-subtle)]" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari SKU atau nama produk..." className="pl-9 h-9 bg-[var(--card)] border-[var(--bd)] rounded-lg" />
          </div>
          <div className="max-h-72 overflow-y-auto rounded-lg border border-[var(--bd)] divide-y divide-[var(--surface-2)]">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-5 h-5 animate-spin text-[var(--t-muted)]" />
              </div>
            ) : candidates.length === 0 ? (
              <p className="text-xs text-[var(--t-muted)] text-center py-8">Tidak ada Master SKU ditemukan</p>
            ) : (
              candidates.map((c) => {
                const inOtherCategory = c.bundleCategory && c.bundleCategory.id !== category?.id;
                return (
                  <label key={c.id} className="flex items-center gap-2.5 px-3 py-2.5 hover:bg-[var(--surface-hover)] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selected.has(c.id)}
                      onChange={() => toggle(c.id)}
                      className="w-4 h-4 accent-[var(--brand)] cursor-pointer"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-[var(--t-heading)]">{c.name}</p>
                      <p className="text-xs text-[var(--t-muted)]">{c.sku}</p>
                    </div>
                    {inOtherCategory && (
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-[var(--warning)]/10 text-[var(--warning)] flex-shrink-0">
                        di {c.bundleCategory!.name}
                      </span>
                    )}
                  </label>
                );
              })
            )}
          </div>
          <p className="text-[11px] text-[var(--t-subtle)]">{selected.size} produk dipilih. Produk yang udah di kategori lain bakal dipindah ke sini.</p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Batal</Button>
          <Button onClick={handleSave} disabled={saving} className="bg-[var(--brand)] hover:bg-[var(--brand-dark)] text-white">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Simpan'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============ SUB-TAB: KATEGORI BUNDLE ============

function KategoriTab() {
  const [categories, setCategories] = useState<BundleCategoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<BundleCategoryRow | null>(null);
  const [productsTarget, setProductsTarget] = useState<BundleCategoryRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<BundleCategoryRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchCategories = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/bundle/categories');
      if (res.ok) {
        const data = await res.json();
        setCategories(data.categories || []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/bundle/categories/${deleteTarget.id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Gagal menghapus kategori');
      toast.success(`${deleteTarget.name} dihapus`);
      setDeleteTarget(null);
      fetchCategories();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal menghapus kategori');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-[var(--t-body)]">Kategori yang produknya dihitung sama & boleh dicampur dalam 1 paket.</p>
        <Button
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
          className="bg-[var(--brand)] hover:bg-[var(--brand-dark)] text-white gap-1.5"
        >
          <Plus className="w-4 h-4" /> Tambah Kategori
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-[var(--t-muted)]" />
        </div>
      ) : categories.length === 0 ? (
        <div className="bg-[var(--card)] rounded-xl border border-[var(--bd)] py-16 flex flex-col items-center gap-3">
          <Tag className="w-6 h-6 text-[var(--t-muted)]" />
          <p className="text-sm text-[var(--t-body)]">Belum ada Kategori Bundle</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {categories.map((cat) => (
            <div key={cat.id} className="bg-[var(--card)] rounded-xl border border-[var(--bd)] p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[var(--t-heading)]">{cat.name}</p>
                  <p className="text-xs text-[var(--t-muted)]">{cat.code} · {formatRupiah(cat.normalPrice)}/pcs</p>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button onClick={() => { setEditing(cat); setFormOpen(true); }} title="Edit" className="p-1.5 rounded-md text-[var(--t-muted)] hover:bg-[var(--surface-2)] cursor-pointer">
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => setDeleteTarget(cat)} title="Hapus" className="p-1.5 rounded-md text-[var(--danger)] hover:bg-[var(--danger)]/10 cursor-pointer">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              {cat.bulkMinQty != null && cat.bulkUnitPrice != null && (
                <p className="text-[11px] text-[var(--brand)] mt-1.5">
                  Bulk: {cat.bulkMinQty}+ pcs @ {formatRupiah(cat.bulkUnitPrice)} ({cat.bulkTierName || cat.name})
                </p>
              )}
              <button
                onClick={() => setProductsTarget(cat)}
                className="mt-3 w-full flex items-center justify-between text-left bg-[var(--surface)] hover:bg-[var(--surface-2)] rounded-lg px-3 py-2 cursor-pointer transition-colors"
              >
                <span className="text-xs text-[var(--t-body)]">{cat.products.length} produk</span>
                <span className="text-[11px] font-medium text-[var(--brand)]">Kelola Produk</span>
              </button>
            </div>
          ))}
        </div>
      )}

      <CategoryFormDialog open={formOpen} onClose={() => setFormOpen(false)} editing={editing} onSaved={fetchCategories} />
      <CategoryProductsDialog open={!!productsTarget} onClose={() => setProductsTarget(null)} category={productsTarget} onSaved={fetchCategories} />

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus {deleteTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Kategori cuma bisa dihapus kalau nggak ada produk & nggak dipakai di paket manapun lagi.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleting} className="bg-[var(--danger)] hover:bg-[var(--danger-dark)] text-white">
              {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Hapus'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ============ PACKAGE FORM DIALOG ============

function PackageFormDialog({
  open,
  onClose,
  editing,
  categories,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  editing: BundlePackageRow | null;
  categories: BundleCategoryRow[];
  onSaved: () => void;
}) {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [rows, setRows] = useState<Array<{ categoryId: string; qty: string }>>([{ categoryId: '', qty: '1' }]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCode(editing?.code ?? '');
    setName(editing?.name ?? '');
    setPrice(editing ? String(editing.price) : '');
    setRows(
      editing && editing.requirements.length > 0
        ? editing.requirements.map((r) => ({ categoryId: r.category.id, qty: String(r.qty) }))
        : [{ categoryId: categories[0]?.id ?? '', qty: '1' }]
    );
  }, [open, editing, categories]);

  const addRow = () => setRows((prev) => [...prev, { categoryId: '', qty: '1' }]);
  const removeRow = (idx: number) => setRows((prev) => prev.filter((_, i) => i !== idx));
  const updateRow = (idx: number, patch: Partial<{ categoryId: string; qty: string }>) =>
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));

  const handleSave = async () => {
    if (!code.trim() || !name.trim() || price === '') {
      toast.error('Kode, nama, dan harga wajib diisi');
      return;
    }
    const requirements = rows
      .filter((r) => r.categoryId && r.qty.trim() !== '')
      .map((r) => ({ categoryId: r.categoryId, qty: parseInt(r.qty, 10) }));
    if (requirements.length === 0) {
      toast.error('Isi minimal 1 requirement kategori + qty');
      return;
    }
    if (requirements.some((r) => isNaN(r.qty) || r.qty < 1)) {
      toast.error('Qty requirement harus angka >= 1');
      return;
    }
    setSaving(true);
    try {
      const payload = { code: code.trim(), name: name.trim(), price: parseInt(price, 10), requirements };
      const res = await fetch(editing ? `/api/bundle/packages/${editing.id}` : '/api/bundle/packages', {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Gagal menyimpan paket');
      toast.success(editing ? `${payload.name} diperbarui` : `${payload.name} ditambahkan`);
      onSaved();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal menyimpan paket');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit Paket Fixed' : 'Tambah Paket Fixed'}</DialogTitle>
          <DialogDescription>Harga flat buat kombinasi qty tertentu — boleh 1 kategori (Single/Couple) atau lebih (Finisher).</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs font-medium text-[var(--t-muted)] mb-1 block">Kode (internal)</Label>
              <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="FINISHER" className="h-9 bg-[var(--card)] border-[var(--bd)] rounded-lg" />
            </div>
            <div>
              <Label className="text-xs font-medium text-[var(--t-muted)] mb-1 block">Nama Tampilan</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Finisher" className="h-9 bg-[var(--card)] border-[var(--bd)] rounded-lg" />
            </div>
          </div>
          <div>
            <Label className="text-xs font-medium text-[var(--t-muted)] mb-1 block">Harga Paket (Rp)</Label>
            <Input type="number" min={0} value={price} onChange={(e) => setPrice(e.target.value)} placeholder="129000" className="h-9 bg-[var(--card)] border-[var(--bd)] rounded-lg" />
          </div>
          <div className="pt-1 border-t border-[var(--bd)]">
            <p className="text-xs font-medium text-[var(--t-heading)] mt-2 mb-2">Requirement Kategori</p>
            <div className="space-y-2">
              {rows.map((row, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <select
                    value={row.categoryId}
                    onChange={(e) => updateRow(idx, { categoryId: e.target.value })}
                    className="h-9 flex-1 rounded-lg border border-[var(--bd)] bg-[var(--card)] px-2 text-sm text-[var(--t-heading)]"
                  >
                    <option value="">Pilih kategori...</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                  <Input
                    type="number"
                    min={1}
                    value={row.qty}
                    onChange={(e) => updateRow(idx, { qty: e.target.value })}
                    className="h-9 w-20 bg-[var(--card)] border-[var(--bd)] rounded-lg"
                  />
                  <button
                    onClick={() => removeRow(idx)}
                    disabled={rows.length === 1}
                    className="p-1.5 rounded-md text-[var(--danger)] hover:bg-[var(--danger)]/10 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed flex-shrink-0"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
            <button onClick={addRow} className="mt-2 text-xs font-medium text-[var(--brand)] hover:underline cursor-pointer flex items-center gap-1">
              <Plus className="w-3 h-3" /> Tambah kategori
            </button>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Batal</Button>
          <Button onClick={handleSave} disabled={saving} className="bg-[var(--brand)] hover:bg-[var(--brand-dark)] text-white">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Simpan'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============ SUB-TAB: PAKET FIXED ============

function PaketTab() {
  const [packages, setPackages] = useState<BundlePackageRow[]>([]);
  const [categories, setCategories] = useState<BundleCategoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<BundlePackageRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<BundlePackageRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [pkgRes, catRes] = await Promise.all([fetch('/api/bundle/packages'), fetch('/api/bundle/categories')]);
      if (pkgRes.ok) setPackages((await pkgRes.json()).packages || []);
      if (catRes.ok) setCategories((await catRes.json()).categories || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/bundle/packages/${deleteTarget.id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Gagal menghapus paket');
      toast.success(`${deleteTarget.name} dihapus`);
      setDeleteTarget(null);
      fetchAll();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal menghapus paket');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-[var(--t-body)]">Harga flat per kombinasi qty — POS otomatis pilih kombinasi termurah.</p>
        <Button
          onClick={() => {
            if (categories.length === 0) {
              toast.error('Bikin Kategori Bundle dulu sebelum nambah paket');
              return;
            }
            setEditing(null);
            setFormOpen(true);
          }}
          className="bg-[var(--brand)] hover:bg-[var(--brand-dark)] text-white gap-1.5"
        >
          <Plus className="w-4 h-4" /> Tambah Paket
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-[var(--t-muted)]" />
        </div>
      ) : packages.length === 0 ? (
        <div className="bg-[var(--card)] rounded-xl border border-[var(--bd)] py-16 flex flex-col items-center gap-3">
          <Package2 className="w-6 h-6 text-[var(--t-muted)]" />
          <p className="text-sm text-[var(--t-body)]">Belum ada Paket Fixed</p>
        </div>
      ) : (
        <div className="bg-[var(--card)] rounded-xl border border-[var(--bd)] overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-[var(--surface)]">
                <th className="text-left text-[11px] font-medium text-[var(--t-muted)] py-2 px-4">Nama</th>
                <th className="text-left text-[11px] font-medium text-[var(--t-muted)] py-2 px-3">Requirement</th>
                <th className="text-right text-[11px] font-medium text-[var(--t-muted)] py-2 px-3">Harga</th>
                <th className="w-20" />
              </tr>
            </thead>
            <tbody>
              {packages.map((pkg) => (
                <tr key={pkg.id} className="border-t border-[var(--surface-2)] hover:bg-[var(--surface-hover)] transition-colors">
                  <td className="py-2.5 px-4">
                    <p className="text-sm font-medium text-[var(--t-heading)]">{pkg.name}</p>
                    <p className="text-[11px] text-[var(--t-muted)]">{pkg.code}</p>
                  </td>
                  <td className="py-2.5 px-3 text-xs text-[var(--t-body)]">{requirementsLabel(pkg.requirements)}</td>
                  <td className="py-2.5 px-3 text-right text-sm font-semibold text-[var(--t-heading)]">{formatRupiah(pkg.price)}</td>
                  <td className="py-2.5 px-2 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => { setEditing(pkg); setFormOpen(true); }} title="Edit" className="p-1.5 rounded-md text-[var(--t-muted)] hover:bg-[var(--surface-2)] cursor-pointer">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => setDeleteTarget(pkg)} title="Hapus" className="p-1.5 rounded-md text-[var(--danger)] hover:bg-[var(--danger)]/10 cursor-pointer">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <PackageFormDialog open={formOpen} onClose={() => setFormOpen(false)} editing={editing} categories={categories} onSaved={fetchAll} />

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus {deleteTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>Paket ini nggak akan dipakai lagi buat optimasi harga di POS.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleting} className="bg-[var(--danger)] hover:bg-[var(--danger-dark)] text-white">
              {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Hapus'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ============ MAIN EXPORT ============

export function BundlePricing() {
  const [subTab, setSubTab] = useState<'kategori' | 'paket'>('kategori');

  return (
    <div>
      <div className="flex items-center bg-[var(--surface)] rounded-lg p-0.5 mb-4 w-fit">
        <button
          onClick={() => setSubTab('kategori')}
          className={`px-4 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
            subTab === 'kategori' ? 'bg-[var(--card)] text-[var(--brand)] shadow-sm' : 'text-[var(--t-body)] hover:text-[var(--t-heading)]'
          }`}
        >
          <Tag className="w-3.5 h-3.5" /> Kategori Bundle
        </button>
        <button
          onClick={() => setSubTab('paket')}
          className={`px-4 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
            subTab === 'paket' ? 'bg-[var(--card)] text-[var(--brand)] shadow-sm' : 'text-[var(--t-body)] hover:text-[var(--t-heading)]'
          }`}
        >
          <Layers className="w-3.5 h-3.5" /> Paket Fixed
        </button>
      </div>

      {subTab === 'kategori' ? <KategoriTab /> : <PaketTab />}
    </div>
  );
}
