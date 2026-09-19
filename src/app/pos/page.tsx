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
  Star,
  AlertTriangle,
  Loader2,
  CheckCircle2,
  ArrowLeft,
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
import { toast } from 'sonner';
import { getVariantLabel } from '@/lib/stock-sync';
import { lookupBarcode } from '@/components/dashboard/barcode-scanner';

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

// ============ HELPERS ============

function formatRupiah(n: number): string {
  return `Rp ${n.toLocaleString('id-ID')}`;
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

  const [successData, setSuccessData] = useState<{ orderNo: string; total: number; change: number | null } | null>(null);

  const [variantPickerProduct, setVariantPickerProduct] = useState<PosProduct | null>(null);

  const [settings, setSettings] = useState<PosSettingsData | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [editStoreName, setEditStoreName] = useState('');
  const [editPaperWidth, setEditPaperWidth] = useState<58 | 80>(58);
  const [editDiscountPresets, setEditDiscountPresets] = useState('');
  const [editCashPresets, setEditCashPresets] = useState('');
  const [editFavoriteIds, setEditFavoriteIds] = useState<Set<string>>(new Set());
  const [savingSettings, setSavingSettings] = useState(false);

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

  useEffect(() => {
    fetchProducts();
    fetchSettings();
  }, [fetchProducts, fetchSettings]);

  useEffect(() => {
    barcodeRef.current?.focus();
  }, []);

  const discountPresets = useMemo(() => (settings ? parsePresetList(settings.discountPresets) : []), [settings]);
  const cashPresets = useMemo(() => (settings ? parsePresetList(settings.cashPresets) : []), [settings]);
  const favoriteIds = useMemo(
    () => new Set((settings?.favoriteProductIds || '').split(',').map((s) => s.trim()).filter(Boolean)),
    [settings]
  );

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products;
    return products.filter((p) => p.sku.toLowerCase().includes(q) || p.name.toLowerCase().includes(q));
  }, [products, search]);

  const favoriteProducts = useMemo(() => filteredProducts.filter((p) => favoriteIds.has(p.id)), [filteredProducts, favoriteIds]);

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

      setSuccessData({ orderNo: data.order.orderNo, total: data.order.totalAmount, change: data.change });
      setCart([]);
      setDiscountAmount(0);
      setDiscountInput('');
      setPaymentMethod(null);
      setCashReceived('');
      fetchProducts();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal memproses transaksi');
    } finally {
      setCheckingOut(false);
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
    setEditFavoriteIds(new Set(favoriteIds));
    setSettingsOpen(true);
  };

  const toggleFavorite = (productId: string) => {
    setEditFavoriteIds((prev) => {
      const next = new Set(prev);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      return next;
    });
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
          favoriteProductIds: Array.from(editFavoriteIds),
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
        <button
          onClick={openSettings}
          className="p-2 rounded-lg hover:bg-[#f5f6fa] text-[#6b7280] hover:text-[#2d3436] transition-colors cursor-pointer"
          title="Pengaturan Kasir"
        >
          <SettingsIcon className="w-5 h-5" />
        </button>
      </div>

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
                {favoriteProducts.length > 0 && (
                  <div>
                    <div className="flex items-center gap-1.5 mb-2 text-[#d97706]">
                      <Star className="w-4 h-4 fill-[#d97706]" />
                      <span className="text-xs font-semibold">Produk Favorit</span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {favoriteProducts.map((product) => (
                        <ProductCard key={product.id} product={product} onClick={() => handleProductClick(product)} large />
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  {favoriteProducts.length > 0 && (
                    <p className="text-xs font-semibold text-[#6b7280] mb-2">Semua Produk</p>
                  )}
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
                <span className="font-semibold text-[#2d3436]">{successData ? formatRupiah(successData.total) : ''}</span>
              </div>
              {successData?.change != null && (
                <div className="flex justify-between">
                  <span className="text-[#6b7280]">Kembalian</span>
                  <span className="font-semibold text-[#2d3436]">{formatRupiah(successData.change)}</span>
                </div>
              )}
            </div>
            <p className="text-[11px] text-[#9ca3af]">Cetak struk & kirim WA tersedia di update berikutnya</p>
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
            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-[#2d3436]">Produk Favorit</Label>
              <p className="text-[11px] text-[#6b7280]">Ditampilkan lebih besar & di atas grid kasir</p>
              <div className="max-h-40 overflow-y-auto border border-[#e8e8e8] rounded-lg divide-y divide-[#f0f0f0]">
                {products.map((p) => (
                  <label key={p.id} className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-[#f5f6fa]">
                    <input
                      type="checkbox"
                      checked={editFavoriteIds.has(p.id)}
                      onChange={() => toggleFavorite(p.id)}
                      className="cursor-pointer"
                    />
                    <span className="font-medium text-[#2d3436]">{p.sku}</span>
                    <span className="text-[#6b7280] truncate">{p.name}</span>
                  </label>
                ))}
              </div>
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

function ProductCard({ product, onClick, large }: { product: PosProduct; onClick: () => void; large?: boolean }) {
  const totalStock = product.variants.reduce((sum, v) => sum + v.qty, 0);
  const noPrice = product.price == null;
  const outOfStock = totalStock <= 0;

  return (
    <button
      onClick={onClick}
      className={`text-left rounded-xl border transition-all cursor-pointer ${
        large ? 'p-4 bg-[#d97706]/5 border-[#d97706]/30' : 'p-3 bg-white border-[#e8e8e8]'
      } hover:shadow-md ${noPrice ? 'opacity-60' : ''}`}
    >
      <p className={`font-semibold text-[#2d3436] truncate ${large ? 'text-base' : 'text-sm'}`}>{product.sku}</p>
      <p className="text-[11px] text-[#6b7280] truncate mb-1.5">{product.name}</p>
      {noPrice ? (
        <Badge className="text-[10px] px-1.5 py-0 rounded-full bg-[#dc2626]/10 text-[#dc2626] border-[#dc2626]/30 gap-1" variant="outline">
          <AlertTriangle className="w-2.5 h-2.5" /> Belum ada harga
        </Badge>
      ) : (
        <div className="flex items-center justify-between">
          <span className={`font-bold text-[#4a6741] ${large ? 'text-lg' : 'text-sm'}`}>{formatRupiah(product.price!)}</span>
          <span className={`text-[11px] font-medium ${outOfStock ? 'text-[#dc2626]' : 'text-[#6b7280]'}`}>
            Stok: {totalStock}
          </span>
        </div>
      )}
    </button>
  );
}
