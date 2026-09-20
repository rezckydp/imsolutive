'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import Link from 'next/link';
import {
  Search,
  Plus,
  Minus,
  Trash2,
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
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
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
import { format } from 'date-fns';

// ============ TYPES ============

interface PosVariant {
  id: string;
  color: string;
  colorHex: string;
  type: string;
  qty: number;
}

interface PosProduct {
  id: string;
  sku: string;
  name: string;
  price: number | null;
  variants: PosVariant[];
}

interface CartItem {
  variantId: string;
  sku: string;
  productName: string;
  color: string;
  colorHex: string;
  type: string;
  unitPrice: number;
  qty: number;
  stockQty: number;
}

interface PosSettingsData {
  id: string;
  storeName: string;
  paperWidthMm: number;
  favoriteProductIds: string;
  discountPresets: string;
  cashPresets: string;
}

interface ReceiptOrderItem {
  id: string;
  qty: number;
  unitPrice: number | null;
  variant: { color: string; type: string; product: { sku: string; name: string } };
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
  orderItems: ReceiptOrderItem[];
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

function formatRupiah(n: number): string {
  return `Rp ${n.toLocaleString('id-ID')}`;
}

function buildReceiptLines(order: ReceiptOrder, storeName: string): string[] {
  const lines: string[] = [];
  lines.push(storeName);
  lines.push(new Date(order.createdAt).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }));
  lines.push(order.orderNo);
  lines.push('--------------------------------');
  for (const item of order.orderItems) {
    const label = getVariantLabel(item.variant.color, item.variant.type);
    lines.push(`${item.variant.product.sku}${label ? ' - ' + label : ''}`);
    const unitPrice = item.unitPrice || 0;
    lines.push(`  ${item.qty} x ${formatRupiah(unitPrice)} = ${formatRupiah(unitPrice * item.qty)}`);
  }
  lines.push('--------------------------------');
  lines.push(`Subtotal: ${formatRupiah(order.subtotalAmount || 0)}`);
  if (order.discountAmount > 0) lines.push(`Diskon: -${formatRupiah(order.discountAmount)}`);
  lines.push(`TOTAL: ${formatRupiah(order.totalAmount || 0)}`);
  lines.push(`Bayar: ${order.paymentMethod || '-'}`);
  if (order.paymentMethod === 'Cash' && order.cashReceived != null) {
    lines.push(`Tunai: ${formatRupiah(order.cashReceived)}`);
    lines.push(`Kembali: ${formatRupiah(order.cashReceived - (order.totalAmount || 0))}`);
  }
  lines.push('');
  lines.push('Terima kasih!');
  return lines;
}

