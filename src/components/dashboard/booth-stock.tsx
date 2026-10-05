'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Plus,
  X,
  Printer,
  Loader2,
  Pencil,
  ChevronDown,
  ChevronRight,
  Search,
  AlertTriangle,
  Calendar as CalendarIcon,
  Sparkles,
  GripVertical,
  Target,
  RefreshCw,
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
import { getVariantLabel } from '@/lib/stock-sync';

// ============ TYPES ============

interface RosterVariant {
  id: string;
  color: string;
  colorHex: string;
  type: string;
  qty: number;
  queued: number;
  boothMinStock: number | null;
  kurang: number;
}

interface RosterProduct {
  id: string;
  sku: string;
  name: string;
  variants: RosterVariant[];
}

interface CandidateProduct {
  id: string;
  sku: string;
  name: string;
  isBoothEnabled: boolean;
  parentProductId: string | null;
}

interface PlanCardVariant {
  id: string;
  color: string;
  colorHex: string;
  type: string;
  product: { sku: string; name: string };
}

interface PlanCard {
  id: string;
  variantId: string;
  qty: number;
  scheduledDate: string;
  variant: PlanCardVariant;
}

// Local-calendar-day string (YYYY-MM-DD) — deliberately avoids
// toISOString(), which converts to UTC and can shift the date by a day
// depending on the browser's timezone offset.
function toDateOnly(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatDateShort(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short' });
}

// ============ SUB-TAB: TARGET STOK ============

function TargetStokTab() {
  const [roster, setRoster] = useState<RosterProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const expandInitialized = useRef(false);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [removeTarget, setRemoveTarget] = useState<RosterProduct | null>(null);
  const [removing, setRemoving] = useState(false);

  // Inline target edit
  const [editingTarget, setEditingTarget] = useState<{ variantId: string; value: string } | null>(null);
  const [savingTarget, setSavingTarget] = useState(false);

  // Bulk target fill (same qty for every color/type of one Master SKU)
  const [bulkTarget, setBulkTarget] = useState<RosterProduct | null>(null);
  const [bulkTargetValue, setBulkTargetValue] = useState('');
  const [savingBulkTarget, setSavingBulkTarget] = useState(false);

  // Add SKU dialog
  const [addOpen, setAddOpen] = useState(false);
  const [addSearch, setAddSearch] = useState('');
  const [candidates, setCandidates] = useState<CandidateProduct[]>([]);
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [selectedSkus, setSelectedSkus] = useState<Set<string>>(new Set());
  const [addingRoster, setAddingRoster] = useState(false);

  const fetchRoster = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/booth/roster');
      if (res.ok) {
        const data = await res.json();
        setRoster(data.roster || []);
        if (!expandInitialized.current) {
          expandInitialized.current = true;
          setExpanded(new Set<string>((data.roster || []).map((p: RosterProduct) => p.id)));
        }
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRoster();
  }, [fetchRoster]);

  const toggleExpanded = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const fetchCandidates = useCallback(async (search: string) => {
    setLoadingCandidates(true);
    try {
      const params = new URLSearchParams({ mastersOnly: 'true', limit: '30' });
      if (search) params.set('search', search);
      const res = await fetch(`/api/products?${params}`);
      if (res.ok) {
        const data = await res.json();
        const list: CandidateProduct[] = (data.products || []).map((p: CandidateProduct) => ({
          id: p.id,
          sku: p.sku,
          name: p.name,
          isBoothEnabled: p.isBoothEnabled,
          parentProductId: p.parentProductId,
        }));
        setCandidates(list.filter((p) => !p.isBoothEnabled));
      }
    } finally {
      setLoadingCandidates(false);
    }
  }, []);

  useEffect(() => {
    if (!addOpen) return;
    const t = setTimeout(() => fetchCandidates(addSearch), 250);
    return () => clearTimeout(t);
  }, [addOpen, addSearch, fetchCandidates]);

  const openAddDialog = () => {
    setSelectedSkus(new Set());
    setAddSearch('');
    setAddOpen(true);
  };

  const toggleSelected = (sku: string) => {
    setSelectedSkus((prev) => {
      const next = new Set(prev);
      if (next.has(sku)) next.delete(sku);
      else next.add(sku);
      return next;
    });
  };

  const handleAddSelected = async () => {
    if (selectedSkus.size === 0) return;
    setAddingRoster(true);
    try {
      const results = await Promise.allSettled(
        Array.from(selectedSkus).map((sku) =>
          fetch('/api/booth/roster', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sku }),
          }).then((r) => {
            if (!r.ok) throw new Error(sku);
          })
        )
      );
      const failed = results.filter((r) => r.status === 'rejected').length;
      if (failed > 0) {
        toast.error(`${failed} SKU gagal ditambahkan`);
      } else {
        toast.success(`${selectedSkus.size} SKU ditambahkan ke roster Booth`);
      }
      setAddOpen(false);
      fetchRoster();
    } finally {
      setAddingRoster(false);
    }
  };

  const handleRemove = async () => {
    if (!removeTarget) return;
    setRemoving(true);
    try {
      const res = await fetch(`/api/booth/roster/${encodeURIComponent(removeTarget.sku)}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error();
      toast.success(`${removeTarget.sku} dihapus dari roster Booth`);
      setRemoveTarget(null);
      fetchRoster();
    } catch {
      toast.error('Gagal menghapus dari roster');
    } finally {
      setRemoving(false);
    }
  };

  const startEditTarget = (variant: RosterVariant) => {
    setEditingTarget({ variantId: variant.id, value: variant.boothMinStock != null ? String(variant.boothMinStock) : '' });
  };

  const saveTarget = async () => {
    if (!editingTarget) return;
    setSavingTarget(true);
    try {
      const res = await fetch(`/api/booth/variant/${editingTarget.variantId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ boothMinStock: editingTarget.value === '' ? null : parseInt(editingTarget.value, 10) }),
      });
      if (!res.ok) throw new Error();
      setEditingTarget(null);
      fetchRoster();
    } catch {
      toast.error('Gagal menyimpan target');
    } finally {
      setSavingTarget(false);
    }
  };

  const openBulkTarget = (product: RosterProduct) => {
    setBulkTarget(product);
    setBulkTargetValue('');
  };

  const applyBulkTarget = async () => {
    if (!bulkTarget) return;
    const qty = parseInt(bulkTargetValue, 10);
    if (isNaN(qty) || qty < 0) {
      toast.error('Isi angka target dulu');
      return;
    }
    setSavingBulkTarget(true);
    try {
      const res = await fetch(`/api/booth/roster/${encodeURIComponent(bulkTarget.sku)}/bulk-target`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ boothMinStock: qty }),
      });
      if (!res.ok) throw new Error();
      toast.success(`Target semua warna ${bulkTarget.sku} di-set ke ${qty}`);
      setBulkTarget(null);
      fetchRoster();
    } catch {
      toast.error('Gagal set target massal');
    } finally {
      setSavingBulkTarget(false);
    }
  };

  const handleSendToQueue = async (variant: RosterVariant, sku: string) => {
    const qty = Math.abs(variant.kurang);
    if (qty <= 0) return;
    setSendingId(variant.id);
    try {
      const res = await fetch('/api/print-queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ variantId: variant.id, qty, status: 'Normal', note: '' }),
      });
      if (!res.ok) throw new Error();
      toast.success(`${sku} — ${qty} pcs dikirim ke Print Queue`);
      fetchRoster();
    } catch {
      toast.error('Gagal mengirim ke Print Queue');
    } finally {
      setSendingId(null);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-[var(--t-body)]">
          SKU yang aktif dijual di booth/POS. Set target stok per warna, sisanya otomatis kehitung Kurang/Surplus.
        </p>
        <Button onClick={openAddDialog} className="bg-[var(--brand)] hover:bg-[var(--brand-dark)] text-white gap-1.5">
          <Plus className="w-4 h-4" />
          Tambah SKU ke Booth
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-[var(--t-muted)]" />
        </div>
      ) : roster.length === 0 ? (
        <div className="bg-[var(--card)] rounded-xl border border-[var(--bd)] py-16 flex flex-col items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-[var(--surface)] flex items-center justify-center">
            <Sparkles className="w-6 h-6 text-[var(--t-muted)]" />
          </div>
          <p className="text-sm text-[var(--t-body)]">Belum ada SKU di roster Booth</p>
          <p className="text-xs text-[var(--t-muted)]">Tambah SKU yang mau dibawa ke event lewat tombol di atas</p>
        </div>
      ) : (
        <div className="space-y-3">
          {roster.map((product) => {
            const isExpanded = expanded.has(product.id);
            return (
              <div key={product.id} className="bg-[var(--card)] rounded-xl border border-[var(--bd)] overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 bg-[var(--surface)]">
                  <button
                    onClick={() => toggleExpanded(product.id)}
                    className="flex items-center gap-2 text-left cursor-pointer flex-1 min-w-0"
                  >
                    {isExpanded ? (
                      <ChevronDown className="w-4 h-4 text-[var(--t-muted)] flex-shrink-0" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-[var(--t-muted)] flex-shrink-0" />
                    )}
                    <div className="min-w-0">
                      <span className="text-sm font-semibold text-[var(--t-heading)]">{product.name}</span>
                      <span className="text-xs text-[var(--t-muted)] ml-2">{product.sku}</span>
                    </div>
                  </button>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => openBulkTarget(product)}
                      title="Set target semua warna sekaligus"
                      className="p-1.5 rounded-md text-[var(--brand)] hover:bg-[var(--brand)]/10 transition-colors cursor-pointer"
                    >
                      <Target className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setRemoveTarget(product)}
                      title="Hapus dari roster Booth"
                      className="p-1.5 rounded-md text-[var(--danger)] hover:bg-[var(--danger)]/10 transition-colors cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {isExpanded && (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[560px]">
                      <thead>
                        <tr className="border-t border-[var(--surface-2)]">
                          <th className="text-left text-[11px] font-medium text-[var(--t-muted)] py-2 px-4">Warna</th>
                          <th className="text-right text-[11px] font-medium text-[var(--t-muted)] py-2 px-3">Stok Sekarang</th>
                          <th className="text-right text-[11px] font-medium text-[var(--t-muted)] py-2 px-3">Di Queue/Produksi</th>
                          <th className="text-right text-[11px] font-medium text-[var(--t-muted)] py-2 px-3">Target</th>
                          <th className="text-right text-[11px] font-medium text-[var(--t-muted)] py-2 px-4">Kurang/Surplus</th>
                          <th className="w-10" />
                        </tr>
                      </thead>
                      <tbody>
                        {product.variants.map((variant) => {
                          const label = getVariantLabel(variant.color, variant.type);
                          const isMinus = variant.boothMinStock != null && variant.kurang > 0;
                          const isEditingThis = editingTarget?.variantId === variant.id;
                          return (
                            <tr key={variant.id} className="border-t border-[var(--surface-2)] hover:bg-[var(--surface-hover)] transition-colors">
                              <td className="py-2 px-4">
                                <div className="flex items-center gap-2">
                                  <span
                                    className="w-2.5 h-2.5 rounded-full flex-shrink-0 border border-gray-300"
                                    style={{ backgroundColor: variant.colorHex }}
                                  />
                                  <span className="text-sm text-[var(--t-heading)]">{label}</span>
                                </div>
                              </td>
                              <td className="py-2 px-3 text-right text-sm text-[var(--t-heading)]">{variant.qty}</td>
                              <td className="py-2 px-3 text-right text-sm text-[var(--info)]">{variant.queued}</td>
                              <td className="py-2 px-3 text-right">
                                {isEditingThis ? (
                                  <div className="flex items-center justify-end gap-1">
                                    <Input
                                      type="number"
                                      min={0}
                                      autoFocus
                                      value={editingTarget.value}
                                      onChange={(e) => setEditingTarget({ variantId: variant.id, value: e.target.value })}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') saveTarget();
                                        if (e.key === 'Escape') setEditingTarget(null);
                                      }}
                                      onBlur={saveTarget}
                                      disabled={savingTarget}
                                      className="h-7 w-20 text-xs text-right bg-[var(--card)] border-[var(--bd)] rounded-md"
                                    />
                                  </div>
                                ) : (
                                  <button
                                    onClick={() => startEditTarget(variant)}
                                    className="text-sm font-medium text-[var(--t-heading)] hover:underline cursor-pointer inline-flex items-center gap-1 justify-end w-full"
                                  >
                                    {variant.boothMinStock ?? '—'}
                                    <Pencil className="w-2.5 h-2.5 text-[var(--t-subtle)]" />
                                  </button>
                                )}
                              </td>
                              <td className="py-2 px-4 text-right">
                                {variant.boothMinStock == null ? (
                                  <span className="text-xs text-[var(--t-subtle)]">Set target dulu</span>
                                ) : isMinus ? (
                                  <span className="text-sm font-bold text-[var(--danger)]">Kurang {variant.kurang}</span>
                                ) : variant.kurang < 0 ? (
                                  <span className="text-sm font-semibold text-[var(--success)]">Surplus +{Math.abs(variant.kurang)}</span>
                                ) : (
                                  <span className="text-sm font-semibold text-[var(--success)]">Cukup</span>
                                )}
                              </td>
                              <td className="py-2 px-2 text-right">
                                {isMinus && (
                                  <button
                                    onClick={() => handleSendToQueue(variant, product.sku)}
                                    disabled={sendingId === variant.id}
                                    title="Kirim ke Print Queue"
                                    className="p-1.5 rounded-md bg-[var(--danger)]/10 hover:bg-[var(--danger)]/20 text-[var(--danger)] transition-colors cursor-pointer disabled:opacity-50"
                                  >
                                    {sendingId === variant.id ? (
                                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                    ) : (
                                      <Printer className="w-3.5 h-3.5" />
                                    )}
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Add SKU dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Tambah SKU ke Booth</DialogTitle>
            <DialogDescription>Cari Master SKU yang mau dibawa ke event. Anak SKU-nya ikut otomatis.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--t-subtle)]" />
              <Input
                value={addSearch}
                onChange={(e) => setAddSearch(e.target.value)}
                placeholder="Cari SKU atau nama produk..."
                className="pl-9 h-9 bg-[var(--card)] border-[var(--bd)] rounded-lg"
              />
            </div>
            <div className="max-h-72 overflow-y-auto rounded-lg border border-[var(--bd)] divide-y divide-[var(--surface-2)]">
              {loadingCandidates ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-5 h-5 animate-spin text-[var(--t-muted)]" />
                </div>
              ) : candidates.length === 0 ? (
                <p className="text-xs text-[var(--t-muted)] text-center py-8">Tidak ada Master SKU yang bisa ditambah</p>
              ) : (
                candidates.map((c) => (
                  <label
                    key={c.id}
                    className="flex items-center gap-2.5 px-3 py-2.5 hover:bg-[var(--surface-hover)] cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={selectedSkus.has(c.sku)}
                      onChange={() => toggleSelected(c.sku)}
                      className="w-4 h-4 accent-[var(--brand)] cursor-pointer"
                    />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-[var(--t-heading)]">{c.name}</p>
                      <p className="text-xs text-[var(--t-muted)]">{c.sku}</p>
                    </div>
                  </label>
                ))
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Batal</Button>
            <Button
              onClick={handleAddSelected}
              disabled={selectedSkus.size === 0 || addingRoster}
              className="bg-[var(--brand)] hover:bg-[var(--brand-dark)] text-white"
            >
              {addingRoster ? <Loader2 className="w-4 h-4 animate-spin" /> : `Tambah ${selectedSkus.size > 0 ? `(${selectedSkus.size})` : ''}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove confirm */}
      <AlertDialog open={!!removeTarget} onOpenChange={(open) => !open && setRemoveTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus {removeTarget?.sku} dari roster Booth?</AlertDialogTitle>
            <AlertDialogDescription>
              SKU ini nggak akan muncul lagi di grid POS. Target stok yang udah diisi tetap tersimpan kalau nanti diaktifkan lagi.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRemove}
              disabled={removing}
              className="bg-[var(--danger)] hover:bg-[var(--danger-dark)] text-white"
            >
              {removing ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Hapus'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk target fill */}
      <Dialog open={!!bulkTarget} onOpenChange={(open) => !open && setBulkTarget(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Set Target Semua Warna</DialogTitle>
            <DialogDescription>
              Isi 1 angka, langsung diterapkan ke semua warna/type di {bulkTarget?.sku} ({bulkTarget?.variants.length ?? 0} baris).
            </DialogDescription>
          </DialogHeader>
          <div>
            <Label className="text-xs font-medium text-[var(--t-muted)] mb-1 block">Target per warna</Label>
            <Input
              type="number"
              min={0}
              autoFocus
              value={bulkTargetValue}
              onChange={(e) => setBulkTargetValue(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && applyBulkTarget()}
              className="h-9 bg-[var(--card)] border-[var(--bd)] rounded-lg"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkTarget(null)}>Batal</Button>
            <Button
              onClick={applyBulkTarget}
              disabled={savingBulkTarget || bulkTargetValue === ''}
              className="bg-[var(--brand)] hover:bg-[var(--brand-dark)] text-white"
            >
              {savingBulkTarget ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Terapkan ke Semua'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============ SUB-TAB: KALENDER PRODUKSI ============

function KalenderProduksiTab() {
  const [eventDate, setEventDate] = useState<string>('');
  const [savingDate, setSavingDate] = useState(false);
  const [plans, setPlans] = useState<PlanCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [confirmGenerate, setConfirmGenerate] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [editingQty, setEditingQty] = useState<{ id: string; value: string } | null>(null);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [sendTarget, setSendTarget] = useState<PlanCard | null>(null);
  const [sendQtyInput, setSendQtyInput] = useState('');
  const draggedId = useRef<string | null>(null);
  const [dragOverDate, setDragOverDate] = useState<string | null>(null);

  const fetchSettings = useCallback(async () => {
    const res = await fetch('/api/booth/settings');
    if (res.ok) {
      const data = await res.json();
      setEventDate(data.eventDate ? data.eventDate.slice(0, 10) : '');
    }
  }, []);

  const fetchPlans = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/booth/plan');
      if (res.ok) {
        const data = await res.json();
        setPlans(data.plans || []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
    fetchPlans();
  }, [fetchSettings, fetchPlans]);

  const saveEventDate = async (value: string) => {
    setSavingDate(true);
    try {
      const res = await fetch('/api/booth/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventDate: value || null }),
      });
      if (!res.ok) throw new Error();
      toast.success('Tanggal Event disimpan');
    } catch {
      toast.error('Gagal menyimpan Tanggal Event');
    } finally {
      setSavingDate(false);
    }
  };

  const columns = useMemo(() => {
    const today = toDateOnly(new Date());
    const dates = new Set<string>();
    if (eventDate) {
      const start = new Date(today + 'T00:00:00');
      const end = new Date(eventDate + 'T00:00:00');
      const cursor = new Date(start);
      while (cursor.getTime() <= end.getTime()) {
        dates.add(toDateOnly(cursor));
        cursor.setDate(cursor.getDate() + 1);
      }
    }
    for (const p of plans) {
      dates.add(p.scheduledDate.slice(0, 10));
    }
    return Array.from(dates).sort();
  }, [eventDate, plans]);

  const cardsByDate = useMemo(() => {
    const map: Record<string, PlanCard[]> = {};
    for (const p of plans) {
      const d = p.scheduledDate.slice(0, 10);
      if (!map[d]) map[d] = [];
      map[d].push(p);
    }
    return map;
  }, [plans]);

  const today = toDateOnly(new Date());

  const runGenerate = async () => {
    setGenerating(true);
    try {
      const res = await fetch('/api/booth/plan', { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Gagal menghitung kebutuhan');
      setPlans(data.plans || []);
      toast.success('Kebutuhan produksi dihitung ulang');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal menghitung kebutuhan');
    } finally {
      setGenerating(false);
      setConfirmGenerate(false);
    }
  };

  const handleGenerateClick = () => {
    if (!eventDate) {
      toast.error('Set Tanggal Event dulu');
      return;
    }
    if (plans.length > 0) {
      setConfirmGenerate(true);
    } else {
      runGenerate();
    }
  };

  const runSync = async () => {
    setSyncing(true);
    try {
      const res = await fetch('/api/booth/plan/sync', { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Gagal sync stock');
      setPlans(data.plans || []);
      toast.success('Stock di-sync — jadwal yang udah diatur tetap aman');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal sync stock');
    } finally {
      setSyncing(false);
    }
  };

  const saveQty = async (id: string, value: string) => {
    const qty = parseInt(value, 10);
    if (!qty || qty <= 0) {
      setEditingQty(null);
      return;
    }
    try {
      const res = await fetch(`/api/booth/plan/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ qty }),
      });
      if (!res.ok) throw new Error();
      setPlans((prev) => prev.map((p) => (p.id === id ? { ...p, qty } : p)));
    } catch {
      toast.error('Gagal update qty');
    } finally {
      setEditingQty(null);
    }
  };

  const deleteCard = async (id: string) => {
    try {
      const res = await fetch(`/api/booth/plan/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      setPlans((prev) => prev.filter((p) => p.id !== id));
    } catch {
      toast.error('Gagal menghapus card');
    }
  };

  const openSendDialog = (card: PlanCard) => {
    setSendTarget(card);
    setSendQtyInput(String(card.qty));
  };

  const confirmSend = async () => {
    if (!sendTarget) return;
    const qty = parseInt(sendQtyInput, 10);
    if (!qty || qty <= 0) {
      toast.error('Isi qty yang mau dikirim');
      return;
    }
    setSendingId(sendTarget.id);
    try {
      const res = await fetch(`/api/booth/plan/${sendTarget.id}/send-to-queue`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ qty }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Gagal mengirim ke Print Queue');
      if (data.plan) {
        setPlans((prev) => prev.map((p) => (p.id === sendTarget.id ? { ...p, qty: data.plan.qty } : p)));
      } else {
        setPlans((prev) => prev.filter((p) => p.id !== sendTarget.id));
      }
      toast.success(`${sendTarget.variant.product.sku} — ${qty} pcs dikirim ke Print Queue`);
      setSendTarget(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal mengirim ke Print Queue');
    } finally {
      setSendingId(null);
    }
  };

  const handleDrop = async (date: string) => {
    setDragOverDate(null);
    const id = draggedId.current;
    draggedId.current = null;
    if (!id) return;
    const card = plans.find((p) => p.id === id);
    if (!card || card.scheduledDate.slice(0, 10) === date) return;
    setPlans((prev) => prev.map((p) => (p.id === id ? { ...p, scheduledDate: date } : p)));
    try {
      const res = await fetch(`/api/booth/plan/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scheduledDate: date }),
      });
      if (!res.ok) throw new Error();
    } catch {
      toast.error('Gagal memindahkan card');
      fetchPlans();
    }
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-end gap-3 mb-4">
        <div>
          <Label className="text-xs font-medium text-[var(--t-muted)] mb-1 block">Tanggal Event</Label>
          <Input
            type="date"
            value={eventDate}
            onChange={(e) => {
              setEventDate(e.target.value);
              saveEventDate(e.target.value);
            }}
            disabled={savingDate}
            className="h-9 w-48 bg-[var(--card)] border-[var(--bd)] rounded-lg"
          />
        </div>
        <Button
          onClick={handleGenerateClick}
          disabled={generating || !eventDate}
          className="bg-[var(--brand)] hover:bg-[var(--brand-dark)] text-white gap-1.5"
        >
          {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          Hitung Kebutuhan
        </Button>
        <Button
          onClick={runSync}
          disabled={syncing || !eventDate}
          variant="outline"
          title="Update angka kebutuhan dari stok terbaru tanpa mengubah susunan card"
          className="border-[var(--bd)] text-[var(--t-body)] hover:bg-[var(--surface-2)] hover:text-[var(--t-heading)] gap-1.5"
        >
          {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          Sync Stock
        </Button>
      </div>
      <p className="text-xs text-[var(--t-muted)] -mt-2 mb-4">
        Total kebutuhan langsung ditaruh jadi 1 card di hari ini — kamu yang atur sendiri kapan & berapa banyak diproduksi tiap hari lewat geser card atau kirim sebagian ke Print Queue.
        Butuh update angka doang tanpa bongkar susunan yang udah diatur? Pakai <strong className="text-[var(--t-body)] font-semibold">Sync Stock</strong>.
      </p>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-[var(--t-muted)]" />
        </div>
      ) : !eventDate ? (
        <div className="bg-[var(--card)] rounded-xl border border-[var(--bd)] py-16 flex flex-col items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-[var(--surface)] flex items-center justify-center">
            <CalendarIcon className="w-6 h-6 text-[var(--t-muted)]" />
          </div>
          <p className="text-sm text-[var(--t-body)]">Set Tanggal Event dulu di atas</p>
        </div>
      ) : columns.length === 0 ? (
        <div className="bg-[var(--card)] rounded-xl border border-[var(--bd)] py-16 flex flex-col items-center gap-3">
          <p className="text-sm text-[var(--t-body)]">Belum ada rencana — klik Hitung Kebutuhan</p>
        </div>
      ) : (
        <div className="overflow-x-auto pb-2">
          <div className="flex gap-3 min-w-max">
            {columns.map((date) => {
              const isPast = date < today;
              const cards = cardsByDate[date] || [];
              const isDragOver = dragOverDate === date;
              return (
                <div
                  key={date}
                  className="w-56 flex-shrink-0"
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOverDate(date);
                  }}
                  onDragLeave={() => setDragOverDate((d) => (d === date ? null : d))}
                  onDrop={(e) => {
                    e.preventDefault();
                    handleDrop(date);
                  }}
                >
                  <div
                    className={`flex items-center justify-between px-3 py-2 rounded-t-xl border-b-2 ${
                      isPast ? 'bg-[var(--danger-bg)]' : 'bg-[var(--surface)]'
                    }`}
                    style={{ borderColor: isPast ? '#dc2626' : '#4a6741' }}
                  >
                    <span className={`text-xs font-semibold ${isPast ? 'text-[var(--danger)]' : 'text-[var(--t-heading)]'}`}>
                      {formatDateShort(date)}
                    </span>
                    {isPast && (
                      <Badge className="text-[10px] px-1.5 py-0 rounded-full bg-[var(--danger)] text-white border-0">
                        Terlambat
                      </Badge>
                    )}
                  </div>
                  <div
                    className={`rounded-b-xl p-2 space-y-2 min-h-[120px] transition-colors ${
                      isDragOver ? 'bg-[var(--brand)]/10' : 'bg-[var(--surface-tint)]'
                    }`}
                  >
                    {cards.length === 0 && (
                      <p className="text-[11px] text-[var(--t-subtle)] text-center py-6">Kosong</p>
                    )}
                    {cards.map((card) => (
                      <div
                        key={card.id}
                        draggable
                        onDragStart={() => {
                          draggedId.current = card.id;
                        }}
                        className="bg-[var(--card)] rounded-lg shadow-sm p-2.5 border-l-[3px] cursor-grab active:cursor-grabbing"
                        style={{ borderLeftColor: card.variant.colorHex }}
                      >
                        <div className="flex items-start justify-between gap-1">
                          <div className="min-w-0 flex items-center gap-1">
                            <GripVertical className="w-3 h-3 text-[var(--bd-2)] flex-shrink-0" />
                            <div className="min-w-0">
                              <p className="text-xs font-semibold text-[var(--t-heading)] truncate">{card.variant.product.sku}</p>
                              <p className="text-[11px] text-[var(--t-muted)] truncate">
                                {getVariantLabel(card.variant.color, card.variant.type)}
                              </p>
                            </div>
                          </div>
                          <button
                            onClick={() => deleteCard(card.id)}
                            className="p-0.5 rounded text-[var(--t-subtle)] hover:text-[var(--danger)] hover:bg-[var(--danger)]/10 cursor-pointer flex-shrink-0"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                        <div className="flex items-center justify-between mt-2">
                          {editingQty?.id === card.id ? (
                            <Input
                              type="number"
                              min={1}
                              autoFocus
                              value={editingQty.value}
                              onChange={(e) => setEditingQty({ id: card.id, value: e.target.value })}
                              onBlur={() => saveQty(card.id, editingQty.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') saveQty(card.id, editingQty.value);
                                if (e.key === 'Escape') setEditingQty(null);
                              }}
                              className="h-6 w-14 text-xs px-1.5 bg-[var(--card)] border-[var(--bd)] rounded"
                            />
                          ) : (
                            <button
                              onClick={() => setEditingQty({ id: card.id, value: String(card.qty) })}
                              className="text-xs font-bold text-[var(--t-heading)] hover:underline cursor-pointer"
                            >
                              {card.qty} pcs
                            </button>
                          )}
                          <button
                            onClick={() => openSendDialog(card)}
                            disabled={sendingId === card.id}
                            title="Kirim ke Print Queue"
                            className="p-1 rounded-md bg-[var(--brand)]/10 hover:bg-[var(--brand)]/20 text-[var(--brand)] transition-colors cursor-pointer disabled:opacity-50"
                          >
                            {sendingId === card.id ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <Printer className="w-3 h-3" />
                            )}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <AlertDialog open={confirmGenerate} onOpenChange={setConfirmGenerate}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-[var(--warning)]" />
              Hitung ulang kebutuhan?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Ini bakal MENIMPA semua card yang ada sekarang (termasuk yang udah kamu geser atau kirim sebagian) dengan total kebutuhan terbaru.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={runGenerate} className="bg-[var(--warning)] hover:bg-[var(--warning-dark)] text-white">
              Ya, Timpa & Hitung Ulang
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!sendTarget} onOpenChange={(open) => !open && setSendTarget(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Kirim ke Print Queue</DialogTitle>
            <DialogDescription>
              {sendTarget && (
                <>
                  {sendTarget.variant.product.sku} — {getVariantLabel(sendTarget.variant.color, sendTarget.variant.type)}.
                  Total kebutuhan {sendTarget.qty} pcs. Isi berapa yang mau diproduksi sekarang, sisanya tetap di card ini.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <div>
            <Label className="text-xs font-medium text-[var(--t-muted)] mb-1 block">Qty dikirim sekarang</Label>
            <Input
              type="number"
              min={1}
              max={sendTarget?.qty}
              autoFocus
              value={sendQtyInput}
              onChange={(e) => setSendQtyInput(e.target.value)}
              className="h-9 bg-[var(--card)] border-[var(--bd)] rounded-lg"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSendTarget(null)}>Batal</Button>
            <Button
              onClick={confirmSend}
              disabled={sendingId === sendTarget?.id}
              className="bg-[var(--brand)] hover:bg-[var(--brand-dark)] text-white"
            >
              {sendingId === sendTarget?.id ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Kirim'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============ MAIN EXPORT ============

export function BoothStock() {
  const [subTab, setSubTab] = useState<'target' | 'kalender'>('target');

  return (
    <div>
      <div className="flex items-center bg-[var(--surface)] rounded-lg p-0.5 mb-4 w-fit">
        <button
          onClick={() => setSubTab('target')}
          className={`px-4 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer ${
            subTab === 'target' ? 'bg-[var(--card)] text-[var(--brand)] shadow-sm' : 'text-[var(--t-body)] hover:text-[var(--t-heading)]'
          }`}
        >
          Target Stok
        </button>
        <button
          onClick={() => setSubTab('kalender')}
          className={`px-4 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer ${
            subTab === 'kalender' ? 'bg-[var(--card)] text-[var(--brand)] shadow-sm' : 'text-[var(--t-body)] hover:text-[var(--t-heading)]'
          }`}
        >
          Kalender Produksi
        </button>
      </div>

      {subTab === 'target' ? <TargetStokTab /> : <KalenderProduksiTab />}
    </div>
  );
}
