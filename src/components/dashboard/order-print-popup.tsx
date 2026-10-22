'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Printer, AlertTriangle, Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  drawLabel,
  printLabelPages,
  DEFAULT_TEMPLATE_ELEMENTS,
  type TemplateElements,
} from '@/lib/label-render';
import { LabelGenerateDialog, type LabelData, type LabelPrefill } from '@/components/dashboard/label-generate-dialog';

export interface OrderPrintRow {
  variantId: string;
  code: string; // the literal scanned barcode/SKU — fallback match against Label.qrCode
  sku: string;
  productName: string;
  color: string;
  type: string;
  qty: number;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderNo: string;
  rows: OrderPrintRow[];
}

function RowThumb({ label, template }: { label: LabelData; template: TemplateElements }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    drawLabel(ctx, template, label).catch(() => {});
  }, [label, template]);
  return <canvas ref={canvasRef} width={600} height={360} className="w-20 h-auto rounded border border-[var(--bd)] bg-white flex-shrink-0" />;
}

async function renderDataUrl(label: LabelData, template: TemplateElements): Promise<string> {
  const canvas = document.createElement('canvas');
  canvas.width = 600;
  canvas.height = 360;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  await drawLabel(ctx, template, label);
  return canvas.toDataURL('image/png');
}

// Post-"Simpan Pesanan" popup (ims-feature-print-popup-input-pesanan.md) —
// replaces the never-built "auto-print diem-diem" idea entirely. Nothing
// here is sent anywhere until the user explicitly clicks a Print button;
// closing it (✕ or outside click) never touches the Order, which is
// already saved by the time this opens.
export function OrderPrintPopup({ open, onOpenChange, orderNo, rows }: Props) {
  const [labels, setLabels] = useState<LabelData[]>([]);
  const [template, setTemplate] = useState<TemplateElements>(DEFAULT_TEMPLATE_ELEMENTS);
  const [loading, setLoading] = useState(true);
  const [printingKey, setPrintingKey] = useState<string | null>(null);
  const [printingAll, setPrintingAll] = useState(false);
  const [generateOpen, setGenerateOpen] = useState(false);
  const [generatePrefill, setGeneratePrefill] = useState<LabelPrefill | null>(null);

  const fetchLabels = useCallback(async () => {
    try {
      const res = await fetch('/api/labels');
      const data = await res.json();
      setLabels(data.labels || []);
    } catch {
      // keep whatever was already loaded
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    Promise.all([
      fetchLabels(),
      fetch('/api/label-templates').then((r) => r.json()).then((data) => {
        if (data.elements) setTemplate(data.elements);
      }).catch(() => {}),
    ]).finally(() => setLoading(false));
  }, [open, fetchLabels]);

  const matched = useMemo(() => {
    return rows.map((row) => {
      const label = labels.find((l) => (l.sourceRef && l.sourceRef === row.variantId) || (l.qrCode && l.qrCode === row.code)) || null;
      return { row, label };
    });
  }, [rows, labels]);

  const readyCount = matched.filter((m) => m.label).length;
  const skippedCount = matched.length - readyCount;

  const handlePrintRow = async (row: OrderPrintRow, label: LabelData) => {
    setPrintingKey(row.variantId);
    try {
      const dataUrl = await renderDataUrl(label, template);
      if (!dataUrl || !printLabelPages(Array.from({ length: row.qty }, () => dataUrl))) {
        alert('Browser memblokir jendela print — izinkan pop-up buat QR Label dulu.');
      }
    } finally {
      setPrintingKey(null);
    }
  };

  const handlePrintAll = async () => {
    const ready = matched.filter((m) => m.label);
    if (ready.length === 0) return;
    setPrintingAll(true);
    try {
      const pages: string[] = [];
      for (const { row, label } of ready) {
        const dataUrl = await renderDataUrl(label!, template);
        if (!dataUrl) continue;
        for (let i = 0; i < row.qty; i++) pages.push(dataUrl);
      }
      if (!printLabelPages(pages)) {
        alert('Browser memblokir jendela print — izinkan pop-up buat QR Label dulu.');
      }
    } finally {
      setPrintingAll(false);
    }
  };

  const openGenerateFor = (row: OrderPrintRow) => {
    setGeneratePrefill({
      type: 'produk',
      sourceRef: row.variantId,
      skuName: row.sku,
      qrCode: row.code || row.sku,
      productName: row.productName,
      color: [row.color, row.type].filter(Boolean).join(' - '),
    });
    setGenerateOpen(true);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg rounded-xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-[var(--t-heading)]">Print Label Pesanan #{orderNo}</DialogTitle>
            <DialogDescription className="text-[var(--t-body)]">
              {matched.length} SKU unik terdeteksi.
            </DialogDescription>
          </DialogHeader>

          {loading ? (
            <p className="text-sm text-[var(--t-muted)]">Memuat...</p>
          ) : (
            <div className="space-y-2">
              {matched.map(({ row, label }) => (
                <div key={row.variantId} className="flex items-center gap-3 p-2.5 rounded-lg border border-[var(--bd)]">
                  {label ? (
                    <RowThumb label={label} template={template} />
                  ) : (
                    <div className="w-20 h-12 rounded border border-[var(--warning)]/40 bg-[var(--warning)]/10 flex items-center justify-center flex-shrink-0 gap-1">
                      <AlertTriangle className="w-3.5 h-3.5 text-[var(--warning)]" />
                      <span className="text-[10px] font-medium text-[var(--warning)]">Belum ada label</span>
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-[var(--t-heading)] truncate">{row.sku}</p>
                    <p className="text-xs text-[var(--t-body)] truncate">
                      {row.productName}{row.color ? ` — ${row.color}` : ''}
                    </p>
                    {!label && (
                      <button
                        onClick={() => openGenerateFor(row)}
                        className="text-[11px] text-[var(--brand)] hover:underline cursor-pointer"
                      >
                        Generate Label dulu →
                      </button>
                    )}
                  </div>
                  <span className="text-xs font-bold bg-[var(--surface)] px-2 py-1 rounded-full flex-shrink-0">{row.qty}x</span>
                  <button
                    onClick={() => label && handlePrintRow(row, label)}
                    disabled={!label || printingKey === row.variantId || printingAll}
                    title={label ? 'Print' : 'Generate Label dulu'}
                    className={`p-2 rounded-lg cursor-pointer disabled:cursor-not-allowed flex-shrink-0 ${
                      label ? 'bg-[var(--brand)]/10 hover:bg-[var(--brand)]/20 text-[var(--brand)] disabled:opacity-50' : 'bg-[var(--surface)] text-[var(--t-muted)]'
                    }`}
                  >
                    {printingKey === row.variantId ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
                  </button>
                </div>
              ))}
            </div>
          )}

          <DialogFooter className="flex-col sm:flex-col items-stretch gap-2">
            <p className="text-xs text-[var(--t-muted)]">
              {readyCount} label siap diprint{skippedCount > 0 ? `, ${skippedCount} belum ada label.` : '.'}
            </p>
            <Button
              onClick={handlePrintAll}
              disabled={readyCount === 0 || printingAll}
              className="bg-[var(--brand)] hover:bg-[var(--brand-dark)] text-white rounded-full w-full disabled:opacity-50"
            >
              {printingAll ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Printer className="w-4 h-4 mr-2" />}
              Print Semua
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <LabelGenerateDialog
        open={generateOpen}
        onOpenChange={setGenerateOpen}
        prefill={generatePrefill}
        template={template}
        onSaved={fetchLabels}
      />
    </>
  );
}
