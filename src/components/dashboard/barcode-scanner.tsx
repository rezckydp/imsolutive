'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  X,
  Minus,
  Plus,
  ShoppingCart,
  Factory,
  Search,
  Trash2,
  CheckCircle2,
  Loader2,
  ScanBarcode,
  Upload,
  FileText,
  AlertTriangle,
} from 'lucide-react';

type ScannerMode = 'order' | 'production';
type OrderSubMode = 'manual' | 'pdf';
type PdfStage = 'idle' | 'uploading' | 'review';

interface ScannedItem {
  id: string;
  code: string;
  sku: string;
  productName: string;
  variantId: string;
  color: string;
  colorHex: string;
  type: string;
  qty: number;
  note: string;
  variantOptions?: Array<{ id: string; color: string; colorHex: string; type: string; qty: number }>;
}

interface BarcodeScannerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOrderCreated?: () => void;
  onProductionAdded?: () => void;
}

// ============ HELPERS ============

async function lookupBarcode(code: string): Promise<{
  lookupType: 'variant' | 'product';
  variantId?: string;
  sku: string;
  name: string;
  color?: string;
  colorHex?: string;
  variantType?: string;
  qty?: number;
  variants?: Array<{ id: string; color: string; colorHex: string; type: string; qty: number }>;
} | null> {
  try {
    const res = await fetch(`/api/barcode/lookup?code=${encodeURIComponent(code.trim())}`);
    if (!res.ok) return null;
    const data = await res.json();

    if (data.variantId) {
      return {
        lookupType: 'variant',
        variantId: data.variantId,
        sku: data.sku,
        name: data.name,
        color: data.color,
        colorHex: data.colorHex,
        variantType: data.type || '',
        qty: data.qty,
      };
    }

    if (data.variants && data.variants.length > 0) {
      return {
        lookupType: 'product',
        sku: data.sku,
        name: data.name,
        variants: data.variants,
      };
    }

    return null;
  } catch {
    return null;
  }
}

// ============ MAIN COMPONENT ============

