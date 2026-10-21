'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Search, Loader2 } from 'lucide-react';
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
import { drawLabel, type TemplateElements, type LabelFontOverride } from '@/lib/label-render';
import { FontSizeSlider } from '@/components/dashboard/label-font-slider';

export interface LabelData {
  id: string;
  type: string;
  sourceRef: string | null;
  skuName: string;
  qrCode: string;
  productName: string;
  color: string;
  keterangan: string | null;
  fonts: LabelFontOverride | null;
}

interface CatalogRow {
  sourceRef: string;
  skuName: string;
  qrCode: string;
  productName: string;
  color: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingLabel?: LabelData | null;
  template: TemplateElements;
  onSaved: () => void;
}

export function LabelGenerateDialog({ open, onOpenChange, editingLabel, template, onSaved }: Props) {
  const isEditing = !!editingLabel;
  const [type, setType] = useState<'produk' | 'material'>('produk');
  const [sourceMode, setSourceMode] = useState<'katalog' | 'manual'>('katalog');
  const [sourceRef, setSourceRef] = useState<string | null>(null);
  const [skuName, setSkuName] = useState('');
  const [qrCode, setQrCode] = useState('');
  const [productName, setProductName] = useState('');
  const [color, setColor] = useState('');
  const [keterangan, setKeterangan] = useState('');
  const [showKeterangan, setShowKeterangan] = useState(true);
  const [showSwatch, setShowSwatch] = useState(true);
  const [fontSku, setFontSku] = useState(32);
  const [fontName, setFontName] = useState(19);
  const [fontKet, setFontKet] = useState(16);
  const [fontSwatch, setFontSwatch] = useState(24);
  const [saving, setSaving] = useState(false);

  const [catalogQuery, setCatalogQuery] = useState('');
  const [catalogRows, setCatalogRows] = useState<CatalogRow[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Reset/prefill whenever the dialog opens
  useEffect(() => {
    if (!open) return;
    if (editingLabel) {
      setType(editingLabel.type === 'material' ? 'material' : 'produk');
      setSourceMode('manual');
      setSourceRef(editingLabel.sourceRef);
      setSkuName(editingLabel.skuName);
      setQrCode(editingLabel.qrCode);
      setProductName(editingLabel.productName);
      setColor(editingLabel.color);
      setKeterangan(editingLabel.keterangan || '');
      setShowKeterangan(editingLabel.fonts?.show?.keterangan ?? (template.keterangan.show ?? true));
      setShowSwatch(editingLabel.fonts?.show?.swatch ?? (template.swatch.show ?? true));
      setFontSku(editingLabel.fonts?.sku ?? template.sku.fontSize);
      setFontName(editingLabel.fonts?.name ?? template.name.fontSize);
      setFontKet(editingLabel.fonts?.keterangan ?? template.keterangan.fontSize);
      setFontSwatch(editingLabel.fonts?.swatch ?? template.swatch.fontSize);
    } else {
      setType('produk');
      setSourceMode('katalog');
      setSourceRef(null);
      setSkuName('');
      setQrCode('');
      setProductName('');
      setColor('');
      setKeterangan('');
      setShowKeterangan(template.keterangan.show ?? true);
      setShowSwatch(template.swatch.show ?? true);
      setFontSku(template.sku.fontSize);
      setFontName(template.name.fontSize);
      setFontKet(template.keterangan.fontSize);
      setFontSwatch(template.swatch.fontSize);
    }
    setCatalogQuery('');
    setCatalogRows([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editingLabel]);

  // Katalog search
  useEffect(() => {
    if (!open || isEditing || sourceMode !== 'katalog') return;
    const timer = setTimeout(async () => {
      setCatalogLoading(true);
      try {
        if (type === 'produk') {
          const res = await fetch(`/api/products?search=${encodeURIComponent(catalogQuery)}&limit=20`);
          const data = await res.json();
          const rows: CatalogRow[] = [];
          for (const p of data.products || []) {
            for (const v of p.variants || []) {
              const colorLabel = [v.color, v.type].filter(Boolean).join(' - ');
              rows.push({
                sourceRef: v.id,
                skuName: p.sku,
                qrCode: v.barcode || p.sku,
                productName: p.name,
                color: colorLabel,
              });
            }
          }
          setCatalogRows(rows);
        } else {
          const res = await fetch('/api/materials');
          const data = await res.json();
          const q = catalogQuery.toLowerCase();
          const rows: CatalogRow[] = [];
          for (const m of data.materials || []) {
            if (m.hasVariants) {
              for (const v of m.variants || []) {
                if (q && !m.name.toLowerCase().includes(q) && !v.label.toLowerCase().includes(q)) continue;
                rows.push({
                  sourceRef: v.id,
                  skuName: m.name,
                  qrCode: v.barcode || m.name,
                  productName: m.name,
                  color: v.label,
                });
              }
            } else {
              if (q && !m.name.toLowerCase().includes(q)) continue;
              rows.push({
                sourceRef: m.id,
                skuName: m.name,
                qrCode: m.barcode || m.name,
                productName: m.name,
                color: '',
              });
            }
          }
          setCatalogRows(rows);
        }
      } catch {
        setCatalogRows([]);
      } finally {
        setCatalogLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [open, isEditing, sourceMode, type, catalogQuery]);

  const pickCatalogRow = (row: CatalogRow) => {
    setSourceRef(row.sourceRef);
    setSkuName(row.skuName);
    setQrCode(row.qrCode);
    setProductName(row.productName);
    setColor(row.color);
  };

  const buildFonts = useCallback((): LabelFontOverride | null => {
    const fonts: LabelFontOverride = {};
    if (fontSku !== template.sku.fontSize) fonts.sku = fontSku;
    if (fontName !== template.name.fontSize) fonts.name = fontName;
    if (fontKet !== template.keterangan.fontSize) fonts.keterangan = fontKet;
    if (fontSwatch !== template.swatch.fontSize) fonts.swatch = fontSwatch;
    const show: { keterangan?: boolean; swatch?: boolean } = {};
    if (showKeterangan !== (template.keterangan.show ?? true)) show.keterangan = showKeterangan;
    if (showSwatch !== (template.swatch.show ?? true)) show.swatch = showSwatch;
    if (Object.keys(show).length > 0) fonts.show = show;
    return Object.keys(fonts).length > 0 ? fonts : null;
  }, [fontSku, fontName, fontKet, fontSwatch, showKeterangan, showSwatch, template]);

  // Live preview
  useEffect(() => {
    if (!open || !canvasRef.current) return;
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;
    drawLabel(ctx, template, {
      skuName,
      qrCode,
      productName,
      color,
      keterangan,
      fonts: buildFonts(),
    }).catch(() => {});
  }, [open, template, skuName, qrCode, productName, color, keterangan, buildFonts]);

  const handleSave = async () => {
    if (!skuName.trim() || !qrCode.trim()) return;
    setSaving(true);
    try {
      const payload = {
        type,
        sourceRef,
        skuName: skuName.trim(),
        qrCode: qrCode.trim(),
        productName: productName.trim(),
        color: color.trim(),
        keterangan: keterangan.trim() || null,
        fonts: buildFonts(),
      };
      const url = isEditing ? `/api/labels/${editingLabel!.id}` : '/api/labels';
      const res = await fetch(url, {
        method: isEditing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || 'Gagal menyimpan label');
        return;
      }
      onOpenChange(false);
      onSaved();
    } catch {
      alert('Gagal menyimpan label. Coba lagi.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl rounded-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-[var(--t-heading)]">
            {isEditing ? 'Edit Label' : 'Generate Label'}
          </DialogTitle>
          <DialogDescription className="text-[var(--t-body)]">
            Label disimpan permanen di Library — bisa dicari & diprint ulang kapan saja.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Left: form */}
          <div className="space-y-3">
            {!isEditing && (
              <>
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium text-[var(--t-heading)]">Tipe</Label>
                  <div className="flex gap-2">
                    {(['produk', 'material'] as const).map((t) => (
                      <button
                        key={t}
                        onClick={() => { setType(t); setSourceRef(null); setCatalogRows([]); }}
                        className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-medium border cursor-pointer ${
                          type === t ? 'bg-[var(--brand)] text-white border-[var(--brand)]' : 'border-[var(--bd)] text-[var(--t-body)]'
                        }`}
                      >
                        {t === 'produk' ? 'Produk' : 'Material'}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-sm font-medium text-[var(--t-heading)]">Sumber Data</Label>
                  <div className="flex gap-2">
                    {(['katalog', 'manual'] as const).map((m) => (
                      <button
                        key={m}
                        onClick={() => setSourceMode(m)}
                        className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-medium border cursor-pointer ${
                          sourceMode === m ? 'bg-[var(--info)] text-white border-[var(--info)]' : 'border-[var(--bd)] text-[var(--t-body)]'
                        }`}
                      >
                        {m === 'katalog' ? 'Pilih dari Katalog' : 'Manual/Custom'}
                      </button>
                    ))}
                  </div>
                </div>

                {sourceMode === 'katalog' && (
                  <div className="space-y-1.5">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--t-muted)]" />
                      <Input
                        value={catalogQuery}
                        onChange={(e) => setCatalogQuery(e.target.value)}
                        placeholder={type === 'produk' ? 'Cari SKU/Nama Produk...' : 'Cari Material...'}
                        className="pl-8 h-9 text-sm bg-[var(--surface)] border-[var(--bd)] rounded-lg"
                      />
                    </div>
                    <div className="max-h-[160px] overflow-y-auto rounded-lg border border-[var(--bd)]">
                      {catalogLoading ? (
                        <p className="text-xs text-[var(--t-muted)] p-3">Memuat...</p>
                      ) : catalogRows.length === 0 ? (
                        <p className="text-xs text-[var(--t-muted)] p-3">Nggak ada hasil.</p>
                      ) : (
                        catalogRows.map((row) => (
                          <button
                            key={row.sourceRef}
                            onClick={() => pickCatalogRow(row)}
                            className={`w-full text-left px-3 py-2 text-xs border-b border-[var(--bd)] last:border-b-0 hover:bg-[var(--surface)] cursor-pointer ${
                              sourceRef === row.sourceRef ? 'bg-[var(--brand)]/10' : ''
                            }`}
                          >
                            <span className="font-semibold text-[var(--t-heading)]">{row.skuName}</span>
                            <span className="text-[var(--t-muted)]"> — {row.productName}{row.color ? ` (${row.color})` : ''}</span>
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </>
            )}

            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-[var(--t-heading)]">Nama SKU *</Label>
              <Input value={skuName} onChange={(e) => setSkuName(e.target.value)} className="h-9 text-sm bg-[var(--surface)] border-[var(--bd)] rounded-lg" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-[var(--t-heading)]">Kode untuk QR *</Label>
              <Input value={qrCode} onChange={(e) => setQrCode(e.target.value)} className="h-9 text-sm bg-[var(--surface)] border-[var(--bd)] rounded-lg font-mono" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-[var(--t-heading)]">Nama Produk</Label>
              <Input value={productName} onChange={(e) => setProductName(e.target.value)} className="h-9 text-sm bg-[var(--surface)] border-[var(--bd)] rounded-lg" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-[var(--t-heading)]">Warna/Varian</Label>
              <Input value={color} onChange={(e) => setColor(e.target.value)} className="h-9 text-sm bg-[var(--surface)] border-[var(--bd)] rounded-lg" />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium text-[var(--t-heading)]">Keterangan <span className="font-normal text-[var(--t-muted)]">(opt)</span></Label>
                <label className="flex items-center gap-1.5 text-[11px] text-[var(--t-body)] cursor-pointer">
                  <input type="checkbox" checked={showKeterangan} onChange={(e) => setShowKeterangan(e.target.checked)} className="w-3.5 h-3.5 accent-[var(--brand)] cursor-pointer" />
                  Tampilkan
                </label>
              </div>
              <Input value={keterangan} onChange={(e) => setKeterangan(e.target.value)} className="h-9 text-sm bg-[var(--surface)] border-[var(--bd)] rounded-lg" />
            </div>
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium text-[var(--t-heading)]">Tampilkan Warna di label</Label>
              <label className="flex items-center gap-1.5 text-[11px] text-[var(--t-body)] cursor-pointer">
                <input type="checkbox" checked={showSwatch} onChange={(e) => setShowSwatch(e.target.checked)} className="w-3.5 h-3.5 accent-[var(--brand)] cursor-pointer" />
                Tampilkan
              </label>
            </div>
          </div>

          {/* Right: preview + font overrides */}
          <div className="space-y-3">
            <Label className="text-sm font-medium text-[var(--t-heading)]">Preview</Label>
            <div className="rounded-lg border border-[var(--bd)] bg-white p-2 flex items-center justify-center">
              <canvas ref={canvasRef} width={600} height={360} style={{ width: '100%', maxWidth: 300, height: 'auto' }} />
            </div>

            <div className="space-y-3 p-3 rounded-lg bg-[var(--surface-tint-3)] border border-[var(--bd)]">
              <p className="text-xs font-semibold text-[var(--t-heading)]">Font Size (override label ini)</p>
              <FontSizeSlider label="Nama SKU" value={fontSku} onChange={setFontSku} />
              <FontSizeSlider label="Nama Produk" value={fontName} onChange={setFontName} />
              <FontSizeSlider label="Keterangan" value={fontKet} onChange={setFontKet} />
              <FontSizeSlider label="Warna" value={fontSwatch} onChange={setFontSwatch} />
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving} className="rounded-full px-5">
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving || !skuName.trim() || !qrCode.trim()}
            className="bg-[var(--brand)] hover:bg-[var(--brand-dark)] text-white rounded-full px-5 disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin inline" /> : null}
            {saving ? 'Saving...' : 'Simpan ke Library'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
