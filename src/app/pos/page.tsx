'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import Link from 'next/link';
import { jsPDF } from 'jspdf';
import {
  Search,
  Plus,
  Minus,
  Trash2,
  X,
  ScanBarcode,
  Settings as SettingsIcon,
  ShoppingCart,
  AlertTriangle,
  Loader2,
  CheckCircle2,
  ArrowLeft,
  Printer,
  MessageCircle,
  History,
  Sparkles,
  SplitSquareHorizontal,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
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
import { lookupBarcode } from '@/components/dashboard/barcode-scanner';
import { DateRangePicker, type SimpleDateRange } from '@/components/dashboard/date-range-picker';
import { ThemeToggle } from '@/components/dashboard/theme-toggle';
import { format } from 'date-fns';
import {
  calculateBundlePrice,
  type FixedPackage,
  type BulkTier,
  type BundlePriceResult,
} from '@/lib/bundle-pricing';

// ============ TYPES ============

interface PosBundleCategory {
  id: string;
  code: string;
  name: string;
  normalPrice: number;
}

interface PosVariant {
  id: string;
  color: string;
  colorHex: string;
  type: string;
  qty: number;
  price: number | null;
}

interface PosProduct {
  id: string;
  sku: string;
  name: string;
  isBoothEnabled: boolean;
  bundleCategory: PosBundleCategory | null;
  variants: PosVariant[];
}

// Add-On eligible on this item (pos-preorder-addon-spec.md) — value is the
// customer's custom text for TEXT-type add-ons, empty for NONE-type ones.
interface CartAddOn {
  addOnId: string;
  code: string;
  name: string;
  value: string;
  price: number;
}

interface CartItem {
  // Unique per cart LINE, not per variant — a single variant can appear as
  // more than one line (e.g. 2x Medal Display where only one gets Engrave
  // or gets tagged PO) once the cashier splits them apart. variantId alone
  // used to be the key, which silently forced every unit of one variant to
  // share the same PO/add-on state.
  lineId: string;
  variantId: string;
  productId: string;
  sku: string;
  productName: string;
  color: string;
  colorHex: string;
  type: string;
  unitPrice: number;
  qty: number;
  stockQty: number;
  // Set when this item's Product belongs to a Bundle Category — priced by
  // the DP engine below, not unitPrice × qty (pos-pricing-promo-spec.md).
  categoryCode: string | null;
  categoryName: string | null;
  // PO tag per ITEM, not per transaction — default false (ready stock).
  isPreOrder: boolean;
  addOns: CartAddOn[];
}

interface BundleConfigData {
  categories: Array<{ id: string; code: string; name: string; normalPrice: number; bulkMinQty: number | null; bulkUnitPrice: number | null }>;
  packages: FixedPackage[];
  bulkTiers: BulkTier[];
}

interface PosAddOnConfig {
  id: string;
  code: string;
  name: string;
  price: number;
  inputType: 'NONE' | 'TEXT';
  maxLength: number | null;
  productIds: string[];
}

interface PosSettingsData {
  id: string;
  storeName: string;
  storeAddress: string;
  storePhone: string;
  receiptFooter: string;
  autoPrintReceipt: boolean;
  paperWidthMm: number;
  favoriteProductIds: string;
  discountPresets: string;
  cashPresets: string;
}

interface ReceiptOrderItemAddOn {
  id: string;
  value: string;
  priceSnapshot: number;
  addOn: { code: string; name: string };
}

interface ReceiptOrderItem {
  id: string;
  qty: number;
  unitPrice: number | null;
  isPreOrder: boolean;
  addOns: ReceiptOrderItemAddOn[];
  variant: { color: string; type: string; product: { sku: string; name: string; bundleCategoryId: string | null } };
}

interface ReceiptOrder {
  id: string;
  orderNo: string;
  createdAt: string;
  paymentMethod: string | null;
  discountAmount: number;
  subtotalAmount: number | null;
  totalAmount: number | null;
  cashReceived: number | null;
  bundlePricingSnapshot: string | null;
  customerName: string | null;
  customerPhone: string | null;
  notes: string | null;
  orderItems: ReceiptOrderItem[];
}

interface BundleSnapshot {
  lines: Array<{ code: string; name: string; packageCount: number; unitPrice: number; subtotal: number }>;
  normalTotal: number;
  savings: number;
}

function parseBundleSnapshot(order: ReceiptOrder): BundleSnapshot | null {
  if (!order.bundlePricingSnapshot) return null;
  try {
    return JSON.parse(order.bundlePricingSnapshot);
  } catch {
    return null;
  }
}

interface HistorySummary {
  totalOmzet: number;
  transactionCount: number;
  cashCount: number;
  cashTotal: number;
  qrisCount: number;
  qrisTotal: number;
}

// ============ HELPERS ============

let cartLineCounter = 0;
function newCartLineId(): string {
  cartLineCounter += 1;
  return `line-${Date.now()}-${cartLineCounter}`;
}

function formatRupiah(n: number): string {
  return `Rp ${n.toLocaleString('id-ID')}`;
}

function addOnLinesFor(item: ReceiptOrderItem): string[] {
  return item.addOns.map((a) => {
    const label = a.value ? `${a.addOn.name} "${a.value}"` : a.addOn.name;
    return `  + ${label}${' '.repeat(Math.max(1, 20 - label.length))}${formatRupiah(a.priceSnapshot)}`;
  });
}

function buildReceiptLines(order: ReceiptOrder, settings: PosSettingsData | null): string[] {
  const bundle = parseBundleSnapshot(order);
  const bundleItems = order.orderItems.filter((i) => i.variant.product.bundleCategoryId != null);
  const plainItems = order.orderItems.filter((i) => i.variant.product.bundleCategoryId == null);
  const poItems = order.orderItems.filter((i) => i.isPreOrder);
  const hasPreOrder = poItems.length > 0;

  const lines: string[] = [];
  lines.push(settings?.storeName || 'Solutive');
  if (settings?.storeAddress) lines.push(settings.storeAddress);
  if (settings?.storePhone) lines.push(settings.storePhone);
  lines.push(new Date(order.createdAt).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }));
  lines.push(order.orderNo);
  lines.push('--------------------------------');

  // Bundle package lines first (pos-pricing-promo-spec.md bagian 5) — these
  // are what the customer actually paid for, not the raw per-SKU items.
  // Add-ons on a bundled item print under "Rincian item" below instead,
  // since that's the only place that item gets its own line.
  if (bundle) {
    for (const line of bundle.lines) {
      lines.push(line.name);
      lines.push(`  ${line.packageCount} x ${formatRupiah(line.unitPrice)} = ${formatRupiah(line.subtotal)}`);
    }
  }
  // Items outside any bundle category still show normal per-line math,
  // plus a "[PO]" tag and any add-on sub-lines (pos-preorder-addon-spec.md).
  for (const item of plainItems) {
    const label = getVariantLabel(item.variant.color, item.variant.type);
    const unitPrice = item.unitPrice || 0;
    const tag = item.isPreOrder ? '   [PO]' : '';
    lines.push(`${item.variant.product.sku}${label ? ' - ' + label : ''}`);
    lines.push(`  ${item.qty} x ${formatRupiah(unitPrice)} = ${formatRupiah(unitPrice * item.qty)}${tag}`);
    lines.push(...addOnLinesFor(item));
  }

  lines.push('--------------------------------');
  lines.push(`Subtotal: ${formatRupiah(order.subtotalAmount || 0)}`);
  if (bundle) {
    const normalSubtotal = bundle.normalTotal + plainItems.reduce((s, i) => s + (i.unitPrice || 0) * i.qty, 0);
    lines.push(`Harga normal: ${formatRupiah(normalSubtotal)}`);
    if (bundle.savings > 0) lines.push(`Kamu hemat: ${formatRupiah(bundle.savings)}`);
  }
  if (order.discountAmount > 0) lines.push(`Diskon: -${formatRupiah(order.discountAmount)}`);
  lines.push(`TOTAL: ${formatRupiah(order.totalAmount || 0)}`);
  lines.push(`Bayar: ${order.paymentMethod || '-'}`);
  if (order.paymentMethod === 'Cash' && order.cashReceived != null) {
    lines.push(`Tunai: ${formatRupiah(order.cashReceived)}`);
    lines.push(`Kembali: ${formatRupiah(order.cashReceived - (order.totalAmount || 0))}`);
  }

  // Physical rincian — stock/reference only, no price math for the item
  // itself (already paid for as part of the package lines above) — but
  // add-on sub-lines and the [PO] tag still need to show here since this
  // is the only per-item line a bundled item gets.
  if (bundle && bundleItems.length > 0) {
    lines.push('--------------------------------');
    lines.push('Rincian item:');
    for (const item of bundleItems) {
      const label = getVariantLabel(item.variant.color, item.variant.type);
      const tag = item.isPreOrder ? ' [PO]' : '';
      lines.push(`- ${item.variant.product.sku}${label ? ' ' + label : ''} x${item.qty}${tag}`);
      lines.push(...addOnLinesFor(item));
    }
  }

  // PO summary — only printed when the transaction actually has PO items.
  // hasPreOrder is derived here, never stored.
  if (hasPreOrder) {
    lines.push('--------------------------------');
    lines.push('Item PO (butuh produksi):');
    for (const item of poItems) {
      const label = getVariantLabel(item.variant.color, item.variant.type);
      lines.push(`- ${item.variant.product.sku}${label ? ' ' + label : ''} x${item.qty}`);
    }
  }

  // Data pembeli & catatan — selalu dicetak kalau diisi, independen dari
  // status PO (revisi dari spec awal yang nge-gate ini di belakang PO).
  const hasCustomerInfo = !!(order.customerName?.trim() || order.customerPhone?.trim());
  const hasNotes = !!order.notes?.trim();
  if (hasCustomerInfo || hasNotes) {
    lines.push('--------------------------------');
    if (hasCustomerInfo) {
      lines.push('Data Pembeli:');
      if (order.customerName?.trim()) lines.push(`- Nama : ${order.customerName.trim()}`);
      if (order.customerPhone?.trim()) lines.push(`- WA   : ${order.customerPhone.trim()}`);
    }
    if (hasNotes) {
      if (hasCustomerInfo) lines.push('');
      lines.push('Catatan:');
      lines.push(order.notes!.trim());
    }
  }

  const footer = settings?.receiptFooter ?? 'Terima kasih!';
  if (footer.trim()) {
    lines.push('');
    lines.push(...footer.split('\n'));
  }
  return lines;
}

