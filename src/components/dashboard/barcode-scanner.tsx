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
  Undo2,
  PackageCheck,
  Camera,
  CameraOff,
} from 'lucide-react';
import { OrderPrintPopup, type OrderPrintRow } from '@/components/dashboard/order-print-popup';

type ScannerMode = 'order' | 'receive';
// Pesanan's own sub-tabs — Produksi lives here now instead of as a
// top-level mode, since the two are almost always used back-to-back in one
// work session (ims-ux-merge-produksi-tab.md).
type OrderSubTab = 'picking' | 'production' | 'adjustment';
type OrderSubMode = 'manual' | 'pdf';
type PdfStage = 'idle' | 'uploading' | 'review';

// One scanned-in unit during a "Terima Stok" session — pushed to the front
// of scanHistory (LIFO) so "Undo Scan Terakhir" always undoes index 0.
interface ReceiveScanEntry {
  variantId: string;
  jobId: string | null;
  sku: string;
  name: string;
  color: string;
  colorHex: string;
  type: string;
  source: 'production' | 'unlinked';
}

// "Req. Color" variants (customer picks a custom color per order) must never
// auto-stack with each other — each scan represents a different customer's
// request and needs its own qty + note, even though they share one variantId.
// Detected via "req" appearing in either the color OR type field — some
// products store it in Color, others in Type, so check both.
const isRequestColorVariant = (color: string, type: string) =>
  color.toLowerCase().includes('req') || type.toLowerCase().includes('req');

const DEFAULT_ORDER_NOTES_LABEL = 'Catatan Tambahan';

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
  // Per-variant toggle set in the Produk form (ims-feature-input-pesanan-
  // catatan-dinamis.md) — replaces the old hardcoded "-CRS suffix" detection,
  // so any product can opt into an order-time note field without new code.
  requiresOrderNotes: boolean;
  orderNotesLabel: string;
  orderNotesPlaceholder: string;
  orderNotesRequired: boolean;
  variantOptions?: Array<{
    id: string;
    color: string;
    colorHex: string;
    type: string;
    qty: number;
    requiresOrderNotes: boolean;
    orderNotesLabel: string | null;
    orderNotesPlaceholder: string | null;
    orderNotesRequired: boolean;
  }>;
}

interface BarcodeScannerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOrderCreated?: () => void;
  onProductionAdded?: () => void;
  onStockReceived?: () => void;
}

// ============ HELPERS ============