function printReceipt(order: ReceiptOrder, settings: PosSettingsData | null) {
  const width = settings?.paperWidthMm === 80 ? 80 : 58;
  const storeName = settings?.storeName || 'Solutive';
  const lines = buildReceiptLines(order, storeName);
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

function sendReceiptWhatsApp(order: ReceiptOrder, storeName: string, phone: string) {
  const normalized = normalizePhone(phone);
  if (!normalized) {
    toast.error('Nomor WhatsApp tidak valid');
    return;
  }
  const text = buildReceiptLines(order, storeName).join('\n');
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
  return (data.products || []).map((p: { id: string; sku: string; name: string; price: number | null; variants?: PosVariant[] }) => ({
    id: p.id,
    sku: p.sku,
    name: p.name,
    price: p.price,
    variants: p.variants || [],
  }));
}

// ============ MAIN COMPONENT ============

export default function PosPage() {
  const [activeTab, setActiveTab] = useState<'kasir' | 'riwayat'>('kasir');

  const [products, setProducts] = useState<PosProduct[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [search, setSearch] = useState('');
  const [barcodeInput, setBarcodeInput] = useState('');
  const [scanning, setScanning] = useState(false);
  const barcodeRef = useRef<HTMLInputElement>(null);

  const [cart, setCart] = useState<CartItem[]>([]);
  const [discountAmount, setDiscountAmount] = useState(0);
  const [discountInput, setDiscountInput] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'Cash' | 'QRIS' | null>(null);
  const [cashReceived, setCashReceived] = useState('');
  const [checkingOut, setCheckingOut] = useState(false);

  const [successData, setSuccessData] = useState<ReceiptOrder | null>(null);
  const [waPhone, setWaPhone] = useState('');
  const [recentTransactions, setRecentTransactions] = useState<ReceiptOrder[]>([]);

  const [variantPickerProduct, setVariantPickerProduct] = useState<PosProduct | null>(null);

  const [settings, setSettings] = useState<PosSettingsData | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [editStoreName, setEditStoreName] = useState('');
  const [editPaperWidth, setEditPaperWidth] = useState<58 | 80>(58);
  const [editDiscountPresets, setEditDiscountPresets] = useState('');
  const [editCashPresets, setEditCashPresets] = useState('');
  const [savingSettings, setSavingSettings] = useState(false);

  const [historyOrders, setHistoryOrders] = useState<ReceiptOrder[]>([]);
  const [historySummary, setHistorySummary] = useState<HistorySummary | null>(null);
  const [historyDateRange, setHistoryDateRange] = useState<SimpleDateRange>(null);
  const [historySearch, setHistorySearch] = useState('');
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [detailOrder, setDetailOrder] = useState<ReceiptOrder | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ReceiptOrder | null>(null);
  const [deleting, setDeleting] = useState(false);

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
    if (!q) return historyOrders;
    return historyOrders.filter((o) => o.orderNo.toUpperCase().includes(q));
  }, [historyOrders, historySearch]);

  const fetchProducts = useCallback(async () => {
    setLoadingProducts(true);
    try {
      const list = await fetchProductsList('mastersOnly=true&limit=500');
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

  useEffect(() => {
    fetchProducts();
    fetchSettings();
    fetchRecentTransactions();
  }, [fetchProducts, fetchSettings, fetchRecentTransactions]);

  useEffect(() => {
    barcodeRef.current?.focus();
  }, []);

  const discountPresets = useMemo(() => (settings ? parsePresetList(settings.discountPresets) : []), [settings]);
  const cashPresets = useMemo(() => (settings ? parsePresetList(settings.cashPresets) : []), [settings]);

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products;
    return products.filter((p) => p.sku.toLowerCase().includes(q) || p.name.toLowerCase().includes(q));
  }, [products, search]);

  const subtotal = useMemo(() => cart.reduce((sum, item) => sum + item.unitPrice * item.qty, 0), [cart]);
  const total = Math.max(0, subtotal - discountAmount);
  const cashReceivedNum = cashReceived.trim() ? parseInt(cashReceived, 10) : null;
  const change = paymentMethod === 'Cash' && cashReceivedNum != null ? cashReceivedNum - total : null;
  const canCheckout = cart.length > 0 && paymentMethod !== null && !checkingOut;

  // ============ CART ============

  const addToCart = useCallback((product: PosProduct, variant: PosVariant) => {
    if (product.price == null) {
      toast.error(`${product.sku} belum punya harga jual — isi dulu di Stock Management`);
      return;
    }
    setCart((prev) => {
      const existing = prev.find((i) => i.variantId === variant.id);
      if (existing) {
        return prev.map((i) => (i.variantId === variant.id ? { ...i, qty: i.qty + 1 } : i));
      }
      return [
        ...prev,
        {
          variantId: variant.id,
          sku: product.sku,
          productName: product.name,
          color: variant.color,
          colorHex: variant.colorHex,
          type: variant.type,
          unitPrice: product.price!,
          qty: 1,
          stockQty: variant.qty,
        },
      ];
    });
  }, []);

  const handleProductClick = (product: PosProduct) => {
    if (product.price == null) {
      toast.error(`${product.sku} belum punya harga jual — isi dulu di Stock Management`);
      return;
    }
    if (!product.variants || product.variants.length === 0) {
      toast.error(`${product.sku} belum punya varian`);
      return;
    }
    if (product.variants.length === 1) {
      addToCart(product, product.variants[0]);
      return;
    }
    setVariantPickerProduct(product);
  };

  const updateCartQty = (variantId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((i) => (i.variantId === variantId ? { ...i, qty: i.qty + delta } : i))
        .filter((i) => i.qty > 0)
    );
  };

  const removeCartItem = (variantId: string) => {
    setCart((prev) => prev.filter((i) => i.variantId !== variantId));
  };

  const clearCart = useCallback(() => {
    if (cart.length === 0 && !paymentMethod && !discountAmount) return;
    setCart([]);
    setDiscountAmount(0);
    setDiscountInput('');
    setPaymentMethod(null);
    setCashReceived('');
    toast.message('Keranjang dikosongkan');
  }, [cart.length, paymentMethod, discountAmount]);

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
      if (product.price == null) {
        toast.error(`${product.sku} belum punya harga jual — isi dulu di Stock Management`);
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
          items: cart.map((i) => ({ variantId: i.variantId, qty: i.qty })),
          discountAmount,
          paymentMethod,
          cashReceived: cashReceivedNum ?? undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal memproses transaksi');

      setSuccessData(data.order);
      setWaPhone('');
      setCart([]);
      setDiscountAmount(0);
      setDiscountInput('');
      setPaymentMethod(null);
      setCashReceived('');
      fetchProducts();
      fetchRecentTransactions();
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
  }, [canCheckout, cart, discountAmount, paymentMethod, cashReceived]);

  // ============ SETTINGS DIALOG ============

  const openSettings = () => {
    if (!settings) return;
    setEditStoreName(settings.storeName);
    setEditPaperWidth(settings.paperWidthMm === 80 ? 80 : 58);
    setEditDiscountPresets(parsePresetList(settings.discountPresets).join(', '));
    setEditCashPresets(parsePresetList(settings.cashPresets).join(', '));
    setSettingsOpen(true);
  };

  const saveSettings = async () => {
    setSavingSettings(true);
    try {
      const discountList = editDiscountPresets
        .split(',')
        .map((s) => parseInt(s.trim(), 10))
        .filter((n) => !isNaN(n) && n > 0);
      const cashList = editCashPresets
        .split(',')
        .map((s) => parseInt(s.trim(), 10))
        .filter((n) => !isNaN(n) && n > 0);

      const res = await fetch('/api/pos/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeName: editStoreName,
          paperWidthMm: editPaperWidth,
          discountPresets: discountList,
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
    <div className="min-h-screen bg-[#f5f6fa] flex flex-col">
      {/* Top bar */}
      <div className="bg-white border-b border-[#e8e8e8] px-5 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/" className="text-[#6b7280] hover:text-[#2d3436] transition-colors" title="Kembali ke Dashboard">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <h1 className="text-lg font-bold text-[#2d3436]">{settings?.storeName || 'Solutive'} — Kasir</h1>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 bg-[#f5f6fa] p-0.5 rounded-full">
            <button
              onClick={() => setActiveTab('kasir')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors cursor-pointer ${
                activeTab === 'kasir' ? 'bg-white text-[#2d3436] shadow-sm' : 'text-[#6b7280] hover:text-[#2d3436]'
              }`}
            >
              <ShoppingCart className="w-3.5 h-3.5" /> Kasir
            </button>
            <button
              onClick={() => setActiveTab('riwayat')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors cursor-pointer ${
                activeTab === 'riwayat' ? 'bg-white text-[#2d3436] shadow-sm' : 'text-[#6b7280] hover:text-[#2d3436]'
              }`}
            >
              <History className="w-3.5 h-3.5" /> Riwayat
            </button>
          </div>
          <button
            onClick={openSettings}
            className="p-2 rounded-lg hover:bg-[#f5f6fa] text-[#6b7280] hover:text-[#2d3436] transition-colors cursor-pointer"
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
        <div className="bg-white border-b border-[#e8e8e8] px-5 py-2 flex items-center gap-3 overflow-x-auto">
          <span className="text-[11px] font-medium text-[#6b7280] flex items-center gap-1 flex-shrink-0">
            <History className="w-3.5 h-3.5" /> Terakhir:
          </span>
          {recentTransactions.map((tx) => (
            <div key={tx.id} className="flex items-center gap-1.5 bg-[#f5f6fa] rounded-full pl-3 pr-1.5 py-1 flex-shrink-0">
              <span className="text-[11px] font-semibold text-[#2d3436]">{tx.orderNo}</span>
              <span className="text-[11px] text-[#6b7280]">{formatRupiah(tx.totalAmount || 0)}</span>
              <button
                onClick={() => printReceipt(tx, settings)}
                title="Cetak ulang"
                className="w-5 h-5 rounded-full bg-white hover:bg-[#e8e8e8] flex items-center justify-center cursor-pointer"
              >
                <Printer className="w-3 h-3 text-[#4b5563]" />
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
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#6b7280]" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cari produk..."
                className="pl-10 h-11 bg-white border-[#e8e8e8] rounded-lg"
              />
            </div>
            <form onSubmit={handleBarcodeSubmit} className="relative w-64">
              <ScanBarcode className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#6b7280]" />
              <Input
                ref={barcodeRef}
                value={barcodeInput}
                onChange={(e) => setBarcodeInput(e.target.value)}
                placeholder="Scan barcode / SKU..."
                disabled={scanning}
                className="pl-10 h-11 bg-white border-[#e8e8e8] rounded-lg"
              />
            </form>
          </div>

          <div className="flex-1 overflow-y-auto space-y-4 pr-1">
            {loadingProducts ? (
              <div className="flex items-center justify-center py-16 text-[#6b7280]">
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
                    <p className="text-center text-sm text-[#6b7280] py-10">Tidak ada produk ditemukan</p>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        {/* ============ RIGHT: CART ============ */}
        <div className="w-full lg:w-[380px] flex-shrink-0 bg-white rounded-xl shadow-sm flex flex-col min-h-0">
          <div className="px-4 py-3 border-b border-[#e8e8e8] flex items-center justify-between">
            <span className="text-sm font-semibold text-[#2d3436] flex items-center gap-1.5">
              <ShoppingCart className="w-4 h-4" /> Keranjang
            </span>
            {cart.length > 0 && (
              <button
                onClick={clearCart}
                className="text-[11px] text-[#dc2626] hover:underline cursor-pointer"
              >
                Kosongkan
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-2 space-y-2">
            {cart.length === 0 ? (
              <p className="text-center text-sm text-[#6b7280] py-10">Keranjang masih kosong</p>
            ) : (
              cart.map((item) => (
                <div key={item.variantId} className="flex items-center gap-2 py-2 border-b border-[#f0f0f0] last:border-0">
                  <span className="w-3 h-3 rounded-full border border-[#e8e8e8] flex-shrink-0" style={{ backgroundColor: item.colorHex }} />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-[#2d3436] truncate">{item.sku}</p>
                    <p className="text-[11px] text-[#6b7280] truncate">
                      {getVariantLabel(item.color, item.type)} · {formatRupiah(item.unitPrice)}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => updateCartQty(item.variantId, -1)}
                      className="w-6 h-6 rounded-md bg-[#f5f6fa] hover:bg-[#e8e8e8] flex items-center justify-center cursor-pointer"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    <span className="text-xs font-semibold w-5 text-center">{item.qty}</span>
                    <button
                      onClick={() => updateCartQty(item.variantId, 1)}
                      className="w-6 h-6 rounded-md bg-[#f5f6fa] hover:bg-[#e8e8e8] flex items-center justify-center cursor-pointer"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>
                  <span className="text-xs font-semibold text-[#2d3436] w-20 text-right flex-shrink-0">
                    {formatRupiah(item.unitPrice * item.qty)}
                  </span>
                  <button
                    onClick={() => removeCartItem(item.variantId)}
                    className="text-[#dc2626] hover:bg-[#dc2626]/10 rounded-md p-1 cursor-pointer flex-shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>

          <div className="border-t border-[#e8e8e8] px-4 py-3 space-y-3">
            {/* Discount */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-[#4b5563]">Diskon (Rp)</Label>
              <Input
                type="number"
                min={0}
                value={discountInput}
                onChange={(e) => {
                  setDiscountInput(e.target.value);
                  setDiscountAmount(parseInt(e.target.value, 10) || 0);
                }}
                placeholder="0"
                className="h-9 text-sm bg-[#f5f6fa] border-[#e8e8e8] rounded-lg"
              />
              {discountPresets.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {discountPresets.map((preset) => (
                    <button
                      key={preset}
                      onClick={() => {
                        setDiscountAmount(preset);
                        setDiscountInput(String(preset));
                      }}
                      className="text-[11px] px-2 py-1 rounded-full bg-[#4a6741]/10 text-[#4a6741] hover:bg-[#4a6741]/20 cursor-pointer font-medium"
                    >
                      {formatRupiah(preset)}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Totals */}
            <div className="space-y-1 text-sm">
              <div className="flex justify-between text-[#6b7280]">
                <span>Subtotal</span>
                <span>{formatRupiah(subtotal)}</span>
              </div>
              {discountAmount > 0 && (
                <div className="flex justify-between text-[#d97706]">
                  <span>Diskon</span>
                  <span>-{formatRupiah(discountAmount)}</span>
                </div>
              )}
              <div className="flex justify-between text-base font-bold text-[#2d3436] pt-1 border-t border-[#f0f0f0]">
                <span>Total</span>
                <span>{formatRupiah(total)}</span>
              </div>
            </div>

            {/* Payment method */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-[#4b5563]">Metode Pembayaran</Label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setPaymentMethod('Cash')}
                  className={`h-9 rounded-lg text-sm font-medium border transition-colors cursor-pointer ${
                    paymentMethod === 'Cash'
                      ? 'bg-[#4a6741] text-white border-[#4a6741]'
                      : 'bg-white text-[#4b5563] border-[#e8e8e8] hover:bg-[#f5f6fa]'
                  }`}
                >
                  Cash
                </button>
                <button
                  onClick={() => setPaymentMethod('QRIS')}
                  className={`h-9 rounded-lg text-sm font-medium border transition-colors cursor-pointer ${
                    paymentMethod === 'QRIS'
                      ? 'bg-[#4a6741] text-white border-[#4a6741]'
                      : 'bg-white text-[#4b5563] border-[#e8e8e8] hover:bg-[#f5f6fa]'
                  }`}
                >
                  QRIS
                </button>
              </div>
            </div>

            {paymentMethod === 'Cash' && (
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-[#4b5563]">Uang Diterima (opsional)</Label>
                <Input
                  type="number"
                  min={0}
                  value={cashReceived}
                  onChange={(e) => setCashReceived(e.target.value)}
                  placeholder="0"
                  className="h-9 text-sm bg-[#f5f6fa] border-[#e8e8e8] rounded-lg"
                />
                {cashPresets.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {cashPresets.map((preset) => (
                      <button
                        key={preset}
                        onClick={() => setCashReceived(String(preset))}
                        className="text-[11px] px-2 py-1 rounded-full bg-[#2563eb]/10 text-[#2563eb] hover:bg-[#2563eb]/20 cursor-pointer font-medium"
                      >
                        {formatRupiah(preset)}
                      </button>
                    ))}
                  </div>
                )}
                {change != null && (
                  <p className={`text-xs font-semibold ${change < 0 ? 'text-[#dc2626]' : 'text-[#15803d]'}`}>
                    {change < 0 ? `Kurang ${formatRupiah(-change)}` : `Kembalian: ${formatRupiah(change)}`}
                  </p>
                )}
              </div>
            )}

            {paymentMethod === 'QRIS' && (
              <p className="text-[11px] text-[#6b7280] bg-[#f5f6fa] rounded-lg px-3 py-2">
                Tunjukkan QRIS ke customer, klik &quot;Selesaikan Transaksi&quot; setelah pembayaran masuk.
              </p>
            )}

            <Button
              onClick={handleCheckout}
              disabled={!canCheckout || (paymentMethod === 'Cash' && change != null && change < 0)}
              className="w-full h-11 bg-[#4a6741] hover:bg-[#3d5535] text-white rounded-lg font-semibold"
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
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#6b7280]" />
              <Input
                value={historySearch}
                onChange={(e) => setHistorySearch(e.target.value)}
                placeholder="Cari nomor transaksi..."
                className="pl-8 h-8 text-xs rounded-lg bg-white border-[#e8e8e8] w-[200px]"
              />
            </div>
          </div>

          {/* Summary */}
          {historySummary && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-white rounded-xl shadow-sm p-4">
                <p className="text-[11px] text-[#6b7280]">Total Omzet</p>
                <p className="text-lg font-bold text-[#4a6741]">{formatRupiah(historySummary.totalOmzet)}</p>
              </div>
              <div className="bg-white rounded-xl shadow-sm p-4">
                <p className="text-[11px] text-[#6b7280]">Jumlah Transaksi</p>
                <p className="text-lg font-bold text-[#2d3436]">{historySummary.transactionCount}</p>
              </div>
              <div className="bg-white rounded-xl shadow-sm p-4">
                <p className="text-[11px] text-[#6b7280]">Cash</p>
                <p className="text-lg font-bold text-[#2d3436]">{historySummary.cashCount}x</p>
                <p className="text-[11px] text-[#6b7280]">{formatRupiah(historySummary.cashTotal)}</p>
              </div>
              <div className="bg-white rounded-xl shadow-sm p-4">
                <p className="text-[11px] text-[#6b7280]">QRIS</p>
                <p className="text-lg font-bold text-[#2d3436]">{historySummary.qrisCount}x</p>
                <p className="text-[11px] text-[#6b7280]">{formatRupiah(historySummary.qrisTotal)}</p>
              </div>
            </div>
          )}

          {/* List */}
          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[600px]">
                <thead>
                  <tr className="bg-[#f5f6fa]">
                    <th className="text-left text-xs font-medium text-[#4b5563] py-2.5 px-4">No. Transaksi</th>
                    <th className="text-left text-xs font-medium text-[#4b5563] py-2.5 px-4">Waktu</th>
                    <th className="text-left text-xs font-medium text-[#4b5563] py-2.5 px-4">Item</th>
                    <th className="text-left text-xs font-medium text-[#4b5563] py-2.5 px-4">Bayar</th>
                    <th className="text-right text-xs font-medium text-[#4b5563] py-2.5 px-4">Total</th>
                    <th className="w-20"></th>
                  </tr>
                </thead>
                <tbody>
                  {loadingHistory ? (
                    <tr>
                      <td colSpan={6} className="text-center py-10">
                        <Loader2 className="w-5 h-5 animate-spin mx-auto text-[#6b7280]" />
                      </td>
                    </tr>
                  ) : filteredHistoryOrders.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center py-10 text-sm text-[#6b7280]">
                        Belum ada transaksi POS di periode ini
                      </td>
                    </tr>
                  ) : (
                    filteredHistoryOrders.map((order) => (
                      <tr
                        key={order.id}
                        className="border-t border-[#f0f0f0] hover:bg-[#fafafa] transition-colors cursor-pointer"
                        onClick={() => setDetailOrder(order)}
                      >
                        <td className="py-2.5 px-4 text-sm font-semibold text-[#2d3436]">{order.orderNo}</td>
                        <td className="py-2.5 px-4 text-xs text-[#6b7280]">
                          {new Date(order.createdAt).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}
                        </td>
                        <td className="py-2.5 px-4 text-xs text-[#6b7280]">{order.orderItems.length} item</td>
                        <td className="py-2.5 px-4">
                          <Badge
                            variant="outline"
                            className={`text-[11px] px-2 py-0 rounded-full font-semibold ${
                              order.paymentMethod === 'Cash'
                                ? 'bg-[#4a6741]/10 text-[#4a6741] border-[#4a6741]/30'
                                : 'bg-[#2563eb]/10 text-[#2563eb] border-[#2563eb]/30'
                            }`}
                          >
                            {order.paymentMethod}
                          </Badge>
                        </td>
                        <td className="py-2.5 px-4 text-right text-sm font-semibold text-[#2d3436]">
                          {formatRupiah(order.totalAmount || 0)}
                        </td>
                        <td className="py-2.5 px-2 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                printReceipt(order, settings);
                              }}
                              title="Cetak ulang"
                              className="w-7 h-7 rounded-lg inline-flex items-center justify-center text-[#4b5563] hover:bg-[#f5f6fa] transition-colors cursor-pointer"
                            >
                              <Printer className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeleteTarget(order);
                              }}
                              title="Hapus transaksi"
                              className="w-7 h-7 rounded-lg inline-flex items-center justify-center text-[#dc2626] hover:bg-[#dc2626]/10 transition-colors cursor-pointer"
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
            <DialogTitle className="text-[#2d3436]">{detailOrder?.orderNo}</DialogTitle>
            <DialogDescription>
              {detailOrder && new Date(detailOrder.createdAt).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto space-y-2 py-2">
            {detailOrder?.orderItems.map((item) => (
              <div key={item.id} className="flex items-center justify-between text-sm py-1.5 border-b border-[#f0f0f0] last:border-0">
                <div className="min-w-0">
                  <p className="font-medium text-[#2d3436] truncate">{item.variant.product.sku}</p>
                  <p className="text-[11px] text-[#6b7280]">
                    {getVariantLabel(item.variant.color, item.variant.type)} · {item.qty} x {formatRupiah(item.unitPrice || 0)}
                  </p>
                </div>
                <span className="font-semibold text-[#2d3436] flex-shrink-0">{formatRupiah((item.unitPrice || 0) * item.qty)}</span>
              </div>
            ))}
          </div>
          {detailOrder && (
            <div className="border-t border-[#e8e8e8] pt-3 space-y-1 text-sm">
              <div className="flex justify-between text-[#6b7280]">
                <span>Subtotal</span>
                <span>{formatRupiah(detailOrder.subtotalAmount || 0)}</span>
              </div>
              {detailOrder.discountAmount > 0 && (
                <div className="flex justify-between text-[#d97706]">
                  <span>Diskon</span>
                  <span>-{formatRupiah(detailOrder.discountAmount)}</span>
                </div>
              )}
              <div className="flex justify-between text-base font-bold text-[#2d3436]">
                <span>Total</span>
                <span>{formatRupiah(detailOrder.totalAmount || 0)}</span>
              </div>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => detailOrder && setDeleteTarget(detailOrder)}
              className="rounded-lg border-[#dc2626]/30 text-[#dc2626] hover:bg-[#dc2626]/10 gap-1.5"
            >
              <Trash2 className="w-3.5 h-3.5" /> Hapus
            </Button>
            <Button variant="outline" onClick={() => setDetailOrder(null)} className="rounded-lg border-[#e8e8e8] text-[#4b5563]">
              Tutup
            </Button>
            <Button
              onClick={() => detailOrder && printReceipt(detailOrder, settings)}
              className="rounded-lg bg-[#4a6741] hover:bg-[#3d5535] text-white gap-1.5"
            >
              <Printer className="w-3.5 h-3.5" /> Cetak Ulang
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
                  <span className="font-semibold text-[#2d3436]">{deleteTarget.orderNo}</span> senilai{' '}
                  <span className="font-semibold text-[#2d3436]">{formatRupiah(deleteTarget.totalAmount || 0)}</span> akan
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
              className="rounded-lg bg-[#dc2626] hover:bg-[#b91c1c] text-white"
            >
              {deleting ? 'Menghapus...' : 'Hapus Transaksi'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ============ VARIANT PICKER DIALOG ============ */}
      <Dialog open={!!variantPickerProduct} onOpenChange={() => setVariantPickerProduct(null)}>
        <DialogContent className="sm:max-w-[400px] rounded-xl">
          <DialogHeader>
            <DialogTitle className="text-[#2d3436]">{variantPickerProduct?.sku}</DialogTitle>
            <DialogDescription>{variantPickerProduct?.name} — pilih varian</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5 max-h-[50vh] overflow-y-auto">
            {variantPickerProduct?.variants.map((variant) => (
              <button
                key={variant.id}
                onClick={() => {
                  addToCart(variantPickerProduct, variant);
                  setVariantPickerProduct(null);
                }}
                className="w-full flex items-center gap-3 p-2.5 rounded-lg hover:bg-[#f5f6fa] transition-colors cursor-pointer text-left"
              >
                <span className="w-5 h-5 rounded-full border border-[#e8e8e8] flex-shrink-0" style={{ backgroundColor: variant.colorHex }} />
                <span className="text-sm text-[#2d3436] flex-1">{getVariantLabel(variant.color, variant.type)}</span>
                <span className={`text-xs font-medium ${variant.qty === 0 ? 'text-[#dc2626]' : 'text-[#6b7280]'}`}>
                  Stok: {variant.qty}
                </span>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* ============ SUCCESS DIALOG ============ */}
      <Dialog open={!!successData} onOpenChange={() => setSuccessData(null)}>
        <DialogContent className="sm:max-w-[380px] rounded-xl text-center">
          <div className="flex flex-col items-center gap-3 py-4">
            <div className="w-14 h-14 rounded-full bg-[#15803d]/10 flex items-center justify-center">
              <CheckCircle2 className="w-8 h-8 text-[#15803d]" />
            </div>
            <div>
              <p className="text-sm text-[#6b7280]">Transaksi berhasil</p>
              <p className="text-lg font-bold text-[#2d3436]">{successData?.orderNo}</p>
            </div>
            <div className="w-full bg-[#f5f6fa] rounded-lg p-3 space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-[#6b7280]">Total</span>
                <span className="font-semibold text-[#2d3436]">{successData ? formatRupiah(successData.totalAmount || 0) : ''}</span>
              </div>
              {successData?.paymentMethod === 'Cash' && successData?.cashReceived != null && (
                <div className="flex justify-between">
                  <span className="text-[#6b7280]">Kembalian</span>
                  <span className="font-semibold text-[#2d3436]">
                    {formatRupiah(successData.cashReceived - (successData.totalAmount || 0))}
                  </span>
                </div>
              )}
            </div>

            <Button
              onClick={() => successData && printReceipt(successData, settings)}
              variant="outline"
              className="w-full h-10 rounded-lg border-[#e8e8e8] text-[#2d3436] gap-2"
            >
              <Printer className="w-4 h-4" /> Print Struk
            </Button>

            <div className="w-full flex gap-2">
              <Input
                value={waPhone}
                onChange={(e) => setWaPhone(e.target.value)}
                placeholder="08xxxxxxxxxx (opsional)"
                className="h-10 text-sm rounded-lg"
              />
              <Button
                onClick={() => successData && sendReceiptWhatsApp(successData, settings?.storeName || 'Solutive', waPhone)}
                disabled={!waPhone.trim()}
                variant="outline"
                className="h-10 rounded-lg border-[#e8e8e8] text-[#15803d] flex-shrink-0 gap-1.5 px-3"
              >
                <MessageCircle className="w-4 h-4" /> Kirim
              </Button>
            </div>
          </div>
          <Button onClick={() => setSuccessData(null)} className="w-full h-10 bg-[#4a6741] hover:bg-[#3d5535] text-white rounded-lg">
            Transaksi Baru
          </Button>
        </DialogContent>
      </Dialog>

      {/* ============ SETTINGS DIALOG ============ */}
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="sm:max-w-[440px] rounded-xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-[#2d3436]">Pengaturan Kasir</DialogTitle>
            <DialogDescription>Nama toko, kertas struk, dan preset — berlaku untuk semua transaksi POS</DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto space-y-4 py-2 pr-1">
            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-[#2d3436]">Nama Toko</Label>
              <Input value={editStoreName} onChange={(e) => setEditStoreName(e.target.value)} className="rounded-lg" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-[#2d3436]">Lebar Kertas Struk</Label>
              <div className="grid grid-cols-2 gap-2">
                {[58, 80].map((w) => (
                  <button
                    key={w}
                    onClick={() => setEditPaperWidth(w as 58 | 80)}
                    className={`h-9 rounded-lg text-sm font-medium border cursor-pointer ${
                      editPaperWidth === w ? 'bg-[#4a6741] text-white border-[#4a6741]' : 'bg-white text-[#4b5563] border-[#e8e8e8]'
                    }`}
                  >
                    {w}mm
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-[#2d3436]">Preset Diskon (Rp, pisah koma)</Label>
              <Input value={editDiscountPresets} onChange={(e) => setEditDiscountPresets(e.target.value)} placeholder="10000, 20000, 50000" className="rounded-lg" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-[#2d3436]">Preset Uang Cash (Rp, pisah koma)</Label>
              <Input value={editCashPresets} onChange={(e) => setEditCashPresets(e.target.value)} placeholder="50000, 100000, 150000" className="rounded-lg" />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setSettingsOpen(false)} className="rounded-lg border-[#e8e8e8] text-[#4b5563]">
              Batal
            </Button>
            <Button onClick={saveSettings} disabled={savingSettings} className="rounded-lg bg-[#4a6741] hover:bg-[#3d5535] text-white">
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
  const noPrice = product.price == null;
  const outOfStock = totalStock <= 0;

  return (
    <button
      onClick={onClick}
      className={`text-left rounded-xl border transition-all cursor-pointer p-3 bg-white border-[#e8e8e8] hover:shadow-md ${noPrice ? 'opacity-60' : ''}`}
    >
      <p className="font-semibold text-[#2d3436] truncate text-sm">{product.sku}</p>
      <p className="text-[11px] text-[#6b7280] truncate mb-1.5">{product.name}</p>
      {noPrice ? (
        <Badge className="text-[10px] px-1.5 py-0 rounded-full bg-[#dc2626]/10 text-[#dc2626] border-[#dc2626]/30 gap-1" variant="outline">
          <AlertTriangle className="w-2.5 h-2.5" /> Belum ada harga
        </Badge>
      ) : (
        <div className="flex items-center justify-between">
          <span className="font-bold text-[#4a6741] text-sm">{formatRupiah(product.price!)}</span>
          <span className={`text-[11px] font-medium ${outOfStock ? 'text-[#dc2626]' : 'text-[#6b7280]'}`}>
            Stok: {totalStock}
          </span>
        </div>
      )}
    </button>
  );
}