function printReceipt(order: ReceiptOrder, settings: PosSettingsData | null) {
  const width = settings?.paperWidthMm === 80 ? 80 : 58;
  const lines = buildReceiptLines(order, settings);
  const escaped = lines.map((l) => l.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')).join('\n');
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${order.orderNo}</title>
<style>
  @page { size: ${width}mm auto; margin: 0; }
  body { width: ${width}mm; margin: 0; padding: 4mm; font-family: 'Courier New', monospace; font-size: ${width === 58 ? '10px' : '11px'}; color: #000; }
  pre { white-space: pre-wrap; word-break: break-word; margin: 0; }
</style></head><body><pre>${escaped}</pre></body></html>`;

  const win = window.open('', '_blank', 'width=400,height=600');
  if (!win) {
    toast.error('Popup diblokir browser — izinkan popup untuk print struk');
    return;
  }
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 250);
}

function normalizePhone(input: string): string | null {
  const digits = input.replace(/\D/g, '');
  if (!digits) return null;
  if (digits.startsWith('62')) return digits;
  if (digits.startsWith('0')) return `62${digits.slice(1)}`;
  return `62${digits}`;
}

// Struk sebagai PDF kecil (lebar ngikut setting kertas thermal) — dipakai
// buat share via WA dan buat download manual di Riwayat.
function buildReceiptPdfBlob(order: ReceiptOrder, settings: PosSettingsData | null): Blob {
  const widthMm = settings?.paperWidthMm === 80 ? 80 : 58;
  const lines = buildReceiptLines(order, settings);
  const fontSize = 8;
  const lineHeightMm = 4;
  const marginMm = 4;
  const heightMm = marginMm * 2 + lines.length * lineHeightMm;
  const doc = new jsPDF({ unit: 'mm', format: [widthMm, heightMm] });
  doc.setFont('courier', 'normal');
  doc.setFontSize(fontSize);
  let y = marginMm;
  for (const line of lines) {
    doc.text(line, marginMm, y);
    y += lineHeightMm;
  }
  return doc.output('blob');
}

// Kirim struk sebagai PDF via WhatsApp. Kalau browser/OS-nya dukung Web
// Share API dengan file (sebagian besar browser desktop modern + semua
// mobile), ini langsung buka share sheet dengan PDF ter-attach — kasir
// tinggal pilih WhatsApp & kontaknya. Kalau nggak didukung, nggak ada cara
// resmi (tanpa WhatsApp Business API) buat nge-attach file otomatis ke
// nomor tertentu lewat link wa.me biasa — jadi PDF-nya didownload dan
// WhatsApp dibuka dengan teks siap kirim, kasir lampirkan manual.
async function sendReceiptPdfWhatsApp(order: ReceiptOrder, settings: PosSettingsData | null, phone: string) {
  const normalized = normalizePhone(phone);
  if (!normalized) {
    toast.error('Nomor WhatsApp tidak valid');
    return;
  }
  const blob = buildReceiptPdfBlob(order, settings);
  const fileName = `Struk-${order.orderNo}.pdf`;
  const text = `Struk ${order.orderNo} — ${settings?.storeName || 'Solutive'}`;

  try {
    const file = new File([blob], fileName, { type: 'application/pdf' });
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], text });
      return;
    }
  } catch {
    // Dibatalkan kasir atau share gagal — lanjut ke fallback manual di bawah.
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  toast.message('PDF struk didownload — lampirkan manual di chat WhatsApp yang baru dibuka');
  window.open(`https://wa.me/${normalized}?text=${encodeURIComponent(text)}`, '_blank');
}

function parsePresetList(json: string): number[] {
  try {
    const arr = JSON.parse(json);
    return Array.isArray(arr) ? arr.filter((n) => typeof n === 'number') : [];
  } catch {
    return [];
  }
}

async function fetchProductsList(params: string): Promise<PosProduct[]> {
  const res = await fetch(`/api/products?${params}`);
  if (!res.ok) return [];
  const data = await res.json();
  return (data.products || []).map((p: { id: string; sku: string; name: string; isBoothEnabled?: boolean; bundleCategory?: PosBundleCategory | null; variants?: PosVariant[] }) => ({
    id: p.id,
    sku: p.sku,
    name: p.name,
    isBoothEnabled: p.isBoothEnabled ?? false,
    bundleCategory: p.bundleCategory ?? null,
    variants: p.variants || [],
  }));
}

// A product's displayed price on the grid card. Bundle-category products
// (pos-pricing-promo-spec.md) are priced per-category, not per-variant — one
// flat normalPrice applies to every color/type. Non-bundle products can
// still have each variant priced independently (variant-matrix-spec.md), so
// a range/"mulai dari" shows when they differ.
function priceRangeOf(product: PosProduct): { min: number; max: number } | null {
  if (product.bundleCategory) {
    return { min: product.bundleCategory.normalPrice, max: product.bundleCategory.normalPrice };
  }
  const prices = product.variants.map((v) => v.price).filter((p): p is number => p != null);
  if (prices.length === 0) return null;
  return { min: Math.min(...prices), max: Math.max(...prices) };
}

// ============ MAIN COMPONENT ============

export default function PosPage() {
  const [activeTab, setActiveTab] = useState<'kasir' | 'riwayat'>('kasir');

  const [products, setProducts] = useState<PosProduct[]>([]);
  const [bundleConfig, setBundleConfig] = useState<BundleConfigData | null>(null);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [search, setSearch] = useState('');
  const [barcodeInput, setBarcodeInput] = useState('');
  const [scanning, setScanning] = useState(false);
  const barcodeRef = useRef<HTMLInputElement>(null);

  const [cart, setCart] = useState<CartItem[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<'Cash' | 'QRIS' | null>(null);
  const [cashReceived, setCashReceived] = useState('');
  const [checkingOut, setCheckingOut] = useState(false);

  // PO & Add-On (pos-preorder-addon-spec.md)
  const [addOnConfig, setAddOnConfig] = useState<PosAddOnConfig[]>([]);
  const [addOnDialogTarget, setAddOnDialogTarget] = useState<{ lineId: string; addOn: PosAddOnConfig } | null>(null);
  const [addOnValueInput, setAddOnValueInput] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [orderNotes, setOrderNotes] = useState('');

  const [successData, setSuccessData] = useState<ReceiptOrder | null>(null);
  const [waPhone, setWaPhone] = useState('');
  const [sendingWa, setSendingWa] = useState(false);
  const [recentTransactions, setRecentTransactions] = useState<ReceiptOrder[]>([]);

  const [variantPickerProduct, setVariantPickerProduct] = useState<PosProduct | null>(null);

  const [settings, setSettings] = useState<PosSettingsData | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [editStoreName, setEditStoreName] = useState('');
  const [editStoreAddress, setEditStoreAddress] = useState('');
  const [editStorePhone, setEditStorePhone] = useState('');
  const [editReceiptFooter, setEditReceiptFooter] = useState('');
  const [editPaperWidth, setEditPaperWidth] = useState<58 | 80>(58);
  const [editCashPresets, setEditCashPresets] = useState('');
  const [savingSettings, setSavingSettings] = useState(false);

  const [historyOrders, setHistoryOrders] = useState<ReceiptOrder[]>([]);
  const [historySummary, setHistorySummary] = useState<HistorySummary | null>(null);
  const [historyDateRange, setHistoryDateRange] = useState<SimpleDateRange>(null);
  const [historySearch, setHistorySearch] = useState('');
  const [historyPoOnly, setHistoryPoOnly] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [detailOrder, setDetailOrder] = useState<ReceiptOrder | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ReceiptOrder | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [waSendTarget, setWaSendTarget] = useState<ReceiptOrder | null>(null);
  const [waSendPhone, setWaSendPhone] = useState('');
  const [sendingWaHistory, setSendingWaHistory] = useState(false);

  const fetchHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const params = new URLSearchParams();
      if (historyDateRange) {
        params.set('from', format(historyDateRange.from, 'yyyy-MM-dd'));
        params.set('to', format(historyDateRange.to, 'yyyy-MM-dd'));
      }
      const res = await fetch(`/api/pos/history?${params}`);
      if (res.ok) {
        const data = await res.json();
        setHistoryOrders(data.orders || []);
        setHistorySummary(data.summary || null);
      }
    } finally {
      setLoadingHistory(false);
    }
  }, [historyDateRange]);

  useEffect(() => {
    if (activeTab === 'riwayat') fetchHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, historyDateRange]);

  const filteredHistoryOrders = useMemo(() => {
    const q = historySearch.trim().toUpperCase();
    let list = historyOrders;
    if (q) list = list.filter((o) => o.orderNo.toUpperCase().includes(q));
    if (historyPoOnly) list = list.filter((o) => o.orderItems.some((i) => i.isPreOrder));
    return list;
  }, [historyOrders, historySearch, historyPoOnly]);

  const fetchProducts = useCallback(async () => {
    setLoadingProducts(true);
    try {
      const list = await fetchProductsList('mastersOnly=true&boothOnly=true&limit=500');
      setProducts(list);
    } finally {
      setLoadingProducts(false);
    }
  }, []);

  const fetchSettings = useCallback(async () => {
    const res = await fetch('/api/pos/settings');
    if (res.ok) setSettings(await res.json());
  }, []);

  const fetchRecentTransactions = useCallback(async () => {
    const res = await fetch('/api/orders?prefix=POS&limit=3');
    if (res.ok) {
      const data = await res.json();
      setRecentTransactions(data.orders || []);
    }
  }, []);

  const fetchBundleConfig = useCallback(async () => {
    const res = await fetch('/api/bundle/config');
    if (res.ok) setBundleConfig(await res.json());
  }, []);

  const fetchAddOnConfig = useCallback(async () => {
    const res = await fetch('/api/addons/config');
    if (res.ok) setAddOnConfig((await res.json()).addOns || []);
  }, []);

  useEffect(() => {
    fetchProducts();
    fetchSettings();
    fetchRecentTransactions();
    fetchAddOnConfig();
    fetchBundleConfig();
  }, [fetchProducts, fetchSettings, fetchRecentTransactions, fetchBundleConfig, fetchAddOnConfig]);

  useEffect(() => {
    barcodeRef.current?.focus();
  }, []);

  const cashPresets = useMemo(() => (settings ? parsePresetList(settings.cashPresets) : []), [settings]);

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products;
    return products.filter((p) => p.sku.toLowerCase().includes(q) || p.name.toLowerCase().includes(q));
  }, [products, search]);

  // Bundle-category items (pos-pricing-promo-spec.md) are grouped by
  // category code and priced by the DP engine, recalculated live on every
  // cart change — a client-side preview only; the server independently
  // recomputes and validates this at checkout.
  const qtyByCategory = useMemo(() => {
    const map: Record<string, number> = {};
    for (const item of cart) {
      if (item.categoryCode) map[item.categoryCode] = (map[item.categoryCode] ?? 0) + item.qty;
    }
    return map;
  }, [cart]);

  const normalPriceByCategory = useMemo(() => {
    const map: Record<string, number> = {};
    for (const c of bundleConfig?.categories ?? []) map[c.code] = c.normalPrice;
    return map;
  }, [bundleConfig]);

  const bundleCalc: BundlePriceResult | null = useMemo(() => {
    if (!bundleConfig || Object.keys(qtyByCategory).length === 0) return null;
    return calculateBundlePrice(qtyByCategory, bundleConfig.packages, bundleConfig.bulkTiers, normalPriceByCategory);
  }, [bundleConfig, qtyByCategory, normalPriceByCategory]);

  // Per-item "harga normal vs setelah diskon" for bundle-category cart rows
  // — a package's price doesn't belong to 1 SKU, so this allocates
  // bundleCalc.total back to each line pro-rata by its normal-price share,
  // same formula as the server-side revenue allocation at checkout
  // (pos-pricing-promo-spec.md bagian 6), just recomputed live for display.
  // Rounding remainder lands on the last bundle line so the lines' "setelah
  // diskon" values always sum to exactly bundleCalc.total.
  const cartBundleAllocation = useMemo(() => {
    const map = new Map<string, { normal: number; afterDiscount: number }>();
    if (!bundleCalc || bundleCalc.normalTotal <= 0) return map;
    const bundleItems = cart.filter((i) => i.categoryCode);
    let allocatedSum = 0;
    const raws: Array<{ lineId: string; normal: number; raw: number }> = [];
    for (const item of bundleItems) {
      const normal = item.unitPrice * item.qty;
      const raw = Math.round(bundleCalc.total * (normal / bundleCalc.normalTotal));
      raws.push({ lineId: item.lineId, normal, raw });
      allocatedSum += raw;
    }
    if (raws.length > 0) raws[raws.length - 1].raw += bundleCalc.total - allocatedSum;
    for (const r of raws) map.set(r.lineId, { normal: r.normal, afterDiscount: r.raw });
    return map;
  }, [cart, bundleCalc]);

  const plainSubtotal = useMemo(
    () => cart.reduce((sum, item) => sum + (item.categoryCode ? 0 : item.unitPrice * item.qty), 0),
    [cart]
  );
  // Add-ons are additive, flat per cart line (not × qty — see addToCart /
  // checkout), always outside the bundle DP (pos-preorder-addon-spec.md).
  const addOnTotal = useMemo(
    () => cart.reduce((sum, item) => sum + item.addOns.reduce((s, a) => s + a.price, 0), 0),
    [cart]
  );
  // "Subtotal" shown to the kasir is the reference total as if no bundle
  // discount applied — bundleCalc.savings is broken out as its own line, so
  // every cart row's displayed price × qty still sums to this number.
  const subtotal = plainSubtotal + (bundleCalc?.normalTotal ?? 0) + addOnTotal;
  const bundleSavings = bundleCalc?.savings ?? 0;
  const total = plainSubtotal + (bundleCalc?.total ?? 0) + addOnTotal;
  const cashReceivedNum = cashReceived.trim() ? parseInt(cashReceived, 10) : null;
  const change = paymentMethod === 'Cash' && cashReceivedNum != null ? cashReceivedNum - total : null;
  const canCheckout = cart.length > 0 && paymentMethod !== null && !checkingOut;

  const eligibleAddOnsFor = useCallback(
    (productId: string) => addOnConfig.filter((a) => a.productIds.includes(productId)),
    [addOnConfig]
  );

  // ============ CART ============

  const addToCart = useCallback((product: PosProduct, variant: PosVariant) => {
    const category = product.bundleCategory;
    if (!category && variant.price == null) {
      toast.error(`${product.sku} — ${getVariantLabel(variant.color, variant.type)} belum punya harga jual — isi dulu di Stock Management`);
      return;
    }
    setCart((prev) => {
      // Only merge into a line that's still "plain" (no PO tag, no add-on)
      // — once a line has been customized, a fresh add creates its own new
      // line instead, so customizing one unit never silently drags along
      // whatever other units of the same variant are already in the cart.
      const mergeable = prev.find((i) => i.variantId === variant.id && !i.isPreOrder && i.addOns.length === 0);
      if (mergeable) {
        return prev.map((i) => (i.lineId === mergeable.lineId ? { ...i, qty: i.qty + 1 } : i));
      }
      return [
        ...prev,
        {
          lineId: newCartLineId(),
          variantId: variant.id,
          productId: product.id,
          sku: product.sku,
          productName: product.name,
          color: variant.color,
          colorHex: variant.colorHex,
          type: variant.type,
          unitPrice: category ? category.normalPrice : variant.price!,
          qty: 1,
          stockQty: variant.qty,
          categoryCode: category?.code ?? null,
          categoryName: category?.name ?? null,
          isPreOrder: false,
          addOns: [],
        },
      ];
    });
  }, []);

  const handleProductClick = (product: PosProduct) => {
    if (!product.variants || product.variants.length === 0) {
      toast.error(`${product.sku} belum punya varian`);
      return;
    }
    // Bundle-category products always have a price (BundleCategory.normalPrice
    // is required), so only plain products can be missing one.
    if (!product.bundleCategory && product.variants.every((v) => v.price == null)) {
      toast.error(`${product.sku} belum punya harga jual — isi dulu di Stock Management`);
      return;
    }
    if (product.variants.length === 1) {
      addToCart(product, product.variants[0]);
      return;
    }
    setVariantPickerProduct(product);
  };

  const updateCartQty = (lineId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((i) => (i.lineId === lineId ? { ...i, qty: i.qty + delta } : i))
        .filter((i) => i.qty > 0)
    );
  };

  const removeCartItem = (lineId: string) => {
    setCart((prev) => prev.filter((i) => i.lineId !== lineId));
  };

  // Peels 1 unit off a merged line into its own independent line — the way
  // to get "2x Medal Display, cuma 1 yang di-Engrave / ditag PO" without
  // the toggle applying to the whole qty. The split-off unit always starts
  // plain (no PO, no add-on); the original line keeps whatever it already had.
  const splitCartLine = (lineId: string) => {
    setCart((prev) => {
      const idx = prev.findIndex((i) => i.lineId === lineId);
      if (idx === -1 || prev[idx].qty <= 1) return prev;
      const original = prev[idx];
      const next = [...prev];
      next[idx] = { ...original, qty: original.qty - 1 };
      next.splice(idx + 1, 0, { ...original, lineId: newCartLineId(), qty: 1, isPreOrder: false, addOns: [] });
      return next;
    });
  };

  const togglePreOrder = (lineId: string) => {
    setCart((prev) => prev.map((i) => (i.lineId === lineId ? { ...i, isPreOrder: !i.isPreOrder } : i)));
  };

  // NONE-type add-ons (no text input) attach immediately on click. TEXT-type
  // ones (Engrave) open a small dialog first — see addOnDialogTarget below.
  const addAddOnDirect = (lineId: string, addOn: PosAddOnConfig) => {
    setCart((prev) =>
      prev.map((i) =>
        i.lineId === lineId && !i.addOns.some((a) => a.addOnId === addOn.id)
          ? { ...i, addOns: [...i.addOns, { addOnId: addOn.id, code: addOn.code, name: addOn.name, value: '', price: addOn.price }] }
          : i
      )
    );
  };

  const openAddOnDialog = (lineId: string, addOn: PosAddOnConfig) => {
    if (addOn.inputType === 'NONE') {
      addAddOnDirect(lineId, addOn);
      return;
    }
    setAddOnValueInput('');
    setAddOnDialogTarget({ lineId, addOn });
  };

  const confirmAddOnDialog = () => {
    if (!addOnDialogTarget) return;
    const value = addOnValueInput.trim();
    if (!value) {
      toast.error('Isi teksnya dulu');
      return;
    }
    if (addOnDialogTarget.addOn.maxLength != null && value.length > addOnDialogTarget.addOn.maxLength) {
      toast.error(`Maksimal ${addOnDialogTarget.addOn.maxLength} karakter`);
      return;
    }
    const { lineId, addOn } = addOnDialogTarget;
    setCart((prev) =>
      prev.map((i) =>
        i.lineId === lineId
          ? {
              ...i,
              addOns: [
                ...i.addOns.filter((a) => a.addOnId !== addOn.id),
                { addOnId: addOn.id, code: addOn.code, name: addOn.name, value, price: addOn.price },
              ],
            }
          : i
      )
    );
    setAddOnDialogTarget(null);
  };

  const removeAddOn = (lineId: string, addOnId: string) => {
    setCart((prev) =>
      prev.map((i) => (i.lineId === lineId ? { ...i, addOns: i.addOns.filter((a) => a.addOnId !== addOnId) } : i))
    );
  };

  const clearCart = useCallback(() => {
    if (cart.length === 0 && !paymentMethod) return;
    setCart([]);
    setPaymentMethod(null);
    setCashReceived('');
    setCustomerName('');
    setCustomerPhone('');
    setOrderNotes('');
    toast.message('Keranjang dikosongkan');
  }, [cart.length, paymentMethod]);

  // ============ BARCODE SCAN ============

  const handleBarcodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = barcodeInput.trim();
    if (!code) return;
    setScanning(true);
    try {
      const result = await lookupBarcode(code);
      if (!result) {
        toast.error(`"${code}" tidak ditemukan`);
        return;
      }
      // Resolve fresh (authoritative price + live stock) via the products list
      const matches = await fetchProductsList(`search=${encodeURIComponent(result.sku)}&limit=5&mastersOnly=false`);
      const product = matches.find((p) => p.sku.toUpperCase() === result.sku.toUpperCase());
      if (!product) {
        toast.error(`Produk "${result.sku}" tidak ditemukan`);
        return;
      }
      if (!product.isBoothEnabled) {
        toast.error(`${product.sku} belum aktif di roster Booth Stock`);
        return;
      }

      if (result.lookupType === 'variant' && result.variantId) {
        const variant = product.variants.find((v) => v.id === result.variantId);
        if (!variant) {
          toast.error('Varian tidak ditemukan');
          return;
        }
        addToCart(product, variant);
        toast.success(`${product.sku} — ${getVariantLabel(variant.color, variant.type)} ditambahkan`);
      } else if (product.variants.length === 1) {
        addToCart(product, product.variants[0]);
        toast.success(`${product.sku} ditambahkan`);
      } else {
        setVariantPickerProduct(product);
      }
    } finally {
      setScanning(false);
      setBarcodeInput('');
      barcodeRef.current?.focus();
    }
  };

  // ============ CHECKOUT ============

  const handleCheckout = async () => {
    if (!canCheckout || !paymentMethod) return;
    setCheckingOut(true);
    try {
      const res = await fetch('/api/pos/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: cart.map((i) => ({
            variantId: i.variantId,
            qty: i.qty,
            isPreOrder: i.isPreOrder,
            addOns: i.addOns.map((a) => ({ addOnId: a.addOnId, value: a.value })),
          })),
          paymentMethod,
          cashReceived: cashReceivedNum ?? undefined,
          customerName: customerName.trim() || undefined,
          customerPhone: customerPhone.trim() || undefined,
          notes: orderNotes.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal memproses transaksi');

      setSuccessData(data.order);
      setWaPhone(data.order.customerPhone || '');
      setCart([]);
      setPaymentMethod(null);
      setCashReceived('');
      setCustomerName('');
      setCustomerPhone('');
      setOrderNotes('');
      fetchProducts();
      fetchRecentTransactions();
      // Struk sekarang dikirim via WA dari Success dialog, bukan auto-print.
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal memproses transaksi');
    } finally {
      setCheckingOut(false);
    }
  };

  // ============ DELETE TRANSACTION ============

  const handleDeleteTransaction = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/orders/${deleteTarget.id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Gagal menghapus transaksi');
      toast.success(`${deleteTarget.orderNo} dihapus, stok dikembalikan`);
      setDeleteTarget(null);
      setDetailOrder(null);
      fetchHistory();
      fetchRecentTransactions();
      fetchProducts();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal menghapus transaksi');
    } finally {
      setDeleting(false);
    }
  };

  // ============ KIRIM WA (RIWAYAT / QUICK REPRINT / DETAIL) ============

  const openWaSendDialog = (order: ReceiptOrder) => {
    setWaSendPhone(order.customerPhone || '');
    setWaSendTarget(order);
  };

  const confirmWaSend = async () => {
    if (!waSendTarget || !waSendPhone.trim()) return;
    setSendingWaHistory(true);
    try {
      await sendReceiptPdfWhatsApp(waSendTarget, settings, waSendPhone);
      setWaSendTarget(null);
    } finally {
      setSendingWaHistory(false);
    }
  };

  // ============ KEYBOARD SHORTCUTS ============

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      const isTyping = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA';
      if (e.key === 'Escape') {
        e.preventDefault();
        clearCart();
      } else if (e.key === 'Enter' && !isTyping && canCheckout) {
        e.preventDefault();
        handleCheckout();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canCheckout, cart, paymentMethod, cashReceived]);

  // ============ SETTINGS DIALOG ============

  const openSettings = () => {
    if (!settings) return;
    setEditStoreName(settings.storeName);
    setEditStoreAddress(settings.storeAddress || '');
    setEditStorePhone(settings.storePhone || '');
    setEditReceiptFooter(settings.receiptFooter ?? 'Terima kasih!');
    setEditPaperWidth(settings.paperWidthMm === 80 ? 80 : 58);
    setEditCashPresets(parsePresetList(settings.cashPresets).join(', '));
    setSettingsOpen(true);
  };

  const saveSettings = async () => {
    setSavingSettings(true);
    try {
      const cashList = editCashPresets
        .split(',')
        .map((s) => parseInt(s.trim(), 10))
        .filter((n) => !isNaN(n) && n > 0);

      const res = await fetch('/api/pos/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeName: editStoreName,
          storeAddress: editStoreAddress,
          storePhone: editStorePhone,
          receiptFooter: editReceiptFooter,
          paperWidthMm: editPaperWidth,
          cashPresets: cashList,
        }),
      });
      if (!res.ok) throw new Error('Gagal menyimpan pengaturan');
      toast.success('Pengaturan kasir disimpan');
      setSettingsOpen(false);
      fetchSettings();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal menyimpan pengaturan');
    } finally {
      setSavingSettings(false);
    }
  };

  // ============ RENDER ============

  return (
    <div className="min-h-screen bg-[var(--surface)] flex flex-col">
      {/* Top bar */}
      <div className="bg-[var(--card)] border-b border-[var(--bd)] px-5 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/" className="text-[var(--t-muted)] hover:text-[var(--t-heading)] transition-colors" title="Kembali ke Dashboard">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <h1 className="text-lg font-bold text-[var(--t-heading)]">{settings?.storeName || 'Solutive'} — Kasir</h1>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 bg-[var(--surface)] p-0.5 rounded-full">
            <button
              onClick={() => setActiveTab('kasir')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors cursor-pointer ${
                activeTab === 'kasir' ? 'bg-[var(--card)] text-[var(--t-heading)] shadow-sm' : 'text-[var(--t-muted)] hover:text-[var(--t-heading)]'
              }`}
            >
              <ShoppingCart className="w-3.5 h-3.5" /> Kasir
            </button>
            <button
              onClick={() => setActiveTab('riwayat')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors cursor-pointer ${
                activeTab === 'riwayat' ? 'bg-[var(--card)] text-[var(--t-heading)] shadow-sm' : 'text-[var(--t-muted)] hover:text-[var(--t-heading)]'
              }`}
            >
              <History className="w-3.5 h-3.5" /> Riwayat
            </button>
          </div>
          <ThemeToggle />
          <button
            onClick={openSettings}
            className="p-2 rounded-lg hover:bg-[var(--surface)] text-[var(--t-muted)] hover:text-[var(--t-heading)] transition-colors cursor-pointer"
            title="Pengaturan Kasir"
          >
            <SettingsIcon className="w-5 h-5" />
          </button>
        </div>
      </div>

      {activeTab === 'kasir' && (
      <>
      {/* Quick reprint — last 3 transactions */}
      {recentTransactions.length > 0 && (
        <div className="bg-[var(--card)] border-b border-[var(--bd)] px-5 py-2 flex items-center gap-3 overflow-x-auto">
          <span className="text-[11px] font-medium text-[var(--t-muted)] flex items-center gap-1 flex-shrink-0">
            <History className="w-3.5 h-3.5" /> Terakhir:
          </span>
          {recentTransactions.map((tx) => (
            <div key={tx.id} className="flex items-center gap-1.5 bg-[var(--surface)] rounded-full pl-3 pr-1.5 py-1 flex-shrink-0">
              <span className="text-[11px] font-semibold text-[var(--t-heading)]">{tx.orderNo}</span>
              <span className="text-[11px] text-[var(--t-muted)]">{formatRupiah(tx.totalAmount || 0)}</span>
              <button
                onClick={() => openWaSendDialog(tx)}
                title="Kirim struk via WA"
                className="w-5 h-5 rounded-full bg-[var(--card)] hover:bg-[var(--bd)] flex items-center justify-center cursor-pointer"
              >
                <MessageCircle className="w-3 h-3 text-[var(--success)]" />
              </button>
              <button
                onClick={() => printReceipt(tx, settings)}
                title="Cetak ulang"
                className="w-5 h-5 rounded-full bg-[var(--card)] hover:bg-[var(--bd)] flex items-center justify-center cursor-pointer"
              >
                <Printer className="w-3 h-3 text-[var(--t-body)]" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex-1 flex flex-col lg:flex-row gap-4 p-4 min-h-0">
        {/* ============ LEFT: PRODUCT GRID ============ */}
        <div className="flex-1 flex flex-col min-h-0 gap-3">
          {/* Search + barcode */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--t-muted)]" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cari produk..."
                className="pl-10 h-11 bg-[var(--card)] border-[var(--bd)] rounded-lg"
              />
            </div>
            <form onSubmit={handleBarcodeSubmit} className="relative w-64">
              <ScanBarcode className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--t-muted)]" />
              <Input
                ref={barcodeRef}
                value={barcodeInput}
                onChange={(e) => setBarcodeInput(e.target.value)}
                placeholder="Scan barcode / SKU..."
                disabled={scanning}
                className="pl-10 h-11 bg-[var(--card)] border-[var(--bd)] rounded-lg"
              />
            </form>
          </div>

          <div className="flex-1 overflow-y-auto space-y-4 pr-1">
            {loadingProducts ? (
              <div className="flex items-center justify-center py-16 text-[var(--t-muted)]">
                <Loader2 className="w-6 h-6 animate-spin" />
              </div>
            ) : (
              <>
                <div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                    {filteredProducts.map((product) => (
                      <ProductCard key={product.id} product={product} onClick={() => handleProductClick(product)} />
                    ))}
                  </div>
                  {filteredProducts.length === 0 && (
                    <p className="text-center text-sm text-[var(--t-muted)] py-10">Tidak ada produk ditemukan</p>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        {/* ============ RIGHT: CART ============ */}
        <div className="w-full lg:w-[380px] flex-shrink-0 bg-[var(--card)] rounded-xl shadow-sm flex flex-col min-h-0">
          <div className="px-4 py-3 border-b border-[var(--bd)] flex items-center justify-between">
            <span className="text-sm font-semibold text-[var(--t-heading)] flex items-center gap-1.5">
              <ShoppingCart className="w-4 h-4" /> Keranjang
            </span>
            {cart.length > 0 && (
              <button
                onClick={clearCart}
                className="text-[11px] text-[var(--danger)] hover:underline cursor-pointer"
              >
                Kosongkan
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-2 space-y-2">
            {cart.length === 0 ? (
              <p className="text-center text-sm text-[var(--t-muted)] py-10">Keranjang masih kosong</p>
            ) : (
              cart.map((item) => {
                const eligibleAddOns = eligibleAddOnsFor(item.productId);
                const availableAddOns = eligibleAddOns.filter((a) => !item.addOns.some((x) => x.addOnId === a.id));
                return (
                <div key={item.lineId} className="py-2 border-b border-[var(--surface-2)] last:border-0">
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full border border-[var(--bd)] flex-shrink-0" style={{ backgroundColor: item.colorHex }} />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-[var(--t-heading)] truncate flex items-center gap-1">
                        {item.sku}
                        {item.categoryName && (
                          <span className="text-[9px] font-semibold px-1 py-0 rounded bg-[var(--brand)]/10 text-[var(--brand)] flex-shrink-0">
                            {item.categoryName}
                          </span>
                        )}
                        {item.isPreOrder && (
                          <span className="text-[9px] font-semibold px-1 py-0 rounded bg-[var(--warning)]/10 text-[var(--warning)] flex-shrink-0">
                            PO
                          </span>
                        )}
                      </p>
                      <p className="text-[11px] text-[var(--t-muted)] truncate">
                        {getVariantLabel(item.color, item.type)} · {formatRupiah(item.unitPrice)}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={() => updateCartQty(item.lineId, -1)}
                        className="w-6 h-6 rounded-md bg-[var(--surface)] hover:bg-[var(--bd)] flex items-center justify-center cursor-pointer"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <span className="text-xs font-semibold w-5 text-center">{item.qty}</span>
                      <button
                        onClick={() => updateCartQty(item.lineId, 1)}
                        className="w-6 h-6 rounded-md bg-[var(--surface)] hover:bg-[var(--bd)] flex items-center justify-center cursor-pointer"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>
                    {item.categoryCode ? (
                      <div className="flex flex-col items-end flex-shrink-0 w-24">
                        <span className="text-[10px] text-[var(--t-subtle)] line-through">
                          {formatRupiah(cartBundleAllocation.get(item.lineId)?.normal ?? item.unitPrice * item.qty)}
                        </span>
                        <span className="text-xs font-semibold text-[var(--success)]">
                          {formatRupiah(cartBundleAllocation.get(item.lineId)?.afterDiscount ?? item.unitPrice * item.qty)}
                        </span>
                      </div>
                    ) : (
                      <span className="text-xs font-semibold text-[var(--t-heading)] w-20 text-right flex-shrink-0">
                        {formatRupiah(item.unitPrice * item.qty)}
                      </span>
                    )}
                    <button
                      onClick={() => removeCartItem(item.lineId)}
                      className="text-[var(--danger)] hover:bg-[var(--danger)]/10 rounded-md p-1 cursor-pointer flex-shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Add-on tags already attached to this line */}
                  {item.addOns.length > 0 && (
                    <div className="mt-1.5 ml-5 space-y-1">
                      {item.addOns.map((a) => (
                        <div key={a.addOnId} className="flex items-center justify-between text-[11px] text-[var(--t-body)] bg-[var(--surface)] rounded-md px-2 py-1">
                          <span className="truncate">+ {a.name}{a.value ? ` "${a.value}"` : ''}</span>
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            <span className="text-[var(--t-muted)]">{formatRupiah(a.price)}</span>
                            <button onClick={() => removeAddOn(item.lineId, a.addOnId)} className="text-[var(--danger)] cursor-pointer">
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* PO toggle + eligible add-on buttons + split-off-1-unit */}
                  <div className="mt-1.5 ml-5 flex flex-wrap items-center gap-1.5">
                    <button
                      onClick={() => togglePreOrder(item.lineId)}
                      className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border cursor-pointer transition-colors ${
                        item.isPreOrder
                          ? 'bg-[var(--warning)] text-white border-[var(--warning)]'
                          : 'bg-[var(--card)] text-[var(--t-muted)] border-[var(--bd)] hover:border-[var(--warning)] hover:text-[var(--warning)]'
                      }`}
                    >
                      PO
                    </button>
                    {availableAddOns.map((a) => (
                      <button
                        key={a.id}
                        onClick={() => openAddOnDialog(item.lineId, a)}
                        className="text-[10px] font-medium px-2 py-0.5 rounded-full border border-[var(--bd)] text-[var(--t-body)] hover:border-[var(--brand)] hover:text-[var(--brand)] cursor-pointer flex items-center gap-0.5"
                      >
                        <Plus className="w-2.5 h-2.5" /> {a.name}
                      </button>
                    ))}
                    {item.qty > 1 && (
                      <button
                        onClick={() => splitCartLine(item.lineId)}
                        title="Pisah 1 pcs jadi baris sendiri — buat PO/Engrave yang beda dari sisanya"
                        className="text-[10px] font-medium px-2 py-0.5 rounded-full border border-[var(--bd)] text-[var(--t-muted)] hover:border-[var(--t-muted)] hover:text-[var(--t-body)] cursor-pointer flex items-center gap-0.5"
                      >
                        <SplitSquareHorizontal className="w-2.5 h-2.5" /> Pisah 1
                      </button>
                    )}
                  </div>
                </div>
                );
              })
            )}
          </div>

          {/* Paket yang dipakai — breakdown kombinasi termurah yang dipilih engine buat isi keranjang sekarang */}
          {bundleCalc && bundleCalc.lines.length > 0 && (
            <div className="px-4 pb-2">
              <div className="bg-[var(--brand)]/10 rounded-lg px-2.5 py-2">
                <p className="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--brand)] mb-1">
                  <Sparkles className="w-3.5 h-3.5 flex-shrink-0" /> Paket yang dipakai
                </p>
                <div className="space-y-0.5">
                  {bundleCalc.lines.map((line) => (
                    <div key={line.code} className="flex items-center justify-between text-[11px] text-[var(--t-body)]">
                      <span className="truncate">{line.packageCount}x {line.name}</span>
                      <span className="flex-shrink-0">{formatRupiah(line.subtotal)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          <div className="border-t border-[var(--bd)] px-4 py-3 space-y-3">
            {/* Totals */}
            <div className="space-y-1 text-sm">
              <div className="flex justify-between text-[var(--t-muted)]">
                <span>Subtotal</span>
                <span>{formatRupiah(subtotal)}</span>
              </div>
              {bundleSavings > 0 && (
                <div className="flex justify-between text-[var(--success)]">
                  <span>Hemat Paket</span>
                  <span>-{formatRupiah(bundleSavings)}</span>
                </div>
              )}
              <div className="flex justify-between text-base font-bold text-[var(--t-heading)] pt-1 border-t border-[var(--surface-2)]">
                <span>Total</span>
                <span>{formatRupiah(total)}</span>
              </div>
            </div>

            {/* Data Pembeli & Catatan — selalu ada, selalu opsional, nggak tergantung status PO */}
            <div className="space-y-1.5 bg-[var(--surface)] rounded-lg p-2.5">
              <Label className="text-xs font-medium text-[var(--t-body)]">Data Pembeli & Catatan (opsional)</Label>
              <Input
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Nama pembeli"
                className="h-8 text-xs bg-[var(--card)] border-[var(--bd)] rounded-lg"
              />
              <Input
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                placeholder="08xxxxxxxxxx"
                className="h-8 text-xs bg-[var(--card)] border-[var(--bd)] rounded-lg"
              />
              <Textarea
                value={orderNotes}
                onChange={(e) => setOrderNotes(e.target.value)}
                placeholder="Catatan order (opsional)"
                rows={2}
                className="text-xs bg-[var(--card)] border-[var(--bd)] rounded-lg"
              />
            </div>

            {/* Payment method */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-[var(--t-body)]">Metode Pembayaran</Label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setPaymentMethod('Cash')}
                  className={`h-9 rounded-lg text-sm font-medium border transition-colors cursor-pointer ${
                    paymentMethod === 'Cash'
                      ? 'bg-[var(--brand)] text-white border-[var(--brand)]'
                      : 'bg-[var(--card)] text-[var(--t-body)] border-[var(--bd)] hover:bg-[var(--surface)]'
                  }`}
                >
                  Cash
                </button>
                <button
                  onClick={() => setPaymentMethod('QRIS')}
                  className={`h-9 rounded-lg text-sm font-medium border transition-colors cursor-pointer ${
                    paymentMethod === 'QRIS'
                      ? 'bg-[var(--brand)] text-white border-[var(--brand)]'
                      : 'bg-[var(--card)] text-[var(--t-body)] border-[var(--bd)] hover:bg-[var(--surface)]'
                  }`}
                >
                  QRIS
                </button>
              </div>
            </div>

            {paymentMethod === 'Cash' && (
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-[var(--t-body)]">Uang Diterima (opsional)</Label>
                <Input
                  type="number"
                  min={0}
                  value={cashReceived}
                  onChange={(e) => setCashReceived(e.target.value)}
                  placeholder="0"
                  className="h-9 text-sm bg-[var(--surface)] border-[var(--bd)] rounded-lg"
                />
                {cashPresets.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {cashPresets.map((preset) => (
                      <button
                        key={preset}
                        onClick={() => setCashReceived(String(preset))}
                        className="text-[11px] px-2 py-1 rounded-full bg-[var(--info)]/10 text-[var(--info)] hover:bg-[var(--info)]/20 cursor-pointer font-medium"
                      >
                        {formatRupiah(preset)}
                      </button>
                    ))}
                  </div>
                )}
                {change != null && (
                  <p className={`text-xs font-semibold ${change < 0 ? 'text-[var(--danger)]' : 'text-[var(--success)]'}`}>
                    {change < 0 ? `Kurang ${formatRupiah(-change)}` : `Kembalian: ${formatRupiah(change)}`}
                  </p>
                )}
              </div>
            )}

            {paymentMethod === 'QRIS' && (
              <p className="text-[11px] text-[var(--t-muted)] bg-[var(--surface)] rounded-lg px-3 py-2">
                Tunjukkan QRIS ke customer, klik &quot;Selesaikan Transaksi&quot; setelah pembayaran masuk.
              </p>
            )}

            <Button
              onClick={handleCheckout}
              disabled={!canCheckout || (paymentMethod === 'Cash' && change != null && change < 0)}
              className="w-full h-11 bg-[var(--brand)] hover:bg-[var(--brand-dark)] text-white rounded-lg font-semibold"
            >
              {checkingOut ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Selesaikan Transaksi (Enter)
            </Button>
          </div>
        </div>
      </div>
      </>
      )}

      {/* ============ RIWAYAT TAB ============ */}
      {activeTab === 'riwayat' && (
        <div className="flex-1 p-4 space-y-4 overflow-y-auto">
          {/* Filters */}
          <div className="flex flex-wrap items-center gap-2">
            <DateRangePicker value={historyDateRange} onChange={setHistoryDateRange} allTimeLabel="Semua Waktu" />
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--t-muted)]" />
              <Input
                value={historySearch}
                onChange={(e) => setHistorySearch(e.target.value)}
                placeholder="Cari nomor transaksi..."
                className="pl-8 h-8 text-xs rounded-lg bg-[var(--card)] border-[var(--bd)] w-[200px]"
              />
            </div>
            <button
              onClick={() => setHistoryPoOnly((v) => !v)}
              className={`h-8 px-3 rounded-lg text-xs font-semibold border cursor-pointer transition-colors ${
                historyPoOnly
                  ? 'bg-[var(--warning)] text-white border-[var(--warning)]'
                  : 'bg-[var(--card)] text-[var(--t-body)] border-[var(--bd)] hover:border-[var(--warning)] hover:text-[var(--warning)]'
              }`}
            >
              Hanya PO
            </button>
          </div>

          {/* Summary */}
          {historySummary && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-[var(--card)] rounded-xl shadow-sm p-4">
                <p className="text-[11px] text-[var(--t-muted)]">Total Omzet</p>
                <p className="text-lg font-bold text-[var(--brand)]">{formatRupiah(historySummary.totalOmzet)}</p>
              </div>
              <div className="bg-[var(--card)] rounded-xl shadow-sm p-4">
                <p className="text-[11px] text-[var(--t-muted)]">Jumlah Transaksi</p>
                <p className="text-lg font-bold text-[var(--t-heading)]">{historySummary.transactionCount}</p>
              </div>
              <div className="bg-[var(--card)] rounded-xl shadow-sm p-4">
                <p className="text-[11px] text-[var(--t-muted)]">Cash</p>
                <p className="text-lg font-bold text-[var(--t-heading)]">{historySummary.cashCount}x</p>
                <p className="text-[11px] text-[var(--t-muted)]">{formatRupiah(historySummary.cashTotal)}</p>
              </div>
              <div className="bg-[var(--card)] rounded-xl shadow-sm p-4">
                <p className="text-[11px] text-[var(--t-muted)]">QRIS</p>
                <p className="text-lg font-bold text-[var(--t-heading)]">{historySummary.qrisCount}x</p>
                <p className="text-[11px] text-[var(--t-muted)]">{formatRupiah(historySummary.qrisTotal)}</p>
              </div>
            </div>
          )}

          {/* List */}
          <div className="bg-[var(--card)] rounded-xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[600px]">
                <thead>
                  <tr className="bg-[var(--surface)]">
                    <th className="text-left text-xs font-medium text-[var(--t-body)] py-2.5 px-4">No. Transaksi</th>
                    <th className="text-left text-xs font-medium text-[var(--t-body)] py-2.5 px-4">Waktu</th>
                    <th className="text-left text-xs font-medium text-[var(--t-body)] py-2.5 px-4">Item</th>
                    <th className="text-left text-xs font-medium text-[var(--t-body)] py-2.5 px-4">Bayar</th>
                    <th className="text-right text-xs font-medium text-[var(--t-body)] py-2.5 px-4">Total</th>
                    <th className="w-20"></th>
                  </tr>
                </thead>
                <tbody>
                  {loadingHistory ? (
                    <tr>
                      <td colSpan={6} className="text-center py-10">
                        <Loader2 className="w-5 h-5 animate-spin mx-auto text-[var(--t-muted)]" />
                      </td>
                    </tr>
                  ) : filteredHistoryOrders.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center py-10 text-sm text-[var(--t-muted)]">
                        Belum ada transaksi POS di periode ini
                      </td>
                    </tr>
                  ) : (
                    filteredHistoryOrders.map((order) => (
                      <tr
                        key={order.id}
                        className="border-t border-[var(--surface-2)] hover:bg-[var(--surface-hover)] transition-colors cursor-pointer"
                        onClick={() => setDetailOrder(order)}
                      >
                        <td className="py-2.5 px-4 text-sm font-semibold text-[var(--t-heading)]">
                          <span className="flex items-center gap-1.5">
                            {order.orderNo}
                            {order.orderItems.some((i) => i.isPreOrder) && (
                              <span className="text-[9px] font-semibold px-1 py-0 rounded bg-[var(--warning)]/10 text-[var(--warning)]">PO</span>
                            )}
                          </span>
                        </td>
                        <td className="py-2.5 px-4 text-xs text-[var(--t-muted)]">
                          {new Date(order.createdAt).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}
                        </td>
                        <td className="py-2.5 px-4 text-xs text-[var(--t-muted)]">{order.orderItems.length} item</td>
                        <td className="py-2.5 px-4">
                          <Badge
                            variant="outline"
                            className={`text-[11px] px-2 py-0 rounded-full font-semibold ${
                              order.paymentMethod === 'Cash'
                                ? 'bg-[var(--brand)]/10 text-[var(--brand)] border-[var(--brand)]/30'
                                : 'bg-[var(--info)]/10 text-[var(--info)] border-[var(--info)]/30'
                            }`}
                          >
                            {order.paymentMethod}
                          </Badge>
                        </td>
                        <td className="py-2.5 px-4 text-right text-sm font-semibold text-[var(--t-heading)]">
                          {formatRupiah(order.totalAmount || 0)}
                        </td>
                        <td className="py-2.5 px-2 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                openWaSendDialog(order);
                              }}
                              title="Kirim struk via WA"
                              className="w-7 h-7 rounded-lg inline-flex items-center justify-center text-[var(--success)] hover:bg-[var(--success)]/10 transition-colors cursor-pointer"
                            >
                              <MessageCircle className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                printReceipt(order, settings);
                              }}
                              title="Cetak ulang"
                              className="w-7 h-7 rounded-lg inline-flex items-center justify-center text-[var(--t-body)] hover:bg-[var(--surface)] transition-colors cursor-pointer"
                            >
                              <Printer className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeleteTarget(order);
                              }}
                              title="Hapus transaksi"
                              className="w-7 h-7 rounded-lg inline-flex items-center justify-center text-[var(--danger)] hover:bg-[var(--danger)]/10 transition-colors cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ============ TRANSACTION DETAIL DIALOG ============ */}
      <Dialog open={!!detailOrder} onOpenChange={() => setDetailOrder(null)}>
        <DialogContent className="sm:max-w-[420px] rounded-xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-[var(--t-heading)]">{detailOrder?.orderNo}</DialogTitle>
            <DialogDescription>
              {detailOrder && new Date(detailOrder.createdAt).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto space-y-2 py-2">
            {detailOrder && (() => {
              const bundle = parseBundleSnapshot(detailOrder);
              const bundleItems = detailOrder.orderItems.filter((i) => i.variant.product.bundleCategoryId != null);
              const plainItems = detailOrder.orderItems.filter((i) => i.variant.product.bundleCategoryId == null);
              return (
                <>
                  {bundle?.lines.map((line) => (
                    <div key={line.code} className="flex items-center justify-between text-sm py-1.5 border-b border-[var(--surface-2)] last:border-0">
                      <div className="min-w-0">
                        <p className="font-medium text-[var(--t-heading)] truncate">{line.name}</p>
                        <p className="text-[11px] text-[var(--t-muted)]">{line.packageCount} x {formatRupiah(line.unitPrice)}</p>
                      </div>
                      <span className="font-semibold text-[var(--t-heading)] flex-shrink-0">{formatRupiah(line.subtotal)}</span>
                    </div>
                  ))}
                  {plainItems.map((item) => (
                    <div key={item.id} className="py-1.5 border-b border-[var(--surface-2)] last:border-0">
                      <div className="flex items-center justify-between text-sm">
                        <div className="min-w-0">
                          <p className="font-medium text-[var(--t-heading)] truncate flex items-center gap-1">
                            {item.variant.product.sku}
                            {item.isPreOrder && (
                              <span className="text-[9px] font-semibold px-1 py-0 rounded bg-[var(--warning)]/10 text-[var(--warning)] flex-shrink-0">PO</span>
                            )}
                          </p>
                          <p className="text-[11px] text-[var(--t-muted)]">
                            {getVariantLabel(item.variant.color, item.variant.type)} · {item.qty} x {formatRupiah(item.unitPrice || 0)}
                          </p>
                        </div>
                        <span className="font-semibold text-[var(--t-heading)] flex-shrink-0">{formatRupiah((item.unitPrice || 0) * item.qty)}</span>
                      </div>
                      {item.addOns.map((a) => (
                        <div key={a.id} className="flex items-center justify-between text-[11px] text-[var(--t-muted)] pl-2 mt-0.5">
                          <span className="truncate">+ {a.addOn.name}{a.value ? ` "${a.value}"` : ''}</span>
                          <span className="flex-shrink-0">{formatRupiah(a.priceSnapshot)}</span>
                        </div>
                      ))}
                    </div>
                  ))}
                  {bundle && bundleItems.length > 0 && (
                    <div className="pt-1">
                      <p className="text-[11px] font-medium text-[var(--t-muted)] mb-1">Rincian item:</p>
                      {bundleItems.map((item) => (
                        <div key={item.id} className="mb-1">
                          <p className="text-[11px] text-[var(--t-muted)] flex items-center gap-1">
                            - {item.variant.product.sku} {getVariantLabel(item.variant.color, item.variant.type)} x{item.qty}
                            {item.isPreOrder && (
                              <span className="text-[9px] font-semibold px-1 py-0 rounded bg-[var(--warning)]/10 text-[var(--warning)] flex-shrink-0">PO</span>
                            )}
                          </p>
                          {item.addOns.map((a) => (
                            <div key={a.id} className="flex items-center justify-between text-[11px] text-[var(--t-muted)] pl-3">
                              <span className="truncate">+ {a.addOn.name}{a.value ? ` "${a.value}"` : ''}</span>
                              <span className="flex-shrink-0">{formatRupiah(a.priceSnapshot)}</span>
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  )}
                  {detailOrder.orderItems.some((i) => i.isPreOrder) && (
                    <div className="pt-2 border-t border-[var(--surface-2)] mt-1">
                      <p className="text-[11px] font-medium text-[var(--warning)] mb-1">Item PO (butuh produksi):</p>
                      {detailOrder.orderItems.filter((i) => i.isPreOrder).map((item) => (
                        <p key={item.id} className="text-[11px] text-[var(--t-muted)]">
                          - {item.variant.product.sku} {getVariantLabel(item.variant.color, item.variant.type)} x{item.qty}
                        </p>
                      ))}
                    </div>
                  )}
                  {/* Data pembeli & catatan — selalu tampil kalau diisi, independen dari status PO */}
                  {(detailOrder.customerName?.trim() || detailOrder.customerPhone?.trim() || detailOrder.notes?.trim()) && (
                    <div className="pt-2 border-t border-[var(--surface-2)] mt-1 text-[11px] text-[var(--t-body)]">
                      {detailOrder.customerName?.trim() && <p>Nama: {detailOrder.customerName}</p>}
                      {detailOrder.customerPhone?.trim() && <p>WA: {detailOrder.customerPhone}</p>}
                      {detailOrder.notes?.trim() && <p className="mt-1">Catatan: {detailOrder.notes}</p>}
                    </div>
                  )}
                </>
              );
            })()}
          </div>
          {detailOrder && (
            <div className="border-t border-[var(--bd)] pt-3 space-y-1 text-sm">
              {parseBundleSnapshot(detailOrder) && (() => {
                const bundle = parseBundleSnapshot(detailOrder)!;
                return bundle.savings > 0 ? (
                  <div className="flex justify-between text-[var(--success)]">
                    <span>Kamu Hemat</span>
                    <span>{formatRupiah(bundle.savings)}</span>
                  </div>
                ) : null;
              })()}
              <div className="flex justify-between text-[var(--t-muted)]">
                <span>Subtotal</span>
                <span>{formatRupiah(detailOrder.subtotalAmount || 0)}</span>
              </div>
              {detailOrder.discountAmount > 0 && (
                <div className="flex justify-between text-[var(--warning)]">
                  <span>Diskon</span>
                  <span>-{formatRupiah(detailOrder.discountAmount)}</span>
                </div>
              )}
              <div className="flex justify-between text-base font-bold text-[var(--t-heading)]">
                <span>Total</span>
                <span>{formatRupiah(detailOrder.totalAmount || 0)}</span>
              </div>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => detailOrder && setDeleteTarget(detailOrder)}
              className="rounded-lg border-[var(--danger)]/30 text-[var(--danger)] hover:bg-[var(--danger)]/10 gap-1.5"
            >
              <Trash2 className="w-3.5 h-3.5" /> Hapus
            </Button>
            <Button variant="outline" onClick={() => setDetailOrder(null)} className="rounded-lg border-[var(--bd)] text-[var(--t-body)]">
              Tutup
            </Button>
            <Button
              variant="outline"
              onClick={() => detailOrder && printReceipt(detailOrder, settings)}
              className="rounded-lg border-[var(--bd)] text-[var(--t-body)] gap-1.5"
            >
              <Printer className="w-3.5 h-3.5" /> Cetak
            </Button>
            <Button
              onClick={() => detailOrder && openWaSendDialog(detailOrder)}
              className="rounded-lg bg-[var(--brand)] hover:bg-[var(--brand-dark)] text-white gap-1.5"
            >
              <MessageCircle className="w-3.5 h-3.5" /> Kirim WA
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============ DELETE TRANSACTION CONFIRMATION ============ */}
      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent className="rounded-xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus Transaksi Ini?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget && (
                <>
                  <span className="font-semibold text-[var(--t-heading)]">{deleteTarget.orderNo}</span> senilai{' '}
                  <span className="font-semibold text-[var(--t-heading)]">{formatRupiah(deleteTarget.totalAmount || 0)}</span> akan
                  dihapus permanen dan stok yang terjual akan dikembalikan ke inventory.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-lg">Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteTransaction}
              disabled={deleting}
              className="rounded-lg bg-[var(--danger)] hover:bg-[var(--danger-dark)] text-white"
            >
              {deleting ? 'Menghapus...' : 'Hapus Transaksi'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ============ KIRIM WA DIALOG ============ */}
      <Dialog open={!!waSendTarget} onOpenChange={(o) => !o && setWaSendTarget(null)}>
        <DialogContent className="sm:max-w-[380px] rounded-xl">
          <DialogHeader>
            <DialogTitle className="text-[var(--t-heading)]">Kirim Struk via WA</DialogTitle>
            <DialogDescription>
              {waSendTarget?.orderNo} — PDF struk dikirim ke nomor ini lewat WhatsApp.
            </DialogDescription>
          </DialogHeader>
          <Input
            autoFocus
            value={waSendPhone}
            onChange={(e) => setWaSendPhone(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && confirmWaSend()}
            placeholder="08xxxxxxxxxx"
            className="h-10 rounded-lg"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setWaSendTarget(null)} className="rounded-lg">Batal</Button>
            <Button
              onClick={confirmWaSend}
              disabled={!waSendPhone.trim() || sendingWaHistory}
              className="rounded-lg bg-[var(--brand)] hover:bg-[var(--brand-dark)] text-white gap-1.5"
            >
              {sendingWaHistory ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageCircle className="w-4 h-4" />} Kirim
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============ VARIANT PICKER DIALOG ============ */}
      <Dialog open={!!variantPickerProduct} onOpenChange={() => setVariantPickerProduct(null)}>
        <DialogContent className="sm:max-w-[400px] rounded-xl">
          <DialogHeader>
            <DialogTitle className="text-[var(--t-heading)]">{variantPickerProduct?.sku}</DialogTitle>
            <DialogDescription>{variantPickerProduct?.name} — pilih varian</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5 max-h-[50vh] overflow-y-auto">
            {variantPickerProduct?.variants.map((variant) => {
              const category = variantPickerProduct.bundleCategory;
              const noPrice = !category && variant.price == null;
              return (
                <button
                  key={variant.id}
                  disabled={noPrice}
                  onClick={() => {
                    addToCart(variantPickerProduct, variant);
                    setVariantPickerProduct(null);
                  }}
                  className={`w-full flex items-center gap-3 p-2.5 rounded-lg transition-colors text-left ${
                    noPrice ? 'opacity-50 cursor-not-allowed' : 'hover:bg-[var(--surface)] cursor-pointer'
                  }`}
                >
                  <span className="w-5 h-5 rounded-full border border-[var(--bd)] flex-shrink-0" style={{ backgroundColor: variant.colorHex }} />
                  <span className="text-sm text-[var(--t-heading)] flex-1">{getVariantLabel(variant.color, variant.type)}</span>
                  {noPrice ? (
                    <span className="text-[11px] font-medium text-[var(--danger)]">Belum ada harga</span>
                  ) : (
                    <span className="text-xs font-semibold text-[var(--brand)]">{formatRupiah(category ? category.normalPrice : variant.price!)}</span>
                  )}
                  <span className={`text-xs font-medium ${variant.qty === 0 ? 'text-[var(--danger)]' : 'text-[var(--t-muted)]'}`}>
                    Stok: {variant.qty}
                  </span>
                </button>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>

      {/* ============ ADD-ON TEXT INPUT DIALOG ============ */}
      <Dialog open={!!addOnDialogTarget} onOpenChange={(o) => !o && setAddOnDialogTarget(null)}>
        <DialogContent className="sm:max-w-[380px] rounded-xl">
          <DialogHeader>
            <DialogTitle className="text-[var(--t-heading)]">+ {addOnDialogTarget?.addOn.name}</DialogTitle>
            <DialogDescription>
              Isi teks custom-nya — {formatRupiah(addOnDialogTarget?.addOn.price ?? 0)} tambahan per baris ini.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Input
              autoFocus
              value={addOnValueInput}
              onChange={(e) => setAddOnValueInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && confirmAddOnDialog()}
              maxLength={addOnDialogTarget?.addOn.maxLength ?? undefined}
              placeholder='mis. "BUDI - 10K"'
              className="h-10 rounded-lg"
            />
            {addOnDialogTarget?.addOn.maxLength != null && (
              <p className="text-[11px] text-[var(--t-subtle)] text-right">
                {addOnValueInput.length}/{addOnDialogTarget.addOn.maxLength}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOnDialogTarget(null)} className="rounded-lg">Batal</Button>
            <Button onClick={confirmAddOnDialog} className="rounded-lg bg-[var(--brand)] hover:bg-[var(--brand-dark)] text-white">
              Tambah
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============ SUCCESS DIALOG ============ */}
      <Dialog open={!!successData} onOpenChange={() => setSuccessData(null)}>
        <DialogContent className="sm:max-w-[380px] rounded-xl text-center">
          <div className="flex flex-col items-center gap-3 py-4">
            <div className="w-14 h-14 rounded-full bg-[var(--success)]/10 flex items-center justify-center">
              <CheckCircle2 className="w-8 h-8 text-[var(--success)]" />
            </div>
            <div>
              <p className="text-sm text-[var(--t-muted)]">Transaksi berhasil</p>
              <p className="text-lg font-bold text-[var(--t-heading)]">{successData?.orderNo}</p>
            </div>
            <div className="w-full bg-[var(--surface)] rounded-lg p-3 space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-[var(--t-muted)]">Total</span>
                <span className="font-semibold text-[var(--t-heading)]">{successData ? formatRupiah(successData.totalAmount || 0) : ''}</span>
              </div>
              {successData?.paymentMethod === 'Cash' && successData?.cashReceived != null && (
                <div className="flex justify-between">
                  <span className="text-[var(--t-muted)]">Kembalian</span>
                  <span className="font-semibold text-[var(--t-heading)]">
                    {formatRupiah(successData.cashReceived - (successData.totalAmount || 0))}
                  </span>
                </div>
              )}
            </div>

            <div className="w-full flex gap-2">
              <Input
                value={waPhone}
                onChange={(e) => setWaPhone(e.target.value)}
                placeholder="08xxxxxxxxxx"
                className="h-10 text-sm rounded-lg"
              />
              <Button
                onClick={async () => {
                  if (!successData || !waPhone.trim()) return;
                  setSendingWa(true);
                  try {
                    await sendReceiptPdfWhatsApp(successData, settings, waPhone);
                  } finally {
                    setSendingWa(false);
                  }
                }}
                disabled={!waPhone.trim() || sendingWa}
                className="h-10 rounded-lg bg-[var(--brand)] hover:bg-[var(--brand-dark)] text-white flex-shrink-0 gap-1.5 px-3"
              >
                {sendingWa ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageCircle className="w-4 h-4" />} Kirim WA
              </Button>
            </div>

            <Button
              onClick={() => successData && printReceipt(successData, settings)}
              variant="outline"
              className="w-full h-9 rounded-lg border-[var(--bd)] text-[var(--t-muted)] gap-2 text-xs"
            >
              <Printer className="w-3.5 h-3.5" /> Print Struk (opsional)
            </Button>
          </div>
          <Button onClick={() => setSuccessData(null)} className="w-full h-10 bg-[var(--brand)] hover:bg-[var(--brand-dark)] text-white rounded-lg">
            Transaksi Baru
          </Button>
        </DialogContent>
      </Dialog>

      {/* ============ SETTINGS DIALOG ============ */}
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="sm:max-w-[440px] rounded-xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-[var(--t-heading)]">Pengaturan Kasir</DialogTitle>
            <DialogDescription>Nama toko, kertas struk, dan preset — berlaku untuk semua transaksi POS</DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto space-y-4 py-2 pr-1">
            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-[var(--t-heading)]">Nama Toko</Label>
              <Input value={editStoreName} onChange={(e) => setEditStoreName(e.target.value)} className="rounded-lg" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-[var(--t-heading)]">Alamat (opsional, tampil di struk)</Label>
              <Input value={editStoreAddress} onChange={(e) => setEditStoreAddress(e.target.value)} placeholder="Jl. Contoh No. 1, Jakarta" className="rounded-lg" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-[var(--t-heading)]">No. Telepon (opsional, tampil di struk)</Label>
              <Input value={editStorePhone} onChange={(e) => setEditStorePhone(e.target.value)} placeholder="0812xxxxxxx" className="rounded-lg" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-[var(--t-heading)]">Pesan Penutup Struk</Label>
              <Textarea
                value={editReceiptFooter}
                onChange={(e) => setEditReceiptFooter(e.target.value)}
                placeholder="Terima kasih! IG: @solutive.id"
                rows={2}
                className="rounded-lg"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-[var(--t-heading)]">Lebar Kertas Struk</Label>
              <div className="grid grid-cols-2 gap-2">
                {[58, 80].map((w) => (
                  <button
                    key={w}
                    onClick={() => setEditPaperWidth(w as 58 | 80)}
                    className={`h-9 rounded-lg text-sm font-medium border cursor-pointer ${
                      editPaperWidth === w ? 'bg-[var(--brand)] text-white border-[var(--brand)]' : 'bg-[var(--card)] text-[var(--t-body)] border-[var(--bd)]'
                    }`}
                  >
                    {w}mm
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-[var(--t-heading)]">Preset Uang Cash (Rp, pisah koma)</Label>
              <Input value={editCashPresets} onChange={(e) => setEditCashPresets(e.target.value)} placeholder="50000, 100000, 150000" className="rounded-lg" />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setSettingsOpen(false)} className="rounded-lg border-[var(--bd)] text-[var(--t-body)]">
              Batal
            </Button>
            <Button onClick={saveSettings} disabled={savingSettings} className="rounded-lg bg-[var(--brand)] hover:bg-[var(--brand-dark)] text-white">
              {savingSettings ? 'Menyimpan...' : 'Simpan'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============ PRODUCT CARD ============

function ProductCard({ product, onClick }: { product: PosProduct; onClick: () => void }) {
  const totalStock = product.variants.reduce((sum, v) => sum + v.qty, 0);
  const range = priceRangeOf(product);
  const noPrice = range == null;
  const outOfStock = totalStock <= 0;

  return (
    <button
      onClick={onClick}
      className={`text-left rounded-xl border transition-all cursor-pointer p-3 bg-[var(--card)] border-[var(--bd)] hover:shadow-md ${noPrice ? 'opacity-60' : ''}`}
    >
      <p className="font-semibold text-[var(--t-heading)] truncate text-sm flex items-center gap-1">
        {product.sku}
        {product.bundleCategory && (
          <span className="text-[9px] font-semibold px-1 py-0 rounded bg-[var(--brand)]/10 text-[var(--brand)] flex-shrink-0">
            {product.bundleCategory.name}
          </span>
        )}
      </p>
      <p className="text-[11px] text-[var(--t-muted)] truncate mb-1.5">{product.name}</p>
      {noPrice ? (
        <Badge className="text-[10px] px-1.5 py-0 rounded-full bg-[var(--danger)]/10 text-[var(--danger)] border-[var(--danger)]/30 gap-1" variant="outline">
          <AlertTriangle className="w-2.5 h-2.5" /> Belum ada harga
        </Badge>
      ) : (
        <div className="flex items-center justify-between">
          <span className="font-bold text-[var(--brand)] text-sm">
            {range.min === range.max ? formatRupiah(range.min) : `${formatRupiah(range.min)} - ${formatRupiah(range.max)}`}
          </span>
          <span className={`text-[11px] font-medium ${outOfStock ? 'text-[var(--danger)]' : 'text-[var(--t-muted)]'}`}>
            Stok: {totalStock}
          </span>
        </div>
      )}
    </button>
  );
}
