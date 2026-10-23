'use client';

import { useState, useEffect, useRef } from 'react';
import { ScanLine, Search, ArrowDownToLine, ArrowUpFromLine, Loader2, AlertTriangle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

type ScanStage = 'scanning' | 'confirm' | 'unknown' | 'link-search' | 'register-new';
const JENIS_PRESETS = ['PLA', 'PETG', 'ABS', 'TPU'];

interface MatchedItem {
  materialId: string;
  variantId: string | null;
  name: string;
  stock: number;
  minStock: number;
  unit: string;
}

interface LinkRow {
  materialId: string;
  variantId: string | null;
  name: string;
}

function unitLabel(unit: string) {
  return unit === 'roll' ? 'Roll' : unit;
}

function isFilamentMaterialName(name: string) {
  return name.trim().toLowerCase().startsWith('filament');
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChanged?: () => void;
}

export function ScanMaterialDialog({ open, onOpenChange, onChanged }: Props) {
  const [stage, setStage] = useState<ScanStage>('scanning');
  const [scanInput, setScanInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);
  const [currentCode, setCurrentCode] = useState('');
  const [matched, setMatched] = useState<MatchedItem | null>(null);
  const [direction, setDirection] = useState<'in' | 'out'>('in');
  const [qtyInput, setQtyInput] = useState('');

  const [linkQuery, setLinkQuery] = useState('');
  const [linkRows, setLinkRows] = useState<LinkRow[]>([]);
  const [linkLoading, setLinkLoading] = useState(false);

  const [regType, setRegType] = useState<'filament' | 'material'>('filament');
  const [regBrand, setRegBrand] = useState('');
  const [regColor, setRegColor] = useState('');
  const [regJenisPreset, setRegJenisPreset] = useState('PLA');
  const [regJenisCustom, setRegJenisCustom] = useState('');
  const [regName, setRegName] = useState('');
  const [regStock, setRegStock] = useState('0');
  const [regMinStock, setRegMinStock] = useState('0');
  const [colorOptions, setColorOptions] = useState<string[]>([]);

  const scanInputRef = useRef<HTMLInputElement>(null);

  const resetToScanning = () => {
    setStage('scanning');
    setScanInput('');
    setMatched(null);
    setTimeout(() => scanInputRef.current?.focus(), 50);
  };

  useEffect(() => {
    if (open) {
      setStage('scanning');
      setFeedback(null);
      setTimeout(() => scanInputRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => {
    if (stage === 'scanning' && open) {
      setTimeout(() => scanInputRef.current?.focus(), 50);
    }
  }, [stage, open]);

  useEffect(() => {
    if (stage === 'register-new' && colorOptions.length === 0) {
      fetch('/api/colors')
        .then((res) => res.json())
        .then((data: Array<{ name: string; status: string }>) => {
          setColorOptions(Array.isArray(data) ? data.filter((c) => c.status === 'Active').map((c) => c.name) : []);
        })
        .catch(() => {});
    }
  }, [stage, colorOptions.length]);

  const handleScanSubmit = async () => {
    const code = scanInput.trim();
    if (!code || busy) return;
    setBusy(true);
    setFeedback(null);
    try {
      const res = await fetch(`/api/materials/lookup-barcode?code=${encodeURIComponent(code)}`);
      const data = await res.json();
      setCurrentCode(code);
      if (data.matched) {
        setMatched({ materialId: data.materialId, variantId: data.variantId, name: data.name, stock: data.stock, minStock: data.minStock, unit: data.unit });
        setDirection('in');
        setQtyInput('');
        setStage('confirm');
      } else {
        setStage('unknown');
      }
    } catch {
      setFeedback({ type: 'error', text: 'Gagal mencari barcode' });
    } finally {
      setBusy(false);
      setScanInput('');
    }
  };

  const handleConfirmSubmit = async () => {
    const qty = parseInt(qtyInput, 10);
    if (!qty || qty <= 0) return;
    setBusy(true);
    try {
      const res = await fetch('/api/materials/scan-io', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: currentCode, direction, qty }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || 'Gagal update stok');
        return;
      }
      setFeedback({ type: 'ok', text: `${data.name}: stok sekarang ${data.stock} ${unitLabel(data.unit)}` });
      onChanged?.();
      resetToScanning();
    } catch {
      alert('Gagal update stok. Coba lagi.');
    } finally {
      setBusy(false);
    }
  };

  const openLinkSearch = async () => {
    setStage('link-search');
    setLinkQuery('');
    setLinkLoading(true);
    try {
      const res = await fetch('/api/materials');
      const data = await res.json();
      const rows: LinkRow[] = [];
      for (const m of data.materials || []) {
        if (m.hasVariants) {
          for (const v of m.variants || []) {
            const label = [v.brand, v.label].filter(Boolean).join(' - ') + (v.materialType ? ` (${v.materialType})` : '');
            rows.push({ materialId: m.id, variantId: v.id, name: `${m.name} — ${label || v.label}` });
          }
        } else {
          rows.push({ materialId: m.id, variantId: null, name: m.name });
        }
      }
      setLinkRows(rows);
    } catch {
      setLinkRows([]);
    } finally {
      setLinkLoading(false);
    }
  };

  const filteredLinkRows = linkRows.filter((r) => r.name.toLowerCase().includes(linkQuery.toLowerCase()));

  const handlePickLink = async (row: LinkRow) => {
    setBusy(true);
    try {
      const res = await fetch('/api/materials/link-barcode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: currentCode, materialId: row.materialId, variantId: row.variantId }),
      });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || 'Gagal link barcode');
        return;
      }
      const lookupRes = await fetch(`/api/materials/lookup-barcode?code=${encodeURIComponent(currentCode)}`);
      const lookupData = await lookupRes.json();
      if (lookupData.matched) {
        setMatched({ materialId: lookupData.materialId, variantId: lookupData.variantId, name: lookupData.name, stock: lookupData.stock, minStock: lookupData.minStock, unit: lookupData.unit });
        setDirection('in');
        setQtyInput('');
        setStage('confirm');
      }
    } catch {
      alert('Gagal link barcode. Coba lagi.');
    } finally {
      setBusy(false);
    }
  };

  const openRegisterNew = () => {
    setStage('register-new');
    setRegType('filament');
    setRegBrand('');
    setRegColor('');
    setRegJenisPreset('PLA');
    setRegJenisCustom('');
    setRegName('');
    setRegStock('0');
    setRegMinStock('0');
  };

  const ensureFilamentMaterialId = async (): Promise<string> => {
    const res = await fetch('/api/materials');
    const data = await res.json();
    const materials: Array<{ id: string; name: string }> = data.materials || [];
    const exact = materials.find((m) => m.name === 'Filament');
    if (exact) return exact.id;
    const prefixed = materials.find((m) => isFilamentMaterialName(m.name));
    if (prefixed) return prefixed.id;
    const createRes = await fetch('/api/materials', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Filament', unit: 'roll', hasVariants: true }),
    });
    const created = await createRes.json();
    return created.id;
  };

  const handleRegisterSubmit = async () => {
    setBusy(true);
    try {
      const initialQty = parseInt(regStock, 10) || 0;
      if (regType === 'filament') {
        if (!regColor.trim()) {
          alert('Pilih Warna dulu');
          return;
        }
        const jenis = regJenisPreset === 'Lainnya' ? regJenisCustom.trim() : regJenisPreset;
        const materialId = await ensureFilamentMaterialId();
        const res = await fetch(`/api/materials/${materialId}/variants`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            label: regColor.trim(),
            brand: regBrand.trim(),
            materialType: jenis,
            stock: 0,
            minStock: parseInt(regMinStock, 10) || 0,
            knownBarcodes: [currentCode],
          }),
        });
        if (!res.ok) {
          const data = await res.json();
          alert(data.error || 'Gagal membuat Filament');
          return;
        }
      } else {
        if (!regName.trim()) {
          alert('Isi Nama Material dulu');
          return;
        }
        const res = await fetch('/api/materials', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: regName.trim(),
            unit: 'pcs',
            hasVariants: false,
            stock: 0,
            minStock: parseInt(regMinStock, 10) || 0,
            barcode: currentCode,
          }),
        });
        if (!res.ok) {
          const data = await res.json();
          alert(data.error || 'Gagal membuat Material');
          return;
        }
      }

      if (initialQty > 0) {
        await fetch('/api/materials/scan-io', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: currentCode, direction: 'in', qty: initialQty }),
        });
      }

      setFeedback({ type: 'ok', text: 'Item baru terdaftar & barcode ter-link.' });
      onChanged?.();
      resetToScanning();
    } catch {
      alert('Gagal mendaftarkan item. Coba lagi.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md rounded-xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-[var(--t-heading)] flex items-center gap-2">
            <ScanLine className="w-5 h-5 text-[var(--brand)]" />
            Scan Material
          </DialogTitle>
          <DialogDescription className="text-[var(--t-body)]">
            Scan barcode Material/Filament buat Input atau Output stok.
          </DialogDescription>
        </DialogHeader>

        {stage === 'scanning' && (
          <div className="space-y-3">
            <input
              ref={scanInputRef}
              type="text"
              value={scanInput}
              onChange={(e) => setScanInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleScanSubmit(); }}
              placeholder="Scan atau ketik barcode..."
              disabled={busy}
              className="w-full h-14 text-base bg-[var(--surface)] border border-[var(--bd)] rounded-lg px-4 font-mono text-[var(--t-heading)] placeholder:text-[var(--t-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--brand)]/30 disabled:opacity-60"
            />
            {feedback && (
              <div className={`flex items-center gap-2 p-2.5 rounded-lg text-xs ${
                feedback.type === 'ok'
                  ? 'bg-[var(--success)]/10 text-[var(--success)] border border-[var(--success)]/30'
                  : 'bg-[var(--danger)]/10 text-[var(--danger)] border border-[var(--danger)]/30'
              }`}>
                {feedback.text}
              </div>
            )}
            <p className="text-[11px] text-[var(--t-muted)]">Tekan Enter buat submit barcode, mode scan tetap terbuka buat scan berikutnya.</p>
          </div>
        )}

        {stage === 'confirm' && matched && (
          <div className="space-y-3">
            <div className="p-3 rounded-lg bg-[var(--surface-tint-3)] border border-[var(--bd)]">
              <p className="text-sm font-semibold text-[var(--t-heading)]">{matched.name}</p>
              <p className="text-xs text-[var(--t-body)] mt-0.5">Stok saat ini: {matched.stock} {unitLabel(matched.unit)}</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setDirection('in')}
                className={`flex-1 flex items-center justify-center gap-1.5 py-4 rounded-lg text-base font-semibold border-2 cursor-pointer ${
                  direction === 'in' ? 'bg-[var(--success)]/10 border-[var(--success)]/40 text-[var(--success)]' : 'border-[var(--bd)] text-[var(--t-body)]'
                }`}
              >
                <ArrowDownToLine className="w-5 h-5" /> Input (+)
              </button>
              <button
                onClick={() => setDirection('out')}
                className={`flex-1 flex items-center justify-center gap-1.5 py-4 rounded-lg text-base font-semibold border-2 cursor-pointer ${
                  direction === 'out' ? 'bg-[var(--danger)]/10 border-[var(--danger)]/40 text-[var(--danger)]' : 'border-[var(--bd)] text-[var(--t-body)]'
                }`}
              >
                <ArrowUpFromLine className="w-5 h-5" /> Output (−)
              </button>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-[var(--t-heading)]">Jumlah ({unitLabel(matched.unit)})</Label>
              <Input type="number" min={1} value={qtyInput} onChange={(e) => setQtyInput(e.target.value)} className="h-14 text-lg bg-[var(--surface)] border-[var(--bd)] rounded-lg" />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={resetToScanning} disabled={busy} className="rounded-full flex-1 h-12 text-base">
                Batal
              </Button>
              <Button
                onClick={handleConfirmSubmit}
                disabled={busy || !qtyInput || parseInt(qtyInput, 10) <= 0}
                className="bg-[var(--brand)] hover:bg-[var(--brand-dark)] text-white rounded-full flex-1 h-12 text-base disabled:opacity-50"
              >
                {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Submit'}
              </Button>
            </div>
          </div>
        )}

        {stage === 'unknown' && (
          <div className="space-y-3">
            <div className="flex items-start gap-2 p-3 rounded-lg bg-[var(--warning)]/10 border border-[var(--warning)]/30">
              <AlertTriangle className="w-4 h-4 text-[var(--warning)] flex-shrink-0 mt-0.5" />
              <p className="text-xs text-[var(--warning)] font-medium">
                Barcode &quot;{currentCode}&quot; belum dikenal. Mau di-link ke item yang udah ada, atau daftar sebagai item baru?
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <Button variant="outline" onClick={openLinkSearch} className="rounded-full w-full justify-center h-12 text-base">
                Link ke item yang sudah ada
              </Button>
              <Button onClick={openRegisterNew} className="bg-[var(--brand)] hover:bg-[var(--brand-dark)] text-white rounded-full w-full h-12 text-base">
                Daftar sebagai item baru
              </Button>
              <Button variant="outline" onClick={resetToScanning} className="rounded-full w-full h-12 text-base">
                Batal
              </Button>
            </div>
          </div>
        )}

        {stage === 'link-search' && (
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--t-muted)]" />
              <Input value={linkQuery} onChange={(e) => setLinkQuery(e.target.value)} placeholder="Cari Material/Filament..." className="pl-8 h-9 text-sm bg-[var(--surface)] border-[var(--bd)] rounded-lg" />
            </div>
            <div className="max-h-[220px] overflow-y-auto rounded-lg border border-[var(--bd)]">
              {linkLoading ? (
                <p className="text-xs text-[var(--t-muted)] p-3">Memuat...</p>
              ) : filteredLinkRows.length === 0 ? (
                <p className="text-xs text-[var(--t-muted)] p-3">Nggak ada hasil.</p>
              ) : (
                filteredLinkRows.map((row) => (
                  <button
                    key={`${row.materialId}-${row.variantId || 'base'}`}
                    onClick={() => handlePickLink(row)}
                    disabled={busy}
                    className="w-full text-left px-3 py-2 text-xs border-b border-[var(--bd)] last:border-b-0 hover:bg-[var(--surface)] cursor-pointer disabled:opacity-50"
                  >
                    {row.name}
                  </button>
                ))
              )}
            </div>
            <Button variant="outline" onClick={() => setStage('unknown')} disabled={busy} className="rounded-full w-full">
              Kembali
            </Button>
          </div>
        )}

        {stage === 'register-new' && (
          <div className="space-y-3">
            <div className="flex gap-2">
              {(['filament', 'material'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setRegType(t)}
                  className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-medium border cursor-pointer ${
                    regType === t ? 'bg-[var(--brand)] text-white border-[var(--brand)]' : 'border-[var(--bd)] text-[var(--t-body)]'
                  }`}
                >
                  {t === 'filament' ? 'Filament' : 'Material biasa'}
                </button>
              ))}
            </div>

            {regType === 'filament' ? (
              <>
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium text-[var(--t-heading)]">Brand</Label>
                  <Input value={regBrand} onChange={(e) => setRegBrand(e.target.value)} placeholder="e.g. eSUN" className="h-9 text-sm bg-[var(--surface)] border-[var(--bd)] rounded-lg" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium text-[var(--t-heading)]">Warna *</Label>
                  {colorOptions.length === 0 ? (
                    <p className="text-[11px] text-[var(--t-muted)]">Belum ada Color Variant di Database.</p>
                  ) : (
                    <Select value={regColor} onValueChange={setRegColor}>
                      <SelectTrigger className="h-9 text-sm bg-[var(--surface)] border-[var(--bd)] rounded-lg">
                        <SelectValue placeholder="Pilih warna..." />
                      </SelectTrigger>
                      <SelectContent>
                        {colorOptions.map((c) => (
                          <SelectItem key={c} value={c}>{c}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium text-[var(--t-heading)]">Jenis Bahan</Label>
                  <Select value={regJenisPreset} onValueChange={setRegJenisPreset}>
                    <SelectTrigger className="h-9 text-sm bg-[var(--surface)] border-[var(--bd)] rounded-lg">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {JENIS_PRESETS.map((j) => (
                        <SelectItem key={j} value={j}>{j}</SelectItem>
                      ))}
                      <SelectItem value="Lainnya">Lainnya...</SelectItem>
                    </SelectContent>
                  </Select>
                  {regJenisPreset === 'Lainnya' && (
                    <Input value={regJenisCustom} onChange={(e) => setRegJenisCustom(e.target.value)} placeholder="Ketik jenis bahan" className="h-9 text-sm bg-[var(--surface)] border-[var(--bd)] rounded-lg mt-1.5" />
                  )}
                </div>
                <div className="flex gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-sm font-medium text-[var(--t-heading)]">Stok awal (Roll)</Label>
                    <Input type="number" value={regStock} onChange={(e) => setRegStock(e.target.value)} className="h-9 text-sm bg-[var(--surface)] border-[var(--bd)] rounded-lg w-28" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-sm font-medium text-[var(--t-heading)]">Min Stock (Roll)</Label>
                    <Input type="number" value={regMinStock} onChange={(e) => setRegMinStock(e.target.value)} className="h-9 text-sm bg-[var(--surface)] border-[var(--bd)] rounded-lg w-28" />
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium text-[var(--t-heading)]">Nama Material *</Label>
                  <Input value={regName} onChange={(e) => setRegName(e.target.value)} placeholder="e.g. Lakban Marketplace" className="h-9 text-sm bg-[var(--surface)] border-[var(--bd)] rounded-lg" />
                </div>
                <div className="flex gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-sm font-medium text-[var(--t-heading)]">Stok awal (pcs)</Label>
                    <Input type="number" value={regStock} onChange={(e) => setRegStock(e.target.value)} className="h-9 text-sm bg-[var(--surface)] border-[var(--bd)] rounded-lg w-28" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-sm font-medium text-[var(--t-heading)]">Min Stock (pcs)</Label>
                    <Input type="number" value={regMinStock} onChange={(e) => setRegMinStock(e.target.value)} className="h-9 text-sm bg-[var(--surface)] border-[var(--bd)] rounded-lg w-28" />
                  </div>
                </div>
              </>
            )}

            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStage('unknown')} disabled={busy} className="rounded-full flex-1">
                Kembali
              </Button>
              <Button onClick={handleRegisterSubmit} disabled={busy} className="bg-[var(--brand)] hover:bg-[var(--brand-dark)] text-white rounded-full flex-1 disabled:opacity-50">
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Daftar & Lanjut'}
              </Button>
            </div>
          </div>
        )}

        {stage === 'scanning' && (
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} className="rounded-full w-full">
              Tutup
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
