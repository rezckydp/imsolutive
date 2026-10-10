'use client';

import { useState, useEffect, useCallback } from 'react';
import { Plus, Pencil, Trash2, Loader2, Sparkles, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
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

interface EligibleProduct {
  id: string;
  sku: string;
  name: string;
}

interface AddOnRow {
  id: string;
  code: string;
  name: string;
  price: number;
  inputType: 'NONE' | 'TEXT';
  maxLength: number | null;
  active: boolean;
  eligibleProducts: Array<{ id: string; product: EligibleProduct }>;
}

interface CandidateProduct {
  id: string;
  sku: string;
  name: string;
  parentProductId: string | null;
}

function formatRupiah(n: number): string {
  return `Rp ${n.toLocaleString('id-ID')}`;
}

// ============ ADD-ON FORM DIALOG ============

function AddOnFormDialog({
  open,
  onClose,
  editing,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  editing: AddOnRow | null;
  onSaved: () => void;
}) {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [inputType, setInputType] = useState<'NONE' | 'TEXT'>('NONE');
  const [maxLength, setMaxLength] = useState('');
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCode(editing?.code ?? '');
    setName(editing?.name ?? '');
    setPrice(editing ? String(editing.price) : '');
    setInputType(editing?.inputType ?? 'NONE');
    setMaxLength(editing?.maxLength != null ? String(editing.maxLength) : '20');
    setActive(editing?.active ?? true);
  }, [open, editing]);

  const handleSave = async () => {
    if (!code.trim() || !name.trim() || price === '') {
      toast.error('Kode, nama, dan harga wajib diisi');
      return;
    }
    if (inputType === 'TEXT' && (!maxLength.trim() || parseInt(maxLength, 10) < 1)) {
      toast.error('Add-on tipe teks butuh batas karakter >= 1');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        code: code.trim(),
        name: name.trim(),
        price: parseInt(price, 10),
        inputType,
        maxLength: inputType === 'TEXT' ? parseInt(maxLength, 10) : null,
        active,
      };
      const res = await fetch(editing ? `/api/addons/${editing.id}` : '/api/addons', {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Gagal menyimpan add-on');
      toast.success(editing ? `${payload.name} diperbarui` : `${payload.name} ditambahkan`);
      onSaved();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal menyimpan add-on');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit Add-On' : 'Tambah Add-On'}</DialogTitle>
          <DialogDescription>Add-on generik — bisa dipasang ke produk manapun yang di-assign eligible di bawah.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs font-medium text-[var(--t-muted)] mb-1 block">Kode (internal)</Label>
              <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="ENGRAVE" className="h-9 bg-[var(--card)] border-[var(--bd)] rounded-lg" />
            </div>
            <div>
              <Label className="text-xs font-medium text-[var(--t-muted)] mb-1 block">Nama Tampilan</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Engrave Teks" className="h-9 bg-[var(--card)] border-[var(--bd)] rounded-lg" />
            </div>
          </div>
          <div>
            <Label className="text-xs font-medium text-[var(--t-muted)] mb-1 block">Harga Tambahan (Rp)</Label>
            <Input type="number" min={0} value={price} onChange={(e) => setPrice(e.target.value)} placeholder="10000" className="h-9 bg-[var(--card)] border-[var(--bd)] rounded-lg" />
          </div>
          <div>
            <Label className="text-xs font-medium text-[var(--t-muted)] mb-1 block">Tipe Input</Label>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setInputType('NONE')}
                className={`h-9 rounded-lg text-sm font-medium border cursor-pointer ${
                  inputType === 'NONE' ? 'bg-[var(--brand)] text-white border-[var(--brand)]' : 'bg-[var(--card)] text-[var(--t-body)] border-[var(--bd)]'
                }`}
              >
                Tanpa Teks
              </button>
              <button
                onClick={() => setInputType('TEXT')}
                className={`h-9 rounded-lg text-sm font-medium border cursor-pointer ${
                  inputType === 'TEXT' ? 'bg-[var(--brand)] text-white border-[var(--brand)]' : 'bg-[var(--card)] text-[var(--t-body)] border-[var(--bd)]'
                }`}
              >
                Butuh Teks
              </button>
            </div>
          </div>
          {inputType === 'TEXT' && (
            <div>
              <Label className="text-xs font-medium text-[var(--t-muted)] mb-1 block">Maks Karakter</Label>
              <Input type="number" min={1} value={maxLength} onChange={(e) => setMaxLength(e.target.value)} className="h-9 w-28 bg-[var(--card)] border-[var(--bd)] rounded-lg" />
            </div>
          )}
          <div className="flex items-center justify-between gap-3 rounded-lg border border-[var(--bd)] px-3 py-2.5">
            <div>
              <p className="text-sm font-medium text-[var(--t-heading)]">Aktif</p>
              <p className="text-xs text-[var(--t-muted)]">Nonaktif = gak muncul lagi di POS, histori lama tetap aman</p>
            </div>
            <Switch checked={active} onCheckedChange={setActive} />
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

// ============ ELIGIBLE PRODUCTS DIALOG ============

function AddOnProductsDialog({
  open,
  onClose,
  addOn,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  addOn: AddOnRow | null;
  onSaved: () => void;
}) {
  const [search, setSearch] = useState('');
  const [candidates, setCandidates] = useState<CandidateProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !addOn) return;
    setSelected(new Set(addOn.eligibleProducts.map((ep) => ep.product.id)));
    setSearch('');
  }, [open, addOn]);

  const fetchCandidates = useCallback(async (q: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ mastersOnly: 'true', limit: '50' });
      if (q) params.set('search', q);
      const res = await fetch(`/api/products?${params}`);
      if (res.ok) {
        const data = await res.json();
        setCandidates(
          (data.products || []).map((p: CandidateProduct) => ({ id: p.id, sku: p.sku, name: p.name, parentProductId: p.parentProductId }))
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
    if (!addOn) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/addons/${addOn.id}/products`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productIds: Array.from(selected) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Gagal menyimpan produk');
      toast.success(`Produk eligible ${addOn.name} diperbarui`);
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
          <DialogTitle>Produk Eligible — {addOn?.name}</DialogTitle>
          <DialogDescription>Pilih Master SKU yang boleh pakai add-on ini. Anak SKU-nya ikut otomatis.</DialogDescription>
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
              candidates.map((c) => (
                <label key={c.id} className="flex items-center gap-2.5 px-3 py-2.5 hover:bg-[var(--surface-hover)] cursor-pointer">
                  <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggle(c.id)} className="w-4 h-4 accent-[var(--brand)] cursor-pointer" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-[var(--t-heading)]">{c.name}</p>
                    <p className="text-xs text-[var(--t-muted)]">{c.sku}</p>
                  </div>
                </label>
              ))
            )}
          </div>
          <p className="text-[11px] text-[var(--t-subtle)]">{selected.size} produk dipilih — produk boleh eligible buat beberapa add-on sekaligus.</p>
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

// ============ MAIN EXPORT ============

export function AddOnManagement() {
  const [addOns, setAddOns] = useState<AddOnRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<AddOnRow | null>(null);
  const [productsTarget, setProductsTarget] = useState<AddOnRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AddOnRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchAddOns = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/addons');
      if (res.ok) setAddOns((await res.json()).addOns || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAddOns();
  }, [fetchAddOns]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/addons/${deleteTarget.id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Gagal menghapus add-on');
      toast.success(`${deleteTarget.name} dihapus`);
      setDeleteTarget(null);
      fetchAddOns();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal menghapus add-on');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-[var(--t-body)]">
          Add-on generik (mis. Engrave) — pasang di item manapun yang eligible, harga disnapshot tiap transaksi.
        </p>
        <Button
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
          className="bg-[var(--brand)] hover:bg-[var(--brand-dark)] text-white gap-1.5"
        >
          <Plus className="w-4 h-4" /> Tambah Add-On
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-[var(--t-muted)]" />
        </div>
      ) : addOns.length === 0 ? (
        <div className="bg-[var(--card)] rounded-xl border border-[var(--bd)] py-16 flex flex-col items-center gap-3">
          <Sparkles className="w-6 h-6 text-[var(--t-muted)]" />
          <p className="text-sm text-[var(--t-body)]">Belum ada Add-On</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {addOns.map((a) => (
            <div key={a.id} className={`bg-[var(--card)] rounded-xl border border-[var(--bd)] p-4 ${!a.active ? 'opacity-60' : ''}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[var(--t-heading)] flex items-center gap-1.5">
                    {a.name}
                    {!a.active && (
                      <span className="text-[9px] font-semibold px-1 py-0 rounded bg-[var(--t-muted)]/10 text-[var(--t-muted)]">Nonaktif</span>
                    )}
                  </p>
                  <p className="text-xs text-[var(--t-muted)]">
                    {a.code} · {formatRupiah(a.price)} · {a.inputType === 'TEXT' ? `Teks maks ${a.maxLength}` : 'Tanpa teks'}
                  </p>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button onClick={() => { setEditing(a); setFormOpen(true); }} title="Edit" className="p-1.5 rounded-md text-[var(--t-muted)] hover:bg-[var(--surface-2)] cursor-pointer">
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => setDeleteTarget(a)} title="Hapus" className="p-1.5 rounded-md text-[var(--danger)] hover:bg-[var(--danger)]/10 cursor-pointer">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              <button
                onClick={() => setProductsTarget(a)}
                className="mt-3 w-full flex items-center justify-between text-left bg-[var(--surface)] hover:bg-[var(--surface-2)] rounded-lg px-3 py-2 cursor-pointer transition-colors"
              >
                <span className="text-xs text-[var(--t-body)]">{a.eligibleProducts.length} produk eligible</span>
                <span className="text-[11px] font-medium text-[var(--brand)]">Kelola Produk</span>
              </button>
            </div>
          ))}
        </div>
      )}

      <AddOnFormDialog open={formOpen} onClose={() => setFormOpen(false)} editing={editing} onSaved={fetchAddOns} />
      <AddOnProductsDialog open={!!productsTarget} onClose={() => setProductsTarget(null)} addOn={productsTarget} onSaved={fetchAddOns} />

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus {deleteTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Cuma bisa dihapus kalau belum pernah kepakai di transaksi manapun — kalau udah pernah, nonaktifkan aja.
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