export async function lookupBarcode(code: string): Promise<{
  lookupType: 'variant' | 'product';
  variantId?: string;
  sku: string;
  name: string;
  color?: string;
  colorHex?: string;
  variantType?: string;
  qty?: number;
  requiresOrderNotes?: boolean;
  orderNotesLabel?: string | null;
  orderNotesPlaceholder?: string | null;
  orderNotesRequired?: boolean;
  variants?: Array<{
    id: string;
    color: string;
    colorHex: string;
    type: string;
    qty: number;
    requiresOrderNotes: boolean;
    orderNotesLabel: string | null;
    orderNotesPlaceholder: string | null;
    orderNotesRequired: boolean;
  }>;
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
        requiresOrderNotes: !!data.requiresOrderNotes,
        orderNotesLabel: data.orderNotesLabel,
        orderNotesPlaceholder: data.orderNotesPlaceholder,
        orderNotesRequired: data.orderNotesRequired ?? true,
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
  onStockReceived,
}: BarcodeScannerProps) {
  const [mode, setMode] = useState<ScannerMode>('order');
  const [orderSubTab, setOrderSubTab] = useState<OrderSubTab>('picking');
  const [orderSubMode, setOrderSubMode] = useState<OrderSubMode>('manual');
  const [pickingListNo, setPickingListNo] = useState('');
  const [fetchingNumber, setFetchingNumber] = useState(false);
  const [pdfStage, setPdfStage] = useState<PdfStage>('idle');
  const [pdfFileName, setPdfFileName] = useState('');
  const [pdfError, setPdfError] = useState('');
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<ScannedItem[]>([]);
  const [manualCode, setManualCode] = useState('');
  const [lookingUp, setLookingUp] = useState(false);
  const [lookupError, setLookupError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [printPopup, setPrintPopup] = useState<{ orderNo: string; rows: OrderPrintRow[] } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const isProcessing = useRef(false);

  // Camera scanning (ZXing) — shared by both "Pesanan" and "Terima Stok",
  // since both just feed decoded codes into the same manual-lookup flow
  // (ims-hotfix-camera-scan-terima-stok.md).
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const cameraControlsRef = useRef<{ stop: () => void } | null>(null);

  // For production mode
  const [printers, setPrinters] = useState<Array<{ id: string; name: string; status: string }>>([]);
  const [selectedPrinter, setSelectedPrinter] = useState('');

  // For "Terima Stok" (receive) mode — each scan commits immediately, no
  // batch submit. scanHistory is LIFO (newest first) so Undo always targets
  // index 0 — reset only when the modal closes, not on mode switch.
  const [scanHistory, setScanHistory] = useState<ReceiveScanEntry[]>([]);
  const [todayTotal, setTodayTotal] = useState<number | null>(null);
  const [undoingLast, setUndoingLast] = useState(false);

  // Auto-popup Note prompt right after a Req. Color item is scanned
  // (ims-feature-auto-popup-note-request-color.md) — Picking List/Adjustment
  // only, never Produksi. Scanning another Req. Color item while one prompt
  // is still open just swaps the target id, which is exactly Esc/skip
  // behavior for the old one since nothing gets saved either way.
  const [notePromptItemId, setNotePromptItemId] = useState<string | null>(null);
  const [notePromptValue, setNotePromptValue] = useState('');
  const notePromptInputRef = useRef<HTMLInputElement>(null);
  const notePromptWrapRef = useRef<HTMLDivElement>(null);

  // Reset order-specific sub-state when switching to the Produksi sub-tab
  useEffect(() => {
    if (mode === 'order' && orderSubTab === 'production') {
      setOrderSubMode('manual');
      setPdfStage('idle');
      setPdfFileName('');
      setPdfError('');
    }
  }, [mode, orderSubTab]);

  // Fetch printers for the Produksi sub-tab
  useEffect(() => {
    if (open && mode === 'order' && orderSubTab === 'production') {
      fetch('/api/printers')
        .then((r) => r.json())
        .then((data) => {
          if (Array.isArray(data)) setPrinters(data);
        })
        .catch(() => {});
    }
  }, [open, mode, orderSubTab]);

  const fetchNextNumber = useCallback(async (type: 'picking' | 'adjustment') => {
    setFetchingNumber(true);
    try {
      const res = await fetch(`/api/orders/next-number?type=${type}`);
      const data = await res.json();
      if (data.nextOrderNo) setPickingListNo(data.nextOrderNo);
    } catch {
      // silent — person can still type the number manually
    } finally {
      setFetchingNumber(false);
    }
  }, []);

  const handleOrderSubTabChange = (tab: OrderSubTab) => {
    setOrderSubTab(tab);
    // Produksi has no Picking List/Adjustment number of its own
    if (tab !== 'production') fetchNextNumber(tab);
  };

  // Auto-fill No. Picking List with the next number when the dialog opens fresh
  useEffect(() => {
    if (open && mode === 'order' && orderSubTab !== 'production' && !pickingListNo) {
      setOrderSubTab('picking');
      fetchNextNumber('picking');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

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
          requiresOrderNotes: !!result.requiresOrderNotes,
          orderNotesLabel: result.orderNotesLabel || DEFAULT_ORDER_NOTES_LABEL,
          orderNotesPlaceholder: result.orderNotesPlaceholder || '',
          orderNotesRequired: result.orderNotesRequired ?? true,
        };

        setItems((prev) => {
          const existing =
            !isRequestColorVariant(result.color || '', result.variantType || '') &&
            !result.requiresOrderNotes &&
            prev.find((i) => i.variantId === result.variantId);
          if (existing) {
            return prev.map((i) =>
              i.variantId === result.variantId ? { ...i, qty: i.qty + 1 } : i
            );
          }
          return [newItem, ...prev];
        });
        if (isRequestColorVariant(result.color || '', result.variantType || '') && mode === 'order' && orderSubTab !== 'production') {
          setNotePromptItemId(newItem.id);
          setNotePromptValue('');
        }
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
          requiresOrderNotes: !!v.requiresOrderNotes,
          orderNotesLabel: v.orderNotesLabel || DEFAULT_ORDER_NOTES_LABEL,
          orderNotesPlaceholder: v.orderNotesPlaceholder || '',
          orderNotesRequired: v.orderNotesRequired ?? true,
        };

        setItems((prev) => {
          const existing =
            !isRequestColorVariant(v.color || '', v.type || '') &&
            !v.requiresOrderNotes &&
            prev.find((i) => i.variantId === v.id);
          if (existing) {
            return prev.map((i) =>
              i.variantId === v.id ? { ...i, qty: i.qty + 1 } : i
            );
          }
          return [newItem, ...prev];
        });
        if (isRequestColorVariant(v.color || '', v.type || '') && mode === 'order' && orderSubTab !== 'production') {
          setNotePromptItemId(newItem.id);
          setNotePromptValue('');
        }
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
          requiresOrderNotes: false,
          orderNotesLabel: DEFAULT_ORDER_NOTES_LABEL,
          orderNotesPlaceholder: '',
          orderNotesRequired: true,
        };
        setItems((prev) => [newItem, ...prev]);
      }
    } catch {
      setLookupError('Gagal lookup barcode');
    } finally {
      isProcessing.current = false;
      setLookingUp(false);
    }
  }, [mode, orderSubTab]);

  // ============ RECEIVE STOK (Terima Stok) ============

  const handleReceiveScan = useCallback(async (code: string) => {
    if (isProcessing.current) return;
    isProcessing.current = true;
    setLookingUp(true);
    setLookupError('');

    try {
      const res = await fetch('/api/stock/receive-scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      const data = await res.json();

      if (!res.ok) {
        setLookupError(data.error || 'Gagal menerima scan');
        return;
      }

      const entry: ReceiveScanEntry = {
        variantId: data.variantId,
        jobId: data.jobId ?? null,
        sku: data.sku,
        name: data.name,
        color: data.color || '',
        colorHex: data.colorHex || '#000000',
        type: data.type || '',
        source: data.source,
      };
      setScanHistory((prev) => [entry, ...prev]);
      setTodayTotal(data.todayTotal);
      onStockReceived?.();
    } catch {
      setLookupError('Gagal menerima scan. Coba lagi.');
    } finally {
      isProcessing.current = false;
      setLookingUp(false);
    }
  }, [onStockReceived]);

  const handleUndoLastScan = async () => {
    const last = scanHistory[0];
    if (!last) return;
    setUndoingLast(true);
    try {
      const res = await fetch('/api/stock/undo-scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ variantId: last.variantId, jobId: last.jobId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setLookupError(data.error || 'Gagal undo scan');
        return;
      }
      setScanHistory((prev) => prev.slice(1));
      setTodayTotal(data.todayTotal);
      onStockReceived?.();
    } catch {
      setLookupError('Gagal undo scan. Coba lagi.');
    } finally {
      setUndoingLast(false);
    }
  };

  // ============ MANUAL LOOKUP (shared with camera decode) ============

  // Both the typed/physical-scanner input and the camera decoder feed the
  // exact same lookup flow — no separate logic per input method.
  const processScannedCode = useCallback(async (code: string) => {
    const trimmed = code.trim();
    if (!trimmed) return;
    if (mode === 'receive') {
      await handleReceiveScan(trimmed);
    } else {
      await handleScan(trimmed);
    }
  }, [mode, handleReceiveScan, handleScan]);

  const handleManualLookup = async () => {
    if (!manualCode.trim()) return;
    await processScannedCode(manualCode);
    setManualCode('');
    // Focus will be restored by the lookingUp useEffect above
  };

  const handleManualKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleManualLookup();
  };

  // Manual input (and the camera toggle beside it) is hidden only while
  // reviewing an uploaded PDF picking list.
  const showManualInput = !(mode === 'order' && orderSubMode === 'pdf');

  // Camera scanning — only runs while the manual-input row is showing and
  // the camera is toggled on; stops automatically otherwise (PDF sub-mode,
  // dialog closed, or user closes it) so it can't decode into a closed UI.
  useEffect(() => {
    if (!(open && cameraOn && showManualInput && videoRef.current)) return;
    let stopped = false;
    setCameraError(null);
    import('@zxing/browser').then(({ BrowserMultiFormatReader }) => {
      if (stopped || !videoRef.current) return;
      const reader = new BrowserMultiFormatReader();
      reader
        .decodeFromVideoDevice(undefined, videoRef.current, (result) => {
          if (result) processScannedCode(result.getText());
        })
        .then((controls) => {
          if (stopped) controls.stop();
          else cameraControlsRef.current = controls;
        })
        .catch(() => {
          setCameraError('Gagal akses kamera. Pastikan izin kamera diizinkan & domain diakses lewat HTTPS.');
          setCameraOn(false);
        });
    });
    return () => {
      stopped = true;
      cameraControlsRef.current?.stop();
      cameraControlsRef.current = null;
    };
  }, [open, cameraOn, showManualInput, processScannedCode]);

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

      if (data.pickingListNo) {
        setPickingListNo(data.pickingListNo);
        setNumberType('picking');
      }

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
          requiresOrderNotes: !!selected?.requiresOrderNotes,
          orderNotesLabel: selected?.orderNotesLabel || DEFAULT_ORDER_NOTES_LABEL,
          orderNotesPlaceholder: selected?.orderNotesPlaceholder || '',
          orderNotesRequired: selected?.orderNotesRequired ?? true,
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

  // ============ NOTE PROMPT (Req. Color auto-popup) ============

  useEffect(() => {
    if (notePromptItemId) {
      setTimeout(() => notePromptInputRef.current?.focus(), 50);
    }
  }, [notePromptItemId]);

  useEffect(() => {
    if (!notePromptItemId) return;
    const handleOutside = (e: MouseEvent) => {
      if (notePromptWrapRef.current && !notePromptWrapRef.current.contains(e.target as Node)) {
        setNotePromptItemId(null);
        setNotePromptValue('');
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [notePromptItemId]);

  const commitNotePrompt = () => {
    if (notePromptItemId) updateItemNote(notePromptItemId, notePromptValue.trim());
    setNotePromptItemId(null);
    setNotePromptValue('');
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const skipNotePrompt = () => {
    setNotePromptItemId(null);
    setNotePromptValue('');
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const handleNotePromptKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') commitNotePrompt();
    else if (e.key === 'Escape') skipNotePrompt();
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

    const isProductionTab = mode === 'order' && orderSubTab === 'production';

    if (!isProductionTab && !pickingListNo.trim()) {
      setLookupError('No. Picking List wajib diisi sebelum submit');
      return;
    }

    if (!isProductionTab) {
      const missingNotes = validItems.filter((i) => i.requiresOrderNotes && i.orderNotesRequired && !i.note.trim());
      if (missingNotes.length > 0) {
        setLookupError(
          missingNotes
            .map((i) => `${i.orderNotesLabel || DEFAULT_ORDER_NOTES_LABEL} wajib diisi untuk ${i.code || i.sku}`)
            .join('; ')
        );
        return;
      }
    }

    setSubmitting(true);

    try {
      if (!isProductionTab) {
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

        const createdOrder = await res.json();

        // Only SKUs still "belum ready" after this order's own deduction
        // get a print row, at the deficit qty — not the full order qty
        // (ims-feature-print-popup-input-pesanan.md §Filter). variant.qty
        // in the response is the stock AFTER this order's decrement, so
        // "how far negative it went" is exactly the deficit: that holds
        // even when the same variantId appears on more than one OrderItem
        // (e.g. Req. Color rows, which never stack), because the qty this
        // order consumed and the qty that cancels it out of the stock
        // snapshot are the same number either way.
        const finalQtyByVariant = new Map<string, number>();
        const codeByVariant = new Map<string, string>();
        for (const item of validItems) {
          if (!codeByVariant.has(item.variantId)) codeByVariant.set(item.variantId, item.code);
        }
        const infoByVariant = new Map<string, { sku: string; productName: string; color: string; type: string }>();
        for (const oi of (createdOrder.orderItems || [])) {
          finalQtyByVariant.set(oi.variantId, oi.variant.qty);
          if (!infoByVariant.has(oi.variantId)) {
            infoByVariant.set(oi.variantId, {
              sku: oi.variant.product.sku,
              productName: oi.variant.product.name,
              color: oi.variant.color,
              type: oi.variant.type,
            });
          }
        }
        const rows: OrderPrintRow[] = [];
        for (const [variantId, finalQty] of finalQtyByVariant) {
          const needed = Math.max(0, -finalQty);
          if (needed <= 0) continue;
          const info = infoByVariant.get(variantId);
          if (!info) continue;
          rows.push({ variantId, code: codeByVariant.get(variantId) || info.sku, qty: needed, ...info });
        }

        setItems([]);
        setLookupError('');
        setPickingListNo('');
        setOrderSubTab('picking');
        resetPdfUpload();
        onOrderCreated?.();
        onOpenChange(false);
        if (rows.length > 0) setPrintPopup({ orderNo, rows });
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
      setOrderSubTab('picking');
      setOrderSubMode('manual');
      setPickingListNo('');
      resetPdfUpload();
      setScanHistory([]);
      setTodayTotal(null);
      setNotePromptItemId(null);
      setNotePromptValue('');
      setCameraOn(false);
      setCameraError(null);
    }
    onOpenChange(val);
  };

  const validItemCount = items.filter((i) => i.variantId).length;
  const totalQty = items.reduce((sum, i) => (i.variantId ? sum + i.qty : sum), 0);

  return (
    <>
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
              <ScanBarcode className="w-5 h-5 text-[var(--brand)] flex-shrink-0" />
              <DialogTitle className="text-[var(--t-heading)] text-base max-md:text-sm truncate">
                {mode === 'receive' ? 'Terima Stok' : orderSubTab === 'production' ? 'Input Produksi' : 'Input Pesanan'}
              </DialogTitle>
            </div>
            <div className="flex items-center gap-1 bg-[var(--surface)] rounded-lg p-0.5 flex-shrink-0">
              <button
                onClick={() => setMode('order')}
                className={`flex items-center gap-1 px-2 py-1.5 rounded-md text-xs font-medium transition-all cursor-pointer ${
                  mode === 'order'
                    ? 'bg-[var(--card)] text-[var(--brand)] shadow-sm'
                    : 'text-[var(--t-body)] hover:text-[var(--t-heading)]'
                }`}
              >
                <ShoppingCart className="w-3.5 h-3.5" />
                <span className="max-md:hidden">Pesanan</span>
              </button>
              <button
                onClick={() => setMode('receive')}
                className={`flex items-center gap-1 px-2 py-1.5 rounded-md text-xs font-medium transition-all cursor-pointer ${
                  mode === 'receive'
                    ? 'bg-[var(--card)] text-[var(--success)] shadow-sm'
                    : 'text-[var(--t-body)] hover:text-[var(--t-heading)]'
                }`}
              >
                <PackageCheck className="w-3.5 h-3.5" />
                <span className="max-md:hidden">Terima Stok</span>
              </button>
            </div>
          </div>
          <DialogDescription className="text-[var(--t-body)] mt-1 text-xs">
            {mode === 'receive'
              ? 'Scan barcode produk yang sudah lolos QC — stok real nambah langsung tiap scan'
              : orderSubTab === 'production'
              ? 'Ketik atau scan barcode untuk input stok produksi'
              : 'Ketik atau scan barcode untuk input pesanan baru'}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex flex-col px-4 pb-4 max-md:px-3 max-md:pb-3">
          {/* Pesanan sub-tabs: Picking List | Produksi | Adjustment */}
          {mode === 'order' && (
            <div className="mt-3 flex-shrink-0 space-y-2">
              <div className="flex gap-1 bg-[var(--surface)] p-0.5 rounded-lg w-fit">
                <button
                  onClick={() => handleOrderSubTabChange('picking')}
                  className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                    orderSubTab === 'picking' ? 'bg-[var(--card)] text-[var(--t-heading)] shadow-sm' : 'text-[var(--t-muted)] hover:text-[var(--t-heading)]'
                  }`}
                >
                  Picking List
                </button>
                <button
                  onClick={() => handleOrderSubTabChange('production')}
                  className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                    orderSubTab === 'production' ? 'bg-[var(--card)] text-[var(--info)] shadow-sm' : 'text-[var(--t-muted)] hover:text-[var(--t-heading)]'
                  }`}
                >
                  <Factory className="w-3 h-3" />
                  Produksi
                </button>
                <button
                  onClick={() => handleOrderSubTabChange('adjustment')}
                  className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                    orderSubTab === 'adjustment' ? 'bg-[var(--card)] text-[var(--warning)] shadow-sm' : 'text-[var(--t-muted)] hover:text-[var(--t-heading)]'
                  }`}
                >
                  Adjustment
                </button>
              </div>

              {/* No. Picking List/Adjustment — not applicable to Produksi */}
              {orderSubTab !== 'production' && (
              <>
              <div>
                <label className="text-[11px] font-medium text-[var(--t-body)] flex items-center gap-1.5 mb-1">
                  <FileText className="w-3.5 h-3.5" />
                  No. {orderSubTab === 'adjustment' ? 'Adjustment' : 'Picking List'}
                  {fetchingNumber && <Loader2 className="w-3 h-3 animate-spin text-[var(--t-muted)]" />}
                </label>
                <Input
                  value={pickingListNo}
                  onChange={(e) => setPickingListNo(e.target.value)}
                  placeholder={orderSubTab === 'adjustment' ? 'e.g. ADJ016' : 'e.g. PICK-000775'}
                  disabled={orderSubMode === 'pdf' && pdfStage === 'review'}
                  className="h-9 text-sm bg-[var(--surface)] border-[var(--bd)] rounded-lg disabled:opacity-70"
                />
                <p className="text-[11px] text-[var(--t-muted)] mt-1">
                  Auto-terisi nomor berikutnya — bisa diedit manual kalau perlu
                </p>
                {orderSubMode === 'pdf' && pdfStage === 'review' && pickingListNo && (
                  <p className="text-[11px] text-[var(--success)] flex items-center gap-1 mt-1">
                    <CheckCircle2 className="w-3 h-3" /> Terdeteksi otomatis dari PDF — bisa diedit kalau salah baca
                  </p>
                )}
              </div>

              {/* Manual/PDF sub-mode toggle */}
              <div className="flex gap-1 bg-[var(--surface)] p-0.5 rounded-lg w-fit">
                <button
                  onClick={() => setOrderSubMode('manual')}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                    orderSubMode === 'manual' ? 'bg-[var(--card)] text-[var(--t-heading)] shadow-sm' : 'text-[var(--t-muted)] hover:text-[var(--t-heading)]'
                  }`}
                >
                  <ScanBarcode className="w-3.5 h-3.5" />
                  Manual / Scan
                </button>
                <button
                  onClick={() => setOrderSubMode('pdf')}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                    orderSubMode === 'pdf' ? 'bg-[var(--card)] text-[var(--t-heading)] shadow-sm' : 'text-[var(--t-muted)] hover:text-[var(--t-heading)]'
                  }`}
                >
                  <Upload className="w-3.5 h-3.5" />
                  Upload PDF
                </button>
              </div>
              </>
              )}
            </div>
          )}

          {/* Manual Input + Camera */}
          {showManualInput && (
            <div className="mt-3 flex-shrink-0 space-y-2">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--t-muted)]" />
                  <Input
                    ref={inputRef}
                    value={manualCode}
                    onChange={(e) => setManualCode(e.target.value)}
                    onKeyDown={handleManualKeyDown}
                    placeholder="Ketik barcode atau SKU..."
                    disabled={lookingUp}
                    autoFocus
                    className="pl-9 text-sm bg-[var(--surface)] border-[var(--bd)] rounded-lg h-11"
                  />
                </div>
                <Button
                  onClick={handleManualLookup}
                  disabled={lookingUp || !manualCode.trim()}
                  className="bg-[var(--brand)] hover:bg-[var(--brand-dark)] text-white h-11 px-5 rounded-lg flex-shrink-0 disabled:opacity-50"
                >
                  {lookingUp ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                </Button>
              </div>

              {!cameraOn ? (
                <Button
                  variant="outline"
                  onClick={() => setCameraOn(true)}
                  className="rounded-lg w-full h-11 text-sm gap-2 border-[var(--bd)]"
                >
                  <Camera className="w-4 h-4" /> Buka Kamera
                </Button>
              ) : (
                <div className="space-y-2">
                  <div className="relative rounded-lg overflow-hidden border border-[var(--bd)] bg-black aspect-square max-h-[260px]">
                    <video ref={videoRef} muted playsInline autoPlay className="w-full h-full object-cover" />
                  </div>
                  <Button
                    variant="outline"
                    onClick={() => setCameraOn(false)}
                    className="rounded-lg w-full h-10 text-sm gap-2 border-[var(--bd)]"
                  >
                    <CameraOff className="w-4 h-4" /> Tutup Kamera
                  </Button>
                </div>
              )}

              {cameraError && (
                <div className="p-2.5 rounded-lg text-xs bg-[var(--danger)]/10 text-[var(--danger)] border border-[var(--danger)]/30">
                  {cameraError}
                </div>
              )}
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
                  className="w-full border-2 border-dashed border-[var(--bd)] hover:border-[var(--brand)] rounded-xl py-8 flex flex-col items-center gap-2 text-[var(--t-muted)] hover:text-[var(--brand)] transition-colors cursor-pointer"
                >
                  <Upload className="w-6 h-6" />
                  <span className="text-sm font-medium">Klik untuk upload PDF Picking List</span>
                  <span className="text-[11px] text-[var(--t-subtle)]">Format .pdf dari Desty / omnichannel lainnya</span>
                </button>
              )}

              {pdfStage === 'uploading' && (
                <div className="w-full border border-[var(--bd)] rounded-xl py-8 flex flex-col items-center gap-2">
                  <Loader2 className="w-5 h-5 text-[var(--brand)] animate-spin" />
                  <span className="text-sm text-[var(--t-body)]">Membaca {pdfFileName}...</span>
                  <span className="text-[11px] text-[var(--t-subtle)]">Mencocokkan SKU ke database</span>
                </div>
              )}

              {pdfStage === 'review' && (
                <div className="flex items-center justify-between bg-[var(--surface)] rounded-lg px-3 py-2">
                  <span className="text-xs text-[var(--t-body)] flex items-center gap-1.5 truncate">
                    <FileText className="w-3.5 h-3.5 flex-shrink-0" /> {pdfFileName}
                  </span>
                  <button onClick={resetPdfUpload} className="text-[11px] text-[var(--brand)] font-medium hover:underline cursor-pointer flex-shrink-0">
                    Ganti file
                  </button>
                </div>
              )}

              {pdfError && (
                <div className="mt-2 p-2.5 rounded-lg bg-[var(--danger)]/5 border border-[var(--danger)]/20 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-[var(--danger)] flex-shrink-0 mt-0.5" />
                  <span className="text-xs text-[var(--danger)] flex-1">{pdfError}</span>
                  <button onClick={() => setPdfError('')} className="text-[var(--danger)]/60 hover:text-[var(--danger)] cursor-pointer flex-shrink-0">
                    <X className="w-3 h-3" />
                  </button>
                </div>
              )}

              {pdfStage === 'review' && items.length > 0 && (
                <div className="mt-2 flex items-center gap-3 text-[11px]">
                  <span className="flex items-center gap-1 text-[var(--success)] font-medium">
                    <CheckCircle2 className="w-3 h-3" /> {items.filter((i) => i.variantId).length} SKU cocok
                  </span>
                  {items.some((i) => !i.variantId) && (
                    <span className="flex items-center gap-1 text-[var(--warning)] font-medium">
                      <AlertTriangle className="w-3 h-3" /> {items.filter((i) => !i.variantId).length} perlu dicek manual
                    </span>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Lookup Error */}
          {lookupError && (
            <div className="mt-2 p-2.5 rounded-lg bg-[var(--danger)]/5 border border-[var(--danger)]/20 flex items-start gap-2 flex-shrink-0">
              <X className="w-4 h-4 text-[var(--danger)] flex-shrink-0 mt-0.5" />
              <span className="text-xs text-[var(--danger)] flex-1">{lookupError}</span>
              <button onClick={() => setLookupError('')} className="text-[var(--danger)]/60 hover:text-[var(--danger)] cursor-pointer flex-shrink-0">
                <X className="w-3 h-3" />
              </button>
            </div>
          )}

          {/* Req. Color auto-popup — Enter saves + refocuses scan box, Esc/klik luar skip */}
          {notePromptItemId && (
            <div
              ref={notePromptWrapRef}
              className="mt-2 p-2.5 rounded-lg bg-[var(--warning)]/5 border border-[var(--warning)]/30 flex-shrink-0"
            >
              <p className="text-[11px] text-[var(--warning-darker)] font-semibold mb-1.5">
                Req. Color — catat warna yang diminta
              </p>
              <div className="flex items-center gap-1.5">
                <input
                  ref={notePromptInputRef}
                  type="text"
                  value={notePromptValue}
                  onChange={(e) => setNotePromptValue(e.target.value)}
                  onKeyDown={handleNotePromptKeyDown}
                  placeholder="Warna yang diminta... (misal: Lilac Purple)"
                  className="flex-1 h-9 text-sm bg-[var(--card)] border border-[var(--warning)]/30 rounded-lg px-3 text-[var(--t-heading)] placeholder:text-[var(--t-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--warning)]/40"
                />
                <button
                  onClick={commitNotePrompt}
                  className="h-9 px-3 rounded-lg bg-[var(--warning)] hover:brightness-95 text-white text-xs font-semibold cursor-pointer flex-shrink-0"
                >
                  Simpan
                </button>
              </div>
            </div>
          )}

          {/* Scanned Items */}
          {mode !== 'receive' && items.length > 0 && (
            <div className="mt-3 flex-1 min-h-0 flex flex-col">
              <div className="flex items-center justify-between mb-2 flex-shrink-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-[var(--t-heading)]">
                    Item
                    <span className="text-[var(--t-muted)] ml-1">({validItemCount}/{items.length})</span>
                  </span>
                  {totalQty > 0 && (
                    <Badge className="bg-[var(--brand)]/10 text-[var(--brand)] border-[var(--brand)]/30 text-[11px] px-1.5 py-0 rounded-full font-semibold" variant="outline">
                      Total: {totalQty}
                    </Badge>
                  )}
                </div>
                <button
                  onClick={clearAll}
                  className="text-[11px] text-[var(--danger)] hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <Trash2 className="w-3 h-3" />
                  Hapus Semua
                </button>
              </div>

              <div className="flex-1 min-h-0 overflow-y-auto rounded-lg border border-[var(--bd)] -webkit-overflow-scrolling-touch">
                <div className="p-2 space-y-2">
                  {items.map((item) => (
                    <div
                      key={item.id}
                      className={`p-2.5 md:p-3 rounded-lg border transition-colors ${
                        item.variantId
                          ? 'border-[var(--bd)] bg-[var(--card)]'
                          : 'border-[var(--warning)]/30 bg-[var(--warning)]/5'
                      }`}
                    >
                      {/* Top row */}
                      <div className="flex items-start justify-between gap-2 mb-1.5">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[11px] md:text-xs font-semibold text-[var(--t-heading)] bg-[var(--surface-2)] px-1.5 py-0.5 rounded">
                              {item.sku}
                            </span>
                            {item.variantId && (
                              <CheckCircle2 className="w-3 h-3 text-[var(--success)] flex-shrink-0" />
                            )}
                            {!item.variantId && (
                              <span className="text-[11px] text-[var(--warning)] font-medium">Pilih warna</span>
                            )}
                          </div>
                          <p className="text-[11px] text-[var(--t-muted)] mt-0.5 truncate">{item.productName}</p>
                        </div>
                        <button
                          onClick={() => removeItem(item.id)}
                          className="p-1 rounded hover:bg-[var(--danger)]/10 text-[var(--t-muted)] hover:text-[var(--danger)] transition-colors cursor-pointer flex-shrink-0"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {/* Variant selector */}
                      {item.variantOptions && !item.variantId && (
                        <div className="mb-1.5">
                          <Select onValueChange={(val) => handleVariantSelect(item.id, val)}>
                            <SelectTrigger className="h-8 text-xs bg-[var(--card)] border-[var(--bd)] rounded-lg">
                              <SelectValue placeholder="Pilih warna..." />
                            </SelectTrigger>
                            <SelectContent>
                              {item.variantOptions.map((v) => (
                                <SelectItem key={v.id} value={v.id}>
                                  <div className="flex items-center gap-2">
                                    <span
                                      className="w-3 h-3 rounded-full border border-[var(--bd)] flex-shrink-0"
                                      style={{ backgroundColor: v.colorHex }}
                                    />
                                    <span>{v.color}</span>
                                    <span className="text-[11px] text-[var(--t-muted)]">(stock: {v.qty})</span>
                            {v.type && <span className="text-[11px] text-[var(--t-muted)] ml-1">{v.type}</span>}
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
                              className="w-5 h-5 rounded-full border border-[var(--bd)] shadow-sm flex-shrink-0"
                              style={{ backgroundColor: item.colorHex }}
                            />
                            <span className="text-xs text-[var(--t-body)]">{item.color}{item.type ? ` - ${item.type}` : ''}</span>
                          </div>

                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => updateItemQty(item.id, -1)}
                              className="w-7 h-7 rounded-md bg-[var(--surface)] hover:bg-[var(--bd)] flex items-center justify-center cursor-pointer transition-colors active:bg-[var(--bd-blue)]"
                            >
                              <Minus className="w-3 h-3 text-[var(--t-body)]" />
                            </button>
                            <input
                              type="number"
                              min={1}
                              value={item.qty}
                              onChange={(e) => setItemQty(item.id, parseInt(e.target.value) || 1)}
                              className="w-12 h-7 text-center text-xs font-semibold bg-[var(--surface)] border border-[var(--bd)] rounded-md focus:outline-none focus:ring-1 focus:ring-[var(--brand)]/30"
                            />
                            <button
                              onClick={() => updateItemQty(item.id, 1)}
                              className="w-7 h-7 rounded-md bg-[var(--surface)] hover:bg-[var(--bd)] flex items-center justify-center cursor-pointer transition-colors active:bg-[var(--bd-blue)]"
                            >
                              <Plus className="w-3 h-3 text-[var(--t-body)]" />
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Note input for Req. Color items */}
                      {item.variantId && isRequestColorVariant(item.color, item.type) && (
                        <div className="mt-1.5">
                          <input
                            type="text"
                            value={item.note}
                            onChange={(e) => updateItemNote(item.id, e.target.value)}
                            placeholder="Tulis warna yang diminta customer..."
                            className="w-full h-7 text-xs bg-[var(--warning)]/5 border border-[var(--warning)]/20 rounded-md px-2 text-[var(--warning-darker)] placeholder:text-[var(--warning)]/50 focus:outline-none focus:ring-1 focus:ring-[var(--warning)]/30"
                          />
                        </div>
                      )}

                      {/* Dynamic order-notes field — toggled per variant in the Produk form
                          (ims-feature-input-pesanan-catatan-dinamis.md), label/placeholder/
                          required-ness all come from that variant's own settings. */}
                      {item.variantId && item.requiresOrderNotes && (
                        <div className="mt-1.5">
                          <label className="text-[10px] font-semibold text-[var(--info)] flex items-center gap-1 mb-1">
                            {item.orderNotesLabel || DEFAULT_ORDER_NOTES_LABEL}
                            {item.orderNotesRequired && <span className="text-[var(--danger)]">*</span>}
                          </label>
                          <textarea
                            value={item.note}
                            onChange={(e) => updateItemNote(item.id, e.target.value)}
                            placeholder={item.orderNotesPlaceholder || ''}
                            rows={2}
                            className="w-full text-xs bg-[var(--info)]/5 border border-[var(--info)]/25 rounded-md px-2 py-1.5 text-[var(--t-heading)] placeholder:text-[var(--info)]/50 focus:outline-none focus:ring-1 focus:ring-[var(--info)]/30 resize-none"
                          />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Production: Printer selection */}
              {mode === 'order' && orderSubTab === 'production' && validItemCount > 0 && (
                <div className="mt-2 flex-shrink-0">
                  <Select value={selectedPrinter} onValueChange={setSelectedPrinter}>
                    <SelectTrigger className="h-9 text-xs bg-[var(--surface)] border-[var(--bd)] rounded-lg">
                      <SelectValue placeholder="Pilih printer (opsional)..." />
                    </SelectTrigger>
                    <SelectContent>
                      {printers
                        .filter((p) => p.status === 'Working')
                        .map((p) => (
                          <SelectItem key={p.id} value={p.name}>
                            <div className="flex items-center gap-2">
                              <span className="w-2 h-2 rounded-full bg-[var(--success)] flex-shrink-0" />
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
                  disabled={submitting || validItemCount === 0 || (orderSubTab !== 'production' && !pickingListNo.trim())}
                  className={`w-full h-11 rounded-lg font-semibold text-sm disabled:opacity-50 ${
                    orderSubTab !== 'production'
                      ? 'bg-[var(--brand)] hover:bg-[var(--brand-dark)] text-white'
                      : 'bg-[var(--info)] hover:bg-[var(--info-dark-alt)] text-white'
                  }`}
                >
                  {submitting ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : orderSubTab !== 'production' ? (
                    <ShoppingCart className="w-4 h-4 mr-2" />
                  ) : (
                    <Factory className="w-4 h-4 mr-2" />
                  )}
                  {submitting
                    ? 'Mengirim...'
                    : orderSubTab !== 'production'
                      ? `Submit Pesanan (${validItemCount} item, ${totalQty} qty)`
                      : `Submit Produksi (${validItemCount} item, ${totalQty} qty)`}
                </Button>
              </div>
            </div>
          )}

          {/* Empty state */}
          {mode !== 'receive' && items.length === 0 && !lookingUp && !(mode === 'order' && orderSubMode === 'pdf') && (
            <div className="mt-6 flex flex-col items-center justify-center py-8 md:py-12 text-center flex-shrink-0">
              <div className="w-16 h-16 rounded-full bg-[var(--surface)] flex items-center justify-center mb-3">
                <ScanBarcode className="w-7 h-7 text-[var(--t-muted)]" />
              </div>
              <p className="text-sm text-[var(--t-body)] font-medium">Belum ada item</p>
              <p className="text-xs text-[var(--t-muted)] mt-1">
                Ketik barcode/SKU di atas atau scan pakai alat barcode scanner
              </p>
            </div>
          )}

          {/* Terima Stok — tiap scan commit langsung, nggak ada batch submit */}
          {mode === 'receive' && (
            <div className="mt-3 flex-1 min-h-0 flex flex-col overflow-y-auto -webkit-overflow-scrolling-touch">
              {/* Running daily counter */}
              <div className="flex-shrink-0 flex items-center justify-between bg-[var(--success)]/5 border border-[var(--success)]/20 rounded-lg px-3 py-2 mb-3">
                <span className="text-xs text-[var(--t-body)] font-medium">Total Diterima Hari Ini</span>
                <span className="text-lg font-bold text-[var(--success)]">{todayTotal ?? 0}</span>
              </div>

              {/* Last scan confirmation card */}
              {scanHistory.length > 0 && (
                <div className="flex-shrink-0 mb-3 p-3 rounded-lg border border-[var(--success)]/30 bg-[var(--success)]/5">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <CheckCircle2 className="w-4 h-4 text-[var(--success)] flex-shrink-0" />
                    <span className="text-xs font-bold text-[var(--success)]">DISCAN — STOK NAMBAH</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className="w-4 h-4 rounded-full border border-[var(--bd)] flex-shrink-0"
                      style={{ backgroundColor: scanHistory[0].colorHex }}
                    />
                    <span className="text-sm font-semibold text-[var(--t-heading)] bg-[var(--surface-2)] px-1.5 py-0.5 rounded">
                      {scanHistory[0].sku}
                    </span>
                    <span className="text-sm text-[var(--t-body)] truncate">
                      {scanHistory[0].color}{scanHistory[0].type ? ` - ${scanHistory[0].type}` : ''}
                    </span>
                  </div>
                  {scanHistory[0].source === 'unlinked' && (
                    <p className="text-[11px] text-[var(--warning)] font-medium mt-1 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3 flex-shrink-0" />
                      Tanpa job produksi — tetap dicatat, dicek manual kalau sering kejadian
                    </p>
                  )}
                  <button
                    onClick={handleUndoLastScan}
                    disabled={undoingLast}
                    className="mt-2 w-full flex items-center justify-center gap-1.5 h-8 rounded-lg bg-[var(--card)] border border-[var(--bd)] text-xs font-medium text-[var(--t-body)] hover:text-[var(--danger)] hover:border-[var(--danger)]/30 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {undoingLast ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Undo2 className="w-3.5 h-3.5" />}
                    Undo Scan Terakhir
                  </button>
                </div>
              )}

              {/* Session rundown per SKU/warna */}
              {scanHistory.length > 0 ? (
                <div className="flex-1 min-h-0 overflow-y-auto rounded-lg border border-[var(--bd)]">
                  <div className="p-2 space-y-1">
                    {Array.from(
                      scanHistory.reduce((map, s) => {
                        const key = `${s.sku}|${s.color}|${s.type}`;
                        const cur = map.get(key);
                        if (cur) cur.count += 1;
                        else map.set(key, { sku: s.sku, color: s.color, colorHex: s.colorHex, type: s.type, count: 1 });
                        return map;
                      }, new Map<string, { sku: string; color: string; colorHex: string; type: string; count: number }>())
                        .values()
                    ).map((row) => (
                      <div key={`${row.sku}|${row.color}|${row.type}`} className="flex items-center justify-between px-2 py-1.5 rounded-md">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="w-2.5 h-2.5 rounded-full flex-shrink-0 border border-[var(--bd)]" style={{ backgroundColor: row.colorHex }} />
                          <span className="text-xs font-semibold text-[var(--t-heading)] bg-[var(--surface-2)] px-1.5 py-0.5 rounded flex-shrink-0">{row.sku}</span>
                          <span className="text-xs text-[var(--t-body)] truncate">{row.color}{row.type ? ` - ${row.type}` : ''}</span>
                        </div>
                        <span className="text-sm font-bold text-[var(--success)] flex-shrink-0">×{row.count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : !lookingUp && (
                <div className="flex-1 flex flex-col items-center justify-center py-8 md:py-12 text-center flex-shrink-0">
                  <div className="w-16 h-16 rounded-full bg-[var(--surface)] flex items-center justify-center mb-3">
                    <PackageCheck className="w-7 h-7 text-[var(--t-muted)]" />
                  </div>
                  <p className="text-sm text-[var(--t-body)] font-medium">Belum ada scan di sesi ini</p>
                  <p className="text-xs text-[var(--t-muted)] mt-1">
                    Ketik barcode/SKU di atas atau scan pakai alat barcode scanner
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>

    <OrderPrintPopup
      open={!!printPopup}
      onOpenChange={(v) => !v && setPrintPopup(null)}
      orderNo={printPopup?.orderNo ?? ''}
      rows={printPopup?.rows ?? []}
    />
    </>
  );
}
