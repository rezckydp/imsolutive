'use client';

import { useState, useEffect, useCallback } from 'react';
import { Search, Loader2, AlertTriangle, ArrowRight, ArrowLeft, Layers } from 'lucide-react';
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

interface CandidateProduct {
  id: string;
  sku: string;
  name: string;
  parentProductId: string | null;
  childProducts?: Array<{ id: string }>;
  variants?: Array<{ id: string }>;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onMerged: () => void;
}

export function MergeMatrixDialog({ open, onClose, onMerged }: Props) {
  const [step, setStep] = useState<'select' | 'configure'>('select');
  const [search, setSearch] = useState('');
  const [candidates, setCandidates] = useState<CandidateProduct[]>([]);
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [selected, setSelected] = useState<CandidateProduct[]>([]);

  const [variasi1Name, setVariasi1Name] = useState('');
  const [labels, setLabels] = useState<Record<string, string>>({}); // sku -> label
  const [targetMode, setTargetMode] = useState<'existing' | 'new'>('existing');
  const [baseSku, setBaseSku] = useState('');
  const [newSku, setNewSku] = useState('');
  const [newName, setNewName] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [merging, setMerging] = useState(false);

  const reset = useCallback(() => {
    setStep('select');
    setSearch('');
    setSelected([]);
    setVariasi1Name('');
    setLabels({});
    setTargetMode('existing');
    setBaseSku('');
    setNewSku('');
    setNewName('');
  }, []);

  useEffect(() => {
    if (!open) reset();
  }, [open, reset]);

  const fetchCandidates = useCallback(async (q: string) => {
    setLoadingCandidates(true);
    try {
      const params = new URLSearchParams({ mastersOnly: 'true', limit: '30' });
      if (q) params.set('search', q);
      const res = await fetch(`/api/products?${params}`);
      if (res.ok) {
        const data = await res.json();
        const list: CandidateProduct[] = (data.products || []).filter(
          (p: CandidateProduct) => !p.parentProductId && (p.childProducts?.length ?? 0) === 0
        );
        setCandidates(list);
      }
    } finally {
      setLoadingCandidates(false);
    }
  }, []);

  useEffect(() => {
    if (!open || step !== 'select') return;
    const t = setTimeout(() => fetchCandidates(search), 250);
    return () => clearTimeout(t);
  }, [open, step, search, fetchCandidates]);

  const toggleSelected = (p: CandidateProduct) => {
    setSelected((prev) =>
      prev.some((x) => x.id === p.id) ? prev.filter((x) => x.id !== p.id) : [...prev, p]
    );
  };

  const goToConfigure = () => {
    if (selected.length < 2) return;
    setBaseSku(selected[0].sku);
    setStep('configure');
  };

  const allLabelsFilled = selected.every((p) => labels[p.sku]?.trim());
  const labelsUnique = new Set(selected.map((p) => labels[p.sku]?.trim().toLowerCase())).size === selected.length;
  const targetValid = targetMode === 'existing' ? !!baseSku : !!newSku.trim() && !!newName.trim();
  const canSubmit = variasi1Name.trim() && allLabelsFilled && labelsUnique && targetValid;

  const handleMerge = async () => {
    setMerging(true);
    try {
      const res = await fetch('/api/products/merge-matrix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sources: selected.map((p) => ({ sku: p.sku, label: labels[p.sku]?.trim() })),
          variasi1Name: variasi1Name.trim(),
          target:
            targetMode === 'existing'
              ? { mode: 'existing', sku: baseSku }
              : { mode: 'new', sku: newSku.trim(), name: newName.trim() },
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Gagal menggabungkan produk');
      toast.success(`${selected.length} produk digabung jadi 1 produk matrix`);
      setConfirmOpen(false);
      onMerged();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal menggabungkan produk');
    } finally {
      setMerging(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="sm:max-w-lg rounded-xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-[var(--t-heading)]">
              <Layers className="w-5 h-5 text-[var(--brand)]" />
              Gabung ke Produk Matrix
            </DialogTitle>
            <DialogDescription>
              {step === 'select'
                ? 'Pilih 2+ produk Standalone (misal FM001-D13 & FM001-D15) yang sebenarnya cuma beda Variasi — bukan produk Master-Child.'
                : 'Kasih label Variasi tiap produk, dan tentukan identitas produk hasil gabungan.'}
            </DialogDescription>
          </DialogHeader>

          {step === 'select' ? (
            <div className="flex-1 overflow-y-auto space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--t-subtle)]" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Cari SKU atau nama produk..."
                  className="pl-9 h-9 bg-[var(--card)] border-[var(--bd)] rounded-lg"
                />
              </div>
              <div className="max-h-80 overflow-y-auto rounded-lg border border-[var(--bd)] divide-y divide-[var(--surface-2)]">
                {loadingCandidates ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-5 h-5 animate-spin text-[var(--t-muted)]" />
                  </div>
                ) : candidates.length === 0 ? (
                  <p className="text-xs text-[var(--t-muted)] text-center py-8">Tidak ada produk Standalone yang cocok</p>
                ) : (
                  candidates.map((c) => (
                    <label key={c.id} className="flex items-center gap-2.5 px-3 py-2.5 hover:bg-[var(--surface-hover)] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selected.some((x) => x.id === c.id)}
                        onChange={() => toggleSelected(c)}
                        className="w-4 h-4 accent-[var(--brand)] cursor-pointer"
                      />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-[var(--t-heading)]">{c.name}</p>
                        <p className="text-xs text-[var(--t-muted)]">{c.sku} · {c.variants?.length ?? 0} varian</p>
                      </div>
                    </label>
                  ))
                )}
              </div>
              <p className="text-xs text-[var(--t-muted)]">{selected.length} produk dipilih (minimal 2)</p>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto space-y-4">
              <div className="space-y-1.5">
                <Label className="text-sm font-medium text-[var(--t-heading)]">Nama Variasi (mis. Ukuran)</Label>
                <Input
                  value={variasi1Name}
                  onChange={(e) => setVariasi1Name(e.target.value)}
                  placeholder="Ukuran"
                  className="h-9 bg-[var(--card)] border-[var(--bd)] rounded-lg"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium text-[var(--t-heading)]">Label tiap produk</Label>
                {selected.map((p) => (
                  <div key={p.id} className="flex items-center gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-[var(--t-heading)] truncate">{p.name}</p>
                      <p className="text-xs text-[var(--t-muted)]">{p.sku}</p>
                    </div>
                    <Input
                      value={labels[p.sku] || ''}
                      onChange={(e) => setLabels((prev) => ({ ...prev, [p.sku]: e.target.value }))}
                      placeholder="mis. D13"
                      className="h-9 w-28 bg-[var(--card)] border-[var(--bd)] rounded-lg"
                    />
                  </div>
                ))}
                {!labelsUnique && (
                  <p className="text-[11px] text-[var(--danger)]">Label tidak boleh sama antar produk</p>
                )}
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium text-[var(--t-heading)]">Identitas produk hasil gabungan</Label>
                <div className="space-y-2">
                  <label className="flex items-start gap-2 cursor-pointer">
                    <input
                      type="radio"
                      checked={targetMode === 'existing'}
                      onChange={() => setTargetMode('existing')}
                      className="mt-1 accent-[var(--brand)] cursor-pointer"
                    />
                    <div className="flex-1">
                      <p className="text-sm text-[var(--t-heading)]">Pakai salah satu produk yang dipilih sebagai dasar</p>
                      {targetMode === 'existing' && (
                        <select
                          value={baseSku}
                          onChange={(e) => setBaseSku(e.target.value)}
                          className="mt-1.5 h-9 w-full text-sm bg-[var(--card)] border border-[var(--bd)] rounded-lg px-2 cursor-pointer"
                        >
                          {selected.map((p) => (
                            <option key={p.sku} value={p.sku}>{p.sku} — {p.name}</option>
                          ))}
                        </select>
                      )}
                    </div>
                  </label>
                  <label className="flex items-start gap-2 cursor-pointer">
                    <input
                      type="radio"
                      checked={targetMode === 'new'}
                      onChange={() => setTargetMode('new')}
                      className="mt-1 accent-[var(--brand)] cursor-pointer"
                    />
                    <div className="flex-1 space-y-1.5">
                      <p className="text-sm text-[var(--t-heading)]">Buat produk baru sebagai wadah</p>
                      {targetMode === 'new' && (
                        <div className="grid grid-cols-2 gap-1.5">
                          <Input
                            value={newSku}
                            onChange={(e) => setNewSku(e.target.value)}
                            placeholder="Master SKU baru"
                            className="h-9 bg-[var(--card)] border-[var(--bd)] rounded-lg"
                          />
                          <Input
                            value={newName}
                            onChange={(e) => setNewName(e.target.value)}
                            placeholder="Nama produk"
                            className="h-9 bg-[var(--card)] border-[var(--bd)] rounded-lg"
                          />
                        </div>
                      )}
                    </div>
                  </label>
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            {step === 'select' ? (
              <>
                <Button variant="outline" onClick={onClose}>Batal</Button>
                <Button
                  onClick={goToConfigure}
                  disabled={selected.length < 2}
                  className="bg-[var(--brand)] hover:bg-[var(--brand-dark)] text-white gap-1.5"
                >
                  Lanjut <ArrowRight className="w-4 h-4" />
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" onClick={() => setStep('select')} className="gap-1.5">
                  <ArrowLeft className="w-4 h-4" /> Kembali
                </Button>
                <Button
                  onClick={() => setConfirmOpen(true)}
                  disabled={!canSubmit}
                  className="bg-[var(--brand)] hover:bg-[var(--brand-dark)] text-white"
                >
                  Gabungkan
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-[var(--warning)]" />
              Gabungkan {selected.length} produk?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {selected.map((p) => `${p.sku} (${labels[p.sku] || '-'})`).join(', ')} akan digabung jadi 1 produk
              {targetMode === 'existing' ? ` dengan identitas "${baseSku}"` : ` baru bernama "${newSku || '...'}"`}.
              Produk sumber yang bukan dasar akan DIHAPUS (variannya dipindah, histori order/produksi lama tetap aman).
              Tindakan ini tidak bisa dibatalkan otomatis.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={merging}>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleMerge}
              disabled={merging}
              className="bg-[var(--warning)] hover:bg-[var(--warning-dark)] text-white"
            >
              {merging ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Ya, Gabungkan'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