export function BarcodeScanner({
  open,
  onOpenChange,
  onOrderCreated,
  onProductionAdded,
}: BarcodeScannerProps) {
  const [mode, setMode] = useState<ScannerMode>('order');
  const [orderSubMode, setOrderSubMode] = useState<OrderSubMode>('manual');
  const [pickingListNo, setPickingListNo] = useState('');
  const [pdfStage, setPdfStage] = useState<PdfStage>('idle');
  const [pdfFileName, setPdfFileName] = useState('');
  const [pdfError, setPdfError] = useState('');
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<ScannedItem[]>([]);
  const [manualCode, setManualCode] = useState('');
  const [lookingUp, setLookingUp] = useState(false);
  const [lookupError, setLookupError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const isProcessing = useRef(false);

  // For production mode
  const [printers, setPrinters] = useState<Array<{ id: string; name: string; status: string }>>([]);
  const [selectedPrinter, setSelectedPrinter] = useState('');

  // Reset order-specific sub-state when switching to production mode
  useEffect(() => {
    if (mode === 'production') {
      setOrderSubMode('manual');
      setPdfStage('idle');
      setPdfFileName('');
      setPdfError('');
    }
  }, [mode]);

  // Fetch printers for production mode
  useEffect(() => {
    if (open && mode === 'production') {
      fetch('/api/printers')
        .then((r) => r.json())
        .then((data) => {
          if (Array.isArray(data)) setPrinters(data);
        })
        .catch(() => {});
    }
  }, [open, mode]);

  // Auto-focus input when dialog opens, mode changes, or when lookup finishes
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open, mode]);

  // Re-focus input after lookup completes (lookingUp transitions from true → false)
  const prevLookingUp = useRef(false);
  useEffect(() => {
    if (prevLookingUp.current && !lookingUp) {
      // lookingUp just finished — refocus input
      setTimeout(() => inputRef.current?.focus(), 10);
    }
    prevLookingUp.current = lookingUp;
  }, [lookingUp]);

  // ============ SCAN HANDLER ============

  const handleScan = useCallback(async (code: string) => {
    if (isProcessing.current) return;
    isProcessing.current = true;
    setLookingUp(true);
    setLookupError('');

    try {
      const result = await lookupBarcode(code);

      if (!result) {
        setLookupError(`Barcode "${code}" tidak ditemukan`);
        isProcessing.current = false;
        setLookingUp(false);
        return;
      }

      if (result.lookupType === 'variant' && result.variantId) {
        const newItem: ScannedItem = {
          id: `scan-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          code,
          sku: result.sku,
          productName: result.name,
          variantId: result.variantId,
          color: result.color || '',
          colorHex: result.colorHex || '#000000',
          type: result.variantType || '',
          qty: 1,
          note: '',
        };

        setItems((prev) => {
          const existing = prev.find((i) => i.variantId === result.variantId);
          if (existing) {
            return prev.map((i) =>
              i.variantId === result.variantId ? { ...i, qty: i.qty + 1 } : i
            );
          }
          return [newItem, ...prev];
        });
      } else if (result.lookupType === 'product' && result.variants && result.variants.length === 1) {
        const v = result.variants[0];
        const newItem: ScannedItem = {
          id: `scan-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          code,
          sku: result.sku,
          productName: result.name,
          variantId: v.id,
          color: v.color,
          colorHex: v.colorHex,
          type: v.type || '',
          qty: 1,
          note: '',
        };

        setItems((prev) => {
          const existing = prev.find((i) => i.variantId === v.id);
          if (existing) {
            return prev.map((i) =>
              i.variantId === v.id ? { ...i, qty: i.qty + 1 } : i
            );
          }
          return [newItem, ...prev];
        });
      } else if (result.lookupType === 'product' && result.variants && result.variants.length > 1) {
        const newItem: ScannedItem = {
          id: `scan-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          code,
          sku: result.sku,
          productName: result.name,
          variantId: '',
          color: '',
          colorHex: '#000000',
          type: '',
          qty: 1,
          variantOptions: result.variants,
          note: '',
        };
        setItems((prev) => [newItem, ...prev]);
      }
    } catch {
      setLookupError('Gagal lookup barcode');
    } finally {
      isProcessing.current = false;
      setLookingUp(false);
    }
  }, []);

  // ============ MANUAL LOOKUP ============

  const handleManualLookup = async () => {
    if (!manualCode.trim()) return;
    await handleScan(manualCode.trim());
    setManualCode('');
    // Focus will be restored by the lookingUp useEffect above
  };

  const handleManualKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleManualLookup();
  };

  // ============ PDF UPLOAD (Picking List) ============

  const handlePdfFileSelected = async (file: File) => {
    setPdfFileName(file.name);
    setPdfStage('uploading');
    setPdfError('');

    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/orders/parse-picking-list', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();

      if (!res.ok) {
        setPdfError(data.error || 'Gagal membaca PDF');
        setPdfStage('idle');
        return;
      }

      if (data.pickingListNo) setPickingListNo(data.pickingListNo);

      const extracted: ScannedItem[] = (data.items || []).map(
        (it: {
          code: string;
          variantId: string | null;
          sku: string;
          name: string;
          color: string;
          colorHex: string;
          type: string;
          qty: number;
          matched: boolean;
        }) => ({
          id: `pdf-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          code: it.code,
          sku: it.sku,
          productName: it.name || (it.matched ? '' : 'SKU tidak ditemukan di database'),
          variantId: it.variantId || '',
          color: it.color,
          colorHex: it.colorHex || '#000000',
          type: it.type,
          qty: it.qty || 1,
          note: '',
        })
      );

      setItems(extracted);
      setPdfStage('review');
    } catch {
      setPdfError('Gagal mengupload file. Coba lagi.');
      setPdfStage('idle');
    }
  };

  const resetPdfUpload = () => {
    setPdfStage('idle');
    setPdfFileName('');
    setPdfError('');
    setItems([]);
  };

  // ============ ITEM MANAGEMENT ============

  const updateItemQty = (itemId: string, delta: number) => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.id !== itemId) return item;
        return { ...item, qty: Math.max(1, item.qty + delta) };
      })
    );
  };

  const setItemQty = (itemId: string, qty: number) => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.id !== itemId) return item;
        return { ...item, qty: Math.max(1, qty) };
      })
    );
  };

  const handleVariantSelect = (itemId: string, variantId: string) => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.id !== itemId) return item;
        const selected = item.variantOptions?.find((v) => v.id === variantId);
        return {
          ...item,
          variantId,
          color: selected?.color || '',
          colorHex: selected?.colorHex || '#000000',
          type: selected?.type || '',
          variantOptions: undefined,
        };
      })
    );
  };

  const updateItemNote = (itemId: string, note: string) => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.id !== itemId) return item;
        return { ...item, note };
      })
    );
  };

  const removeItem = (itemId: string) => {
    setItems((prev) => prev.filter((i) => i.id !== itemId));
  };

  const clearAll = () => {
    setItems([]);
    setLookupError('');
  };

  // ============ SUBMIT ============

  const handleSubmit = async () => {
    const validItems = items.filter((i) => i.variantId);
    if (validItems.length === 0) return;

    if (mode === 'order' && !pickingListNo.trim()) {
      setLookupError('No. Picking List wajib diisi sebelum submit');
      return;
    }

    setSubmitting(true);

    try {
      if (mode === 'order') {
        const orderNo = pickingListNo.trim();
        const res = await fetch('/api/orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            orderNo,
            items: validItems.map((i) => ({ variantId: i.variantId, qty: i.qty, note: i.note || '' })),
          }),
        });

        if (!res.ok) {
          const data = await res.json();
          alert(data.error || 'Gagal membuat pesanan');
          setSubmitting(false);
          return;
        }

        setItems([]);
        setLookupError('');
        setPickingListNo('');
        resetPdfUpload();
        onOrderCreated?.();
        onOpenChange(false);
      } else {
        for (const item of validItems) {
          await fetch('/api/production', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              variantId: item.variantId,
              qty: item.qty,
              assignedTo: selectedPrinter || '',
              note: item.note || '',
            }),
          });
        }

        setItems([]);
        setLookupError('');
        onProductionAdded?.();
        onOpenChange(false);
      }
    } catch {
      alert('Gagal mengirim. Coba lagi.');
    } finally {
      setSubmitting(false);
    }
  };

  // ============ RESET ON CLOSE ============

  const handleClose = (val: boolean) => {
    if (!val) {
      setItems([]);
      setLookupError('');
      setManualCode('');
      setMode('order');
      setOrderSubMode('manual');
      setPickingListNo('');
      resetPdfUpload();
    }
    onOpenChange(val);
  };

  const validItemCount = items.filter((i) => i.variantId).length;
  const totalQty = items.reduce((sum, i) => (i.variantId ? sum + i.qty : sum), 0);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent
        className="
          max-h-[90vh] flex flex-col p-0
          max-w-[calc(100%-1rem)] sm:max-w-md
          fixed
          max-md:inset-x-1 max-md:top-2 max-md:bottom-2 max-md:translate-x-0 max-md:translate-y-0 max-md:max-w-full max-md:rounded-2xl
          sm:left-1/2 sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-xl
        "
      >
        {/* Header */}
        <DialogHeader className="px-4 pt-4 pb-0 flex-shrink-0 max-md:px-3 max-md:pt-3">
          <div className="flex items-center justify-between max-md:gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <ScanBarcode className="w-5 h-5 text-[#4a6741] flex-shrink-0" />
              <DialogTitle className="text-[#2d3436] text-base max-md:text-sm truncate">
                {mode === 'order' ? 'Input Pesanan' : 'Input Produksi'}
              </DialogTitle>
            </div>
            <div className="flex items-center gap-1 bg-[#f5f6fa] rounded-lg p-0.5 flex-shrink-0">
              <button
                onClick={() => setMode('order')}
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all cursor-pointer ${
                  mode === 'order'
                    ? 'bg-white text-[#4a6741] shadow-sm'
                    : 'text-[#4b5563] hover:text-[#2d3436]'
                }`}
              >
                <ShoppingCart className="w-3.5 h-3.5" />
                <span className="max-md:hidden">Pesanan</span>
              </button>
              <button
                onClick={() => setMode('production')}
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all cursor-pointer ${
                  mode === 'production'
                    ? 'bg-white text-[#2563eb] shadow-sm'
                    : 'text-[#4b5563] hover:text-[#2d3436]'
                }`}
              >
                <Factory className="w-3.5 h-3.5" />
                <span className="max-md:hidden">Produksi</span>
              </button>
            </div>
          </div>
          <DialogDescription className="text-[#4b5563] mt-1 text-xs">
            {mode === 'order'
              ? 'Ketik atau scan barcode untuk input pesanan baru'
              : 'Ketik atau scan barcode untuk input stok produksi'}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex flex-col px-4 pb-4 max-md:px-3 max-md:pb-3">
          {/* No. Picking List — order mode only */}
          {mode === 'order' && (
            <div className="mt-3 flex-shrink-0 space-y-2">
              <div>
                <label className="text-[11px] font-medium text-[#4b5563] flex items-center gap-1.5 mb-1">
                  <FileText className="w-3.5 h-3.5" />
                  No. Picking List
                </label>
                <Input
                  value={pickingListNo}
                  onChange={(e) => setPickingListNo(e.target.value)}
                  placeholder="e.g. PICK-000775"
                  disabled={orderSubMode === 'pdf' && pdfStage === 'review'}
                  className="h-9 text-sm bg-[#f5f6fa] border-[#e8e8e8] rounded-lg disabled:opacity-70"
                />
                {orderSubMode === 'pdf' && pdfStage === 'review' && pickingListNo && (
                  <p className="text-[11px] text-[#15803d] flex items-center gap-1 mt-1">
                    <CheckCircle2 className="w-3 h-3" /> Terdeteksi otomatis dari PDF — bisa diedit kalau salah baca
                  </p>
                )}
              </div>

              {/* Manual/PDF sub-mode toggle */}
              <div className="flex gap-1 bg-[#f5f6fa] p-0.5 rounded-lg w-fit">
                <button
                  onClick={() => setOrderSubMode('manual')}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                    orderSubMode === 'manual' ? 'bg-white text-[#2d3436] shadow-sm' : 'text-[#6b7280] hover:text-[#2d3436]'
                  }`}
                >
                  <ScanBarcode className="w-3.5 h-3.5" />
                  Manual / Scan
                </button>
                <button
                  onClick={() => setOrderSubMode('pdf')}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                    orderSubMode === 'pdf' ? 'bg-white text-[#2d3436] shadow-sm' : 'text-[#6b7280] hover:text-[#2d3436]'
                  }`}
                >
                  <Upload className="w-3.5 h-3.5" />
                  Upload PDF
                </button>
              </div>
            </div>
          )}

          {/* Manual Input */}
          {!(mode === 'order' && orderSubMode === 'pdf') && (
            <div className="mt-3 flex gap-2 flex-shrink-0">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#6b7280]" />
                <Input
                  ref={inputRef}
                  value={manualCode}
                  onChange={(e) => setManualCode(e.target.value)}
                  onKeyDown={handleManualKeyDown}
                  placeholder="Ketik barcode atau SKU..."
                  disabled={lookingUp}
                  autoFocus
                  className="pl-9 text-sm bg-[#f5f6fa] border-[#e8e8e8] rounded-lg h-11"
                />
              </div>
              <Button
                onClick={handleManualLookup}
                disabled={lookingUp || !manualCode.trim()}
                className="bg-[#4a6741] hover:bg-[#3d5535] text-white h-11 px-5 rounded-lg flex-shrink-0 disabled:opacity-50"
              >
                {lookingUp ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              </Button>
            </div>
          )}

          {/* PDF Upload — order mode + pdf sub-mode only */}
          {mode === 'order' && orderSubMode === 'pdf' && (
            <div className="mt-3 flex-shrink-0">
              <input
                ref={pdfInputRef}
                type="file"
                accept="application/pdf"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handlePdfFileSelected(f);
                  e.target.value = '';
                }}
              />

              {pdfStage === 'idle' && (
                <button
                  onClick={() => pdfInputRef.current?.click()}
                  className="w-full border-2 border-dashed border-[#e8e8e8] hover:border-[#4a6741] rounded-xl py-8 flex flex-col items-center gap-2 text-[#6b7280] hover:text-[#4a6741] transition-colors cursor-pointer"
                >
                  <Upload className="w-6 h-6" />
                  <span className="text-sm font-medium">Klik untuk upload PDF Picking List</span>
                  <span className="text-[11px] text-[#9ca3af]">Format .pdf dari Desty / omnichannel lainnya</span>
                </button>
              )}

              {pdfStage === 'uploading' && (
                <div className="w-full border border-[#e8e8e8] rounded-xl py-8 flex flex-col items-center gap-2">
                  <Loader2 className="w-5 h-5 text-[#4a6741] animate-spin" />
                  <span className="text-sm text-[#4b5563]">Membaca {pdfFileName}...</span>
                  <span className="text-[11px] text-[#9ca3af]">Mencocokkan SKU ke database</span>
                </div>
              )}

              {pdfStage === 'review' && (
                <div className="flex items-center justify-between bg-[#f5f6fa] rounded-lg px-3 py-2">
                  <span className="text-xs text-[#4b5563] flex items-center gap-1.5 truncate">
                    <FileText className="w-3.5 h-3.5 flex-shrink-0" /> {pdfFileName}
                  </span>
                  <button onClick={resetPdfUpload} className="text-[11px] text-[#4a6741] font-medium hover:underline cursor-pointer flex-shrink-0">
                    Ganti file
                  </button>
                </div>
              )}

              {pdfError && (
                <div className="mt-2 p-2.5 rounded-lg bg-[#dc2626]/5 border border-[#dc2626]/20 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-[#dc2626] flex-shrink-0 mt-0.5" />
                  <span className="text-xs text-[#dc2626] flex-1">{pdfError}</span>
                  <button onClick={() => setPdfError('')} className="text-[#dc2626]/60 hover:text-[#dc2626] cursor-pointer flex-shrink-0">
                    <X className="w-3 h-3" />
                  </button>
                </div>
              )}

              {pdfStage === 'review' && items.length > 0 && (
                <div className="mt-2 flex items-center gap-3 text-[11px]">
                  <span className="flex items-center gap-1 text-[#15803d] font-medium">
                    <CheckCircle2 className="w-3 h-3" /> {items.filter((i) => i.variantId).length} SKU cocok
                  </span>
                  {items.some((i) => !i.variantId) && (
                    <span className="flex items-center gap-1 text-[#d97706] font-medium">
                      <AlertTriangle className="w-3 h-3" /> {items.filter((i) => !i.variantId).length} perlu dicek manual
                    </span>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Lookup Error */}
          {lookupError && (
            <div className="mt-2 p-2.5 rounded-lg bg-[#dc2626]/5 border border-[#dc2626]/20 flex items-start gap-2 flex-shrink-0">
              <X className="w-4 h-4 text-[#dc2626] flex-shrink-0 mt-0.5" />
              <span className="text-xs text-[#dc2626] flex-1">{lookupError}</span>
              <button onClick={() => setLookupError('')} className="text-[#dc2626]/60 hover:text-[#dc2626] cursor-pointer flex-shrink-0">
                <X className="w-3 h-3" />
              </button>
            </div>
          )}

          {/* Scanned Items */}
          {items.length > 0 && (
            <div className="mt-3 flex-1 min-h-0 flex flex-col">
              <div className="flex items-center justify-between mb-2 flex-shrink-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-[#2d3436]">
                    Item
                    <span className="text-[#6b7280] ml-1">({validItemCount}/{items.length})</span>
                  </span>
                  {totalQty > 0 && (
                    <Badge className="bg-[#4a6741]/10 text-[#4a6741] border-[#4a6741]/30 text-[11px] px-1.5 py-0 rounded-full font-semibold" variant="outline">
                      Total: {totalQty}
                    </Badge>
                  )}
                </div>
                <button
                  onClick={clearAll}
                  className="text-[11px] text-[#dc2626] hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <Trash2 className="w-3 h-3" />
                  Hapus Semua
                </button>
              </div>

              <div className="flex-1 min-h-0 overflow-y-auto rounded-lg border border-[#e8e8e8] -webkit-overflow-scrolling-touch">
                <div className="p-2 space-y-2">
                  {items.map((item) => (
                    <div
                      key={item.id}
                      className={`p-2.5 md:p-3 rounded-lg border transition-colors ${
                        item.variantId
                          ? 'border-[#e8e8e8] bg-white'
                          : 'border-[#d97706]/30 bg-[#d97706]/5'
                      }`}
                    >
                      {/* Top row */}
                      <div className="flex items-start justify-between gap-2 mb-1.5">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[11px] md:text-xs font-semibold text-[#2d3436] bg-[#f0f0f0] px-1.5 py-0.5 rounded">
                              {item.sku}
                            </span>
                            {item.variantId && (
                              <CheckCircle2 className="w-3 h-3 text-[#15803d] flex-shrink-0" />
                            )}
                            {!item.variantId && (
                              <span className="text-[11px] text-[#d97706] font-medium">Pilih warna</span>
                            )}
                          </div>
                          <p className="text-[11px] text-[#6b7280] mt-0.5 truncate">{item.productName}</p>
                        </div>
                        <button
                          onClick={() => removeItem(item.id)}
                          className="p-1 rounded hover:bg-[#dc2626]/10 text-[#6b7280] hover:text-[#dc2626] transition-colors cursor-pointer flex-shrink-0"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {/* Variant selector */}
                      {item.variantOptions && !item.variantId && (
                        <div className="mb-1.5">
                          <Select onValueChange={(val) => handleVariantSelect(item.id, val)}>
                            <SelectTrigger className="h-8 text-xs bg-white border-[#e8e8e8] rounded-lg">
                              <SelectValue placeholder="Pilih warna..." />
                            </SelectTrigger>
                            <SelectContent>
                              {item.variantOptions.map((v) => (
                                <SelectItem key={v.id} value={v.id}>
                                  <div className="flex items-center gap-2">
                                    <span
                                      className="w-3 h-3 rounded-full border border-[#e8e8e8] flex-shrink-0"
                                      style={{ backgroundColor: v.colorHex }}
                                    />
                                    <span>{v.color}</span>
                                    <span className="text-[11px] text-[#6b7280]">(stock: {v.qty})</span>
                            {v.type && <span className="text-[11px] text-[#6b7280] ml-1">{v.type}</span>}
                                  </div>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}

                      {/* Color + qty row */}
                      {item.variantId && (
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span
                              className="w-5 h-5 rounded-full border border-[#e8e8e8] shadow-sm flex-shrink-0"
                              style={{ backgroundColor: item.colorHex }}
                            />
                            <span className="text-xs text-[#4b5563]">{item.color}{item.type ? ` - ${item.type}` : ''}</span>
                          </div>

                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => updateItemQty(item.id, -1)}
                              className="w-7 h-7 rounded-md bg-[#f5f6fa] hover:bg-[#e8e8e8] flex items-center justify-center cursor-pointer transition-colors active:bg-[#dfe6e9]"
                            >
                              <Minus className="w-3 h-3 text-[#4b5563]" />
                            </button>
                            <input
                              type="number"
                              min={1}
                              value={item.qty}
                              onChange={(e) => setItemQty(item.id, parseInt(e.target.value) || 1)}
                              className="w-12 h-7 text-center text-xs font-semibold bg-[#f5f6fa] border border-[#e8e8e8] rounded-md focus:outline-none focus:ring-1 focus:ring-[#4a6741]/30"
                            />
                            <button
                              onClick={() => updateItemQty(item.id, 1)}
                              className="w-7 h-7 rounded-md bg-[#f5f6fa] hover:bg-[#e8e8e8] flex items-center justify-center cursor-pointer transition-colors active:bg-[#dfe6e9]"
                            >
                              <Plus className="w-3 h-3 text-[#4b5563]" />
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Note input for Req. Color items */}
                      {item.variantId && (item.color.toLowerCase().includes('req') || item.color.toLowerCase().includes('request') || item.color === '') && (
                        <div className="mt-1.5">
                          <input
                            type="text"
                            value={item.note}
                            onChange={(e) => updateItemNote(item.id, e.target.value)}
                            placeholder="Tulis warna yang diminta customer..."
                            className="w-full h-7 text-xs bg-[#d97706]/5 border border-[#d97706]/20 rounded-md px-2 text-[#92400e] placeholder:text-[#d97706]/50 focus:outline-none focus:ring-1 focus:ring-[#d97706]/30"
                          />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Production: Printer selection */}
              {mode === 'production' && validItemCount > 0 && (
                <div className="mt-2 flex-shrink-0">
                  <Select value={selectedPrinter} onValueChange={setSelectedPrinter}>
                    <SelectTrigger className="h-9 text-xs bg-[#f5f6fa] border-[#e8e8e8] rounded-lg">
                      <SelectValue placeholder="Pilih printer (opsional)..." />
                    </SelectTrigger>
                    <SelectContent>
                      {printers
                        .filter((p) => p.status === 'Working')
                        .map((p) => (
                          <SelectItem key={p.id} value={p.name}>
                            <div className="flex items-center gap-2">
                              <span className="w-2 h-2 rounded-full bg-[#15803d] flex-shrink-0" />
                              {p.name}
                            </div>
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Submit Button */}
              <div className="mt-3 flex-shrink-0">
                <Button
                  onClick={handleSubmit}
                  disabled={submitting || validItemCount === 0 || (mode === 'order' && !pickingListNo.trim())}
                  className={`w-full h-11 rounded-lg font-semibold text-sm disabled:opacity-50 ${
                    mode === 'order'
                      ? 'bg-[#4a6741] hover:bg-[#3d5535] text-white'
                      : 'bg-[#2563eb] hover:bg-[#2980b9] text-white'
                  }`}
                >
                  {submitting ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : mode === 'order' ? (
                    <ShoppingCart className="w-4 h-4 mr-2" />
                  ) : (
                    <Factory className="w-4 h-4 mr-2" />
                  )}
                  {submitting
                    ? 'Mengirim...'
                    : mode === 'order'
                      ? `Submit Pesanan (${validItemCount} item, ${totalQty} qty)`
                      : `Submit Produksi (${validItemCount} item, ${totalQty} qty)`}
                </Button>
              </div>
            </div>
          )}

          {/* Empty state */}
          {items.length === 0 && !lookingUp && !(mode === 'order' && orderSubMode === 'pdf') && (
            <div className="mt-6 flex flex-col items-center justify-center py-8 md:py-12 text-center flex-shrink-0">
              <div className="w-16 h-16 rounded-full bg-[#f5f6fa] flex items-center justify-center mb-3">
                <ScanBarcode className="w-7 h-7 text-[#6b7280]" />
              </div>
              <p className="text-sm text-[#4b5563] font-medium">Belum ada item</p>
              <p className="text-xs text-[#6b7280] mt-1">
                Ketik barcode/SKU di atas atau scan pakai alat barcode scanner
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
