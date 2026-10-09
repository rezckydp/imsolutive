'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  Plus,
  Search,
  ChevronDown,
  ChevronRight,
  Pencil,
  Trash2,
  Package,
  X,
  Check,
  Link2,
  Layers,
  Download,
  Upload,
  Loader2,
  Tags,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { getVariantLabel } from '@/lib/stock-sync';
import { BoothStock } from '@/components/dashboard/booth-stock';
import { BundlePricing } from '@/components/dashboard/bundle-pricing';
import {
  VariantMatrixBuilder,
  buildVariantMatrixPayload,
  type MatrixBuilderHandle,
  type MatrixRow,
} from '@/components/dashboard/variant-matrix-builder';
import { MergeMatrixDialog } from '@/components/dashboard/merge-matrix-dialog';

// ============ TYPES ============

interface VariantData {
  id?: string;
  color: string;
  colorHex: string;
  qty: number;
  barcode: string;
  type?: string;
  price?: string;
  _delete?: boolean;
}

interface TypeVariantData {
  id?: string;
  type: string;
  qty: number;
  barcode: string;
  price?: string;
  _delete?: boolean;
}

interface NewProductData {
  sku: string;
  name: string;
  minStock: number;
  variants: VariantData[];
  productType: 'standalone' | 'variant';
  parentProductId: string;
}

interface ProductData {
  id: string;
  sku: string;
  name: string;
  minStock: number;
  estPrintMinutes?: number | null;
  variasi1Name?: string;
  parentProductId?: string | null;
  parentProduct?: { id: string; sku: string; name: string } | null;
  childProducts?: Array<{ id: string; sku: string; name: string }>;
  variants?: Array<{ id: string; color: string; colorHex: string; qty: number; barcode: string; type?: string; price?: number | null }>;
  _expanded?: boolean;
}

interface InlineEditingStock {
  variantId: string;
  productId: string;
  sku: string;
  minStock: number;
  currentQty: number;
}

// ============ PRESET COLORS (fallback if API fails) ============

const FALLBACK_COLORS = [
  { name: 'Black', hex: '#000000' },
  { name: 'White', hex: '#ffffff' },
  { name: 'Pink', hex: '#e91e63' },
  { name: 'Red', hex: '#e74c3c' },
  { name: 'Blue', hex: '#3498db' },
  { name: 'Sky Blue', hex: '#87ceeb' },
  { name: 'Grey', hex: '#9e9e9e' },
  { name: 'Yellow', hex: '#f1c40f' },
  { name: 'Brown', hex: '#795548' },
  { name: 'Light Brown', hex: '#d2a679' },
  { name: 'Purple', hex: '#9b59b6' },
  { name: 'Olive Green', hex: '#6b8e23' },
];

// ============ HELPERS ============

function getStockStatus(qty: number, minStock: number): { label: string; className: string } {
  if (qty === 0) return { label: 'Out', className: 'bg-[var(--danger)]/10 text-[var(--danger)] border-[var(--danger)]/30' };
  if (qty < minStock) return { label: 'Low', className: 'bg-[var(--warning)]/10 text-[var(--warning)] border-[var(--warning)]/30' };
  return { label: 'OK', className: 'bg-[var(--success)]/10 text-[var(--success)] border-[var(--success)]/30' };
}

function getTotalStock(product: ProductData): number {
  return product.variants?.reduce((sum, v) => sum + v.qty, 0) ?? 0;
}

function getProductTypeBadge(product: ProductData): { label: string; className: string } | null {
  if (product.parentProductId) {
    return { label: 'Varian', className: 'bg-[var(--info)]/10 text-[var(--info)] border-[var(--info)]/30' };
  }
  if (product.childProducts && product.childProducts.length > 0) {
    return { label: 'Master', className: 'bg-[var(--brand)]/10 text-[var(--brand)] border-[var(--brand)]/30' };
  }
  return null;
}

// ============ COLOR CIRCLE PICKER ============

function ColorCirclePicker({ colors, selectedHex, onSelect }: { colors: Array<{ name: string; hex: string }>; selectedHex: string; onSelect: (name: string, hex: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {colors.map((c) => {
        const isSelected = selectedHex === c.hex;
        return (
          <button
            key={c.hex}
            type="button"
            title={c.name}
            onClick={() => onSelect(c.name, c.hex)}
            className="relative w-7 h-7 rounded-full border-2 transition-all duration-150 cursor-pointer flex-shrink-0 hover:scale-110"
            style={{
              backgroundColor: c.hex,
              borderColor: isSelected ? '#2d3436' : 'transparent',
              boxShadow: isSelected ? `0 0 0 2px white, 0 0 0 4px #2d3436` : '0 1px 3px rgba(0,0,0,0.15)',
            }}
          >
            {isSelected && (
              <Check className="w-3.5 h-3.5 text-white absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 drop-shadow-sm" />
            )}
          </button>
        );
      })}
    </div>
  );
}

// ============ INLINE STOCK INPUT ============

function InlineStockInput({
  value,
  onSave,
  onCancel,
  loading,
}: {
  value: number;
  onSave: (newQty: number) => void;
  onCancel: () => void;
  loading: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [tempValue, setTempValue] = useState(String(value));

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      const qty = parseInt(tempValue);
      if (!isNaN(qty) && qty >= 0) {
        onSave(qty);
      }
    }
    if (e.key === 'Escape') {
      onCancel();
    }
  };

  const handleBlur = () => {
    const qty = parseInt(tempValue);
    if (!isNaN(qty) && qty >= 0) {
      onSave(qty);
    } else {
      onCancel();
    }
  };

  return (
    <div className="flex items-center gap-1 justify-end">
      {loading && <Loader2 className="w-3 h-3 animate-spin text-[var(--brand)]" />}
      <Input
        ref={inputRef}
        type="number"
        min={0}
        value={tempValue}
        onChange={(e) => setTempValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        disabled={loading}
        className="h-6 w-16 text-xs text-right bg-[var(--card)] border-[var(--brand)] focus:border-[var(--brand)] rounded px-1.5 py-0 ml-auto"
      />
    </div>
  );
}

// ============ MAIN COMPONENT ============

export function StockManagement() {
  const [mainTab, setMainTab] = useState<'produk' | 'booth' | 'promo'>('produk');
  const [products, setProducts] = useState<ProductData[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  // Edit state
  const [editProduct, setEditProduct] = useState<ProductData | null>(null);
  const [editSku, setEditSku] = useState('');
  const [editName, setEditName] = useState('');
  const [editMinStock, setEditMinStock] = useState(10);
  const [reparentTargetSku, setReparentTargetSku] = useState('');
  const [reparentConfirmOpen, setReparentConfirmOpen] = useState(false);
  const [reparenting, setReparenting] = useState(false);
  const [editEstPrintMinutes, setEditEstPrintMinutes] = useState<string>('');
  const [saving, setSaving] = useState(false);

  // Add Product state
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [mergeDialogOpen, setMergeDialogOpen] = useState(false);
  const [newProduct, setNewProduct] = useState<NewProductData>({
    sku: '',
    name: '',
    minStock: 10,
    variants: [{ color: '', colorHex: '#000000', qty: 0, barcode: '' }],
    productType: 'standalone',
    parentProductId: '',
  });
  const [creating, setCreating] = useState(false);

  // Add Product — Type variants seed data (merged into the matrix builder's
  // initial rows — see addMatrixInitialRows below)
  const [typeVariants, setTypeVariants] = useState<Array<TypeVariantData>>([]);

  // Delete confirm state
  const [deleteTarget, setDeleteTarget] = useState<ProductData | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Inline stock editing state
  const [inlineEditingStock, setInlineEditingStock] = useState<InlineEditingStock | null>(null);
  const [inlineStockLoading, setInlineStockLoading] = useState(false);

  // Import state
  const [importing, setImporting] = useState(false);

  // Database colors for Quick Color picker
  const [dbColors, setDbColors] = useState<Array<{ name: string; hex: string }>>(FALLBACK_COLORS);

  // Fetch colors from database (active only)
  const fetchColors = useCallback(async () => {
    try {
      const res = await fetch('/api/colors');
      if (res.ok) {
        const data = await res.json();
        const activeColors = data
          .filter((c: { status: string }) => c.status === 'Active')
          .map((c: { name: string; hexCode: string }) => ({ name: c.name, hex: c.hexCode }));
        if (activeColors.length > 0) {
          setDbColors(activeColors);
        }
      }
    } catch {
      // silent — use fallback
    }
  }, []);

  // Master products for dropdown (only masters/standalone with no parent)
  const masterProducts = products.filter((p) => !p.parentProductId);

  // ============ VARIANT MATRIX BUILDER WIRING ============
  const addMatrixRef = useRef<MatrixBuilderHandle>(null);
  const editMatrixRef = useRef<MatrixBuilderHandle>(null);

  // Seed rows for the Add dialog's matrix builder from newProduct.variants /
  // typeVariants (already populated correctly by openAddDialog/handleParentSelect
  // below) — a brand new standalone product seeds empty so the builder shows
  // its "add a color" empty state instead of one phantom blank row.
  const addMatrixInitialRows = useMemo<MatrixRow[]>(() => {
    const colorRows: MatrixRow[] = newProduct.variants
      .filter((v) => v.color.trim() || v.type?.trim())
      .map((v) => ({
        color: v.color,
        colorHex: v.colorHex,
        variasi1: v.type || '',
        price: '',
        qty: v.qty,
        barcode: v.barcode,
      }));
    const typeRows: MatrixRow[] = typeVariants
      .filter((tv) => tv.type.trim())
      .map((tv) => ({
        color: '',
        colorHex: '#2d3436',
        variasi1: tv.type,
        price: '',
        qty: tv.qty,
        barcode: tv.barcode,
      }));
    return [...colorRows, ...typeRows];
  }, [newProduct.variants, typeVariants]);

  const addMatrixInitialVariasi1Name = newProduct.parentProductId
    ? masterProducts.find((p) => p.id === newProduct.parentProductId)?.variasi1Name || ''
    : '';

  const editMatrixInitialRows = useMemo<MatrixRow[]>(() => {
    if (!editProduct) return [];
    return (editProduct.variants || []).map((v) => ({
      id: v.id,
      color: v.color,
      colorHex: v.colorHex,
      variasi1: v.type || '',
      price: v.price != null ? String(v.price) : '',
      qty: v.qty,
      barcode: v.barcode || '',
    }));
  }, [editProduct]);

  // Fetch products
  const fetchProducts = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/products?limit=100');
      if (!res.ok) throw new Error('Failed');
      const data = await res.json();
      setProducts(data.products || []);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchProducts(); }, [fetchProducts]);
  useEffect(() => { fetchColors(); }, [fetchColors]);

  // Organize products: masters first, then their children indented
  const organizedProducts = products.filter((p) => !p.parentProductId);
  const childrenMap = new Map<string, ProductData[]>();
  products.forEach((p) => {
    if (p.parentProductId) {
      const existing = childrenMap.get(p.parentProductId) || [];
      existing.push(p);
      childrenMap.set(p.parentProductId, existing);
    }
  });

  // Filter products (search across masters and children)
  const filteredMasters = organizedProducts.filter((master) => {
    if (!search) return true;
    const s = search.toLowerCase();
    if (master.sku.toLowerCase().includes(s) || master.name.toLowerCase().includes(s)) return true;
    const children = childrenMap.get(master.id) || [];
    return children.some((c) => c.sku.toLowerCase().includes(s) || c.name.toLowerCase().includes(s));
  });

  // Toggle expand
  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // ============ INLINE STOCK EDITING ============

  const handleInlineStockSave = async (productId: string, sku: string, variantId: string, newQty: number, _minStock: number) => {
    setInlineStockLoading(true);
    try {
      // Find the product to build the full variants array
      const product = products.find((p) => p.id === productId);
      if (!product || !product.variants) {
        setInlineEditingStock(null);
        setInlineStockLoading(false);
        return;
      }

      // Build variants array with the updated qty for the target variant
      const variants = product.variants.map((v) => ({
        id: v.id,
        color: v.color,
        colorHex: v.colorHex,
        qty: v.id === variantId ? newQty : v.qty,
        barcode: v.barcode || '',
        type: v.type || '',
      }));

      const res = await fetch(`/api/products/${encodeURIComponent(sku)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ variants }),
      });

      if (!res.ok) {
        const data = await res.json();
        alert(data.error || 'Failed to update stock');
      } else {
        // Refetch products on success
        fetchProducts();
      }
    } catch {
      alert('Failed to update stock. Try again.');
    } finally {
      setInlineEditingStock(null);
      setInlineStockLoading(false);
    }
  };

  // ============ ADD PRODUCT ============

  const openAddDialog = () => {
    setNewProduct({
      sku: '',
      name: '',
      minStock: 10,
      variants: [{ color: '', colorHex: '#000000', qty: 0, barcode: '' }],
      productType: 'standalone',
      parentProductId: '',
    });
    setTypeVariants([]);
    setShowAddDialog(true);
  };

  // When parent is selected, auto-fill colors from master
  const handleParentSelect = (parentId: string) => {
    setNewProduct((prev) => ({ ...prev, parentProductId: parentId }));

    if (!parentId) {
      setNewProduct((prev) => ({
        ...prev,
        parentProductId: '',
        productType: 'standalone',
        variants: [{ color: '', colorHex: '#000000', qty: 0, barcode: '' }],
      }));
      return;
    }

    const parent = products.find((p) => p.id === parentId);
    if (parent && parent.variants && parent.variants.length > 0) {
      // Separate parent variants into color and type
      const parentColorVariants: VariantData[] = [];
      const parentTypeVariants: TypeVariantData[] = [];
      parent.variants.forEach((v) => {
        const hasColor = v.color && v.color.trim() !== '';
        const hasType = v.type && v.type.trim() !== '';
        if (hasType && !hasColor) {
          parentTypeVariants.push({
            type: v.type || '',
            qty: v.qty,
            barcode: '',
          });
        } else {
          parentColorVariants.push({
            color: v.color,
            colorHex: v.colorHex,
            qty: v.qty,
            barcode: '',
            type: v.type || '',
          });
        }
      });
      // Clone master's variants but with empty barcode and synced qty
      setNewProduct((prev) => ({
        ...prev,
        parentProductId: parentId,
        productType: 'variant',
        minStock: parent.minStock,
        variants: parentColorVariants.length > 0 ? parentColorVariants : [{ color: '', colorHex: '#000000', qty: 0, barcode: '' }],
      }));
      setTypeVariants(parentTypeVariants);
    }
  };

  const handleCreateProduct = async () => {
    if (!newProduct.sku.trim() || !newProduct.name.trim()) {
      alert('SKU dan Nama Produk wajib diisi.');
      return;
    }

    setCreating(true);
    try {
      const rows = addMatrixRef.current?.getRows() ?? [];
      const variasi1Name = addMatrixRef.current?.getVariasi1Name() ?? '';

      if (newProduct.productType === 'standalone' && rows.length === 0) {
        alert('Produk harus memiliki minimal 1 varian (warna atau type).');
        setCreating(false);
        return;
      }

      const payload: Record<string, unknown> = {
        sku: newProduct.sku.trim(),
        name: newProduct.name.trim(),
        minStock: newProduct.minStock,
        variasi1Name,
      };

      if (newProduct.productType === 'variant' && newProduct.parentProductId) {
        payload.parentProductId = newProduct.parentProductId;
      }
      if (rows.length > 0) {
        // No original ids on a brand-new product — every row is a create.
        payload.variants = buildVariantMatrixPayload([], rows);
      }

      const res = await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || 'Gagal membuat produk');
        setCreating(false);
        return;
      }
      setShowAddDialog(false);
      fetchProducts();
    } catch {
      alert('Gagal membuat produk. Coba lagi.');
    } finally {
      setCreating(false);
    }
  };

  // ============ DELETE PRODUCT ============

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/products/${deleteTarget.sku}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || 'Gagal menghapus produk');
        setDeleting(false);
        return;
      }
      setDeleteTarget(null);
      fetchProducts();
    } catch {
      alert('Gagal menghapus produk. Coba lagi.');
    } finally {
      setDeleting(false);
    }
  };

  // ============ EDIT PRODUCT ============

  const openEdit = (product: ProductData) => {
    setEditSku(product.sku);
    setEditName(product.name);
    setEditMinStock(product.minStock);
    setEditEstPrintMinutes(product.estPrintMinutes != null ? String(product.estPrintMinutes) : '');
    setReparentTargetSku(product.parentProduct?.sku || '');
    // Variant rows themselves are derived straight from product.variants via
    // editMatrixInitialRows — no separate state to populate here anymore.
    setEditProduct(product);
  };

  const isVariant = editProduct?.parentProductId;
  const isMaster = editProduct && !editProduct?.parentProductId && (editProduct?.childProducts?.length ?? 0) > 0;

  const handleSave = async () => {
    if (!editProduct) return;
    setSaving(true);
    try {
      const rows = editMatrixRef.current?.getRows() ?? [];
      const variasi1Name = editMatrixRef.current?.getVariasi1Name() ?? '';
      const originalIds = (editProduct.variants || []).map((v) => v.id);
      const variantsPayload = buildVariantMatrixPayload(originalIds, rows);

      const res = await fetch(`/api/products/${editProduct.sku}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sku: editSku.trim(),
          name: editName,
          minStock: editMinStock,
          estPrintMinutes: editEstPrintMinutes.trim() ? parseInt(editEstPrintMinutes, 10) : null,
          variasi1Name,
          variants: variantsPayload,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        alert(data.error || 'Gagal menyimpan');
        setSaving(false);
        return;
      }

      setEditProduct(null);
      fetchProducts();
    } catch {
      alert('Gagal menyimpan. Coba lagi.');
    } finally {
      setSaving(false);
    }
  };

  // ============ REPARENT (move child SKU to a different Master) ============

  const handleReparent = async () => {
    if (!editProduct || !reparentTargetSku) return;
    setReparenting(true);
    try {
      const res = await fetch(`/api/products/${editProduct.sku}/reparent`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newParentSku: reparentTargetSku }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || 'Gagal memindahkan ke Master baru');
        setReparenting(false);
        return;
      }
      setReparentConfirmOpen(false);
      setEditProduct(null);
      fetchProducts();
    } catch {
      alert('Gagal memindahkan ke Master baru. Coba lagi.');
    } finally {
      setReparenting(false);
    }
  };

  // ============ IMPORT EXCEL ============

  const handleDownloadTemplate = async () => {
    try {
      const res = await fetch('/api/products/import/template');
      if (!res.ok) throw new Error('Failed to download template');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'product_import_template.xlsx';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch {
      alert('Failed to download template. Try again.');
    }
  };

  const handleImportExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset the input so the same file can be re-selected
    e.target.value = '';

    setImporting(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/products/import', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data.error || 'Failed to import products');
        return;
      }

      const { created, skipped, errors } = data;
      let message = `Import complete: ${created} created, ${skipped} skipped.`;
      if (errors && errors.length > 0) {
        message += `\n\nErrors:\n${errors.join('\n')}`;
      }
      alert(message);
      fetchProducts();
    } catch {
      alert('Failed to import products. Try again.');
    } finally {
      setImporting(false);
    }
  };

  // ============ RENDER ============

  // Helper to determine if a product is editable (Master or Standalone)
  const isProductEditable = (product: ProductData) => !product.parentProductId;

  return (
    <div>
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[var(--t-heading)]">Stock Management</h1>
          <p className="text-sm text-[var(--t-body)] mt-1">Manage products & inventory</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            onClick={handleDownloadTemplate}
            className="text-sm font-medium rounded-lg flex items-center gap-2 h-10 px-4 border-[var(--bd)] hover:bg-[var(--surface)] cursor-pointer"
          >
            <Download className="w-4 h-4" />
            Download Template
          </Button>
          <Button
            variant="outline"
            onClick={() => document.getElementById('import-excel-input')?.click()}
            disabled={importing}
            className="text-sm font-medium rounded-lg flex items-center gap-2 h-10 px-4 border-[var(--bd)] hover:bg-[var(--surface)] cursor-pointer"
          >
            {importing ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Upload className="w-4 h-4" />
            )}
            Import Excel
          </Button>
          <input
            id="import-excel-input"
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={handleImportExcel}
          />
          <Button
            variant="outline"
            onClick={() => setMergeDialogOpen(true)}
            className="text-sm font-medium rounded-lg flex items-center gap-2 h-10 px-4 border-[var(--bd)] hover:bg-[var(--surface)] cursor-pointer"
          >
            <Layers className="w-4 h-4" />
            Gabung ke Matrix
          </Button>
          <Button
            onClick={openAddDialog}
            className="bg-[var(--brand)] hover:bg-[var(--brand-dark)] text-white text-sm font-semibold rounded-lg flex items-center gap-2 h-10 px-4 shadow-sm cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Add Product
          </Button>
        </div>
      </div>

      <MergeMatrixDialog
        open={mergeDialogOpen}
        onClose={() => setMergeDialogOpen(false)}
        onMerged={fetchProducts}
      />

      {/* Main Tab Switcher: Produk vs Booth Stock */}
      <div className="flex items-center bg-[var(--surface)] rounded-lg p-0.5 mb-4 w-fit">
        <button
          onClick={() => setMainTab('produk')}
          className={`px-4 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer ${
            mainTab === 'produk' ? 'bg-[var(--card)] text-[var(--brand)] shadow-sm' : 'text-[var(--t-body)] hover:text-[var(--t-heading)]'
          }`}
        >
          Produk
        </button>
        <button
          onClick={() => setMainTab('booth')}
          className={`px-4 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer ${
            mainTab === 'booth' ? 'bg-[var(--card)] text-[var(--brand)] shadow-sm' : 'text-[var(--t-body)] hover:text-[var(--t-heading)]'
          }`}
        >
          Booth Stock
        </button>
        <button
          onClick={() => setMainTab('promo')}
          className={`px-4 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer ${
            mainTab === 'promo' ? 'bg-[var(--card)] text-[var(--brand)] shadow-sm' : 'text-[var(--t-body)] hover:text-[var(--t-heading)]'
          }`}
        >
          Promo Harga
        </button>
      </div>

      {mainTab === 'booth' && <BoothStock />}
      {mainTab === 'promo' && <BundlePricing />}

      {mainTab === 'produk' && (
      <>
      {/* Search */}
      <div className="bg-[var(--card)] rounded-xl shadow-sm p-4 mb-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--t-muted)]" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by SKU or product name..."
            className="pl-10 text-sm bg-[var(--surface)] border-[var(--bd)] rounded-lg h-10"
          />
        </div>
      </div>

      {/* Product List */}
      <div className="bg-[var(--card)] rounded-xl shadow-sm overflow-x-auto -webkit-overflow-scrolling-touch">
        {/* Table Header */}
        <div className="grid grid-cols-[1.8fr_0.6fr_0.8fr_auto] gap-2 px-4 py-3 bg-[var(--surface)] border-b border-[var(--bd)] min-w-[450px]">
          <span className="text-xs font-medium text-[var(--t-body)]">Product</span>
          <span className="text-xs font-medium text-[var(--t-body)] text-center">Total Stock</span>
          <span className="text-xs font-medium text-[var(--t-body)] text-center">Type</span>
          <span className="text-xs font-medium text-[var(--t-body)] text-right">Action</span>
        </div>

        {/* Loading */}
        {loading && (
          <div className="p-4 space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-12 w-full rounded-lg" />
            ))}
          </div>
        )}

        {/* Empty */}
        {!loading && filteredMasters.length === 0 && (
          <div className="py-12 text-center">
            <Package className="w-10 h-10 text-[var(--t-muted)] mx-auto mb-3" />
            <p className="text-sm text-[var(--t-muted)]">
              {search ? 'No products match your search' : 'No products yet'}
            </p>
          </div>
        )}

        {/* Product Rows */}
        {!loading && <div className="min-w-[450px]">{filteredMasters.map((master) => {
          const totalStock = getTotalStock(master);
          const isExpanded = expandedIds.has(master.id);
          const hasVariants = master.variants && master.variants.length > 0;
          const hasChildren = (childrenMap.get(master.id) || []).length > 0;
          const typeBadge = getProductTypeBadge(master);
          const children = childrenMap.get(master.id) || [];
          const editable = isProductEditable(master);

          return (
            <div key={master.id}>
              {/* Master / Standalone Row */}
              <div
                className={`grid grid-cols-[1.8fr_0.6fr_0.8fr_auto] gap-2 px-4 py-3 border-b border-[var(--surface-2)] hover:bg-[var(--surface-hover)] transition-colors items-center cursor-pointer ${hasChildren || hasVariants ? '' : ''}`}
                onClick={() => (hasChildren || hasVariants) && toggleExpand(master.id)}
              >
                <div className="flex items-center gap-2 min-w-0">
                  {(hasChildren || hasVariants) && (
                    isExpanded
                      ? <ChevronDown className="w-4 h-4 text-[var(--t-muted)] flex-shrink-0" />
                      : <ChevronRight className="w-4 h-4 text-[var(--t-muted)] flex-shrink-0" />
                  )}
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-[var(--t-heading)]">{master.name}</span>
                      {typeBadge && (
                        <Badge className={`text-[11px] px-1.5 py-0 rounded-full font-semibold ${typeBadge.className}`} variant="outline">
                          {typeBadge.label}
                        </Badge>
                      )}
                    </div>
                    <span className="text-xs text-[var(--t-body)] truncate block">{master.sku}</span>
                    {hasVariants && !isExpanded && (
                      <div className="flex -space-x-1 mt-1">
                        {master.variants!.slice(0, 5).map((v) => (
                          <div
                            key={v.id}
                            className="w-4 h-4 rounded-full border-2 border-white shadow-sm"
                            style={{ backgroundColor: v.colorHex }}
                            title={v.color}
                          />
                        ))}
                        {master.variants!.length > 5 && (
                          <span className="text-[11px] text-[var(--t-muted)] ml-1">+{master.variants!.length - 5}</span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                <div className="text-center">
                  <span className={`text-sm font-bold ${totalStock === 0 ? 'text-[var(--danger)]' : totalStock < master.minStock ? 'text-[var(--warning)]' : 'text-[var(--t-heading)]'}`}>
                    {totalStock}
                  </span>
                </div>
                <div className="text-center">
                  {typeBadge ? (
                    <Badge className={`text-[11px] px-1.5 py-0 rounded-full font-semibold ${typeBadge.className}`} variant="outline">
                      {typeBadge.label}
                    </Badge>
                  ) : (
                    <span className="text-[11px] text-[var(--t-muted)]">Standalone</span>
                  )}
                </div>
                <div className="flex items-center gap-2 justify-end" onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={() => openEdit(master)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[var(--brand)] bg-[var(--brand)]/5 hover:bg-[var(--brand)]/10 rounded-lg transition-colors cursor-pointer"
                  >
                    <Pencil className="w-3 h-3" />
                    Edit
                  </button>
                  <button
                    onClick={() => setDeleteTarget(master)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[var(--danger)] bg-[var(--danger)]/5 hover:bg-[var(--danger)]/10 rounded-lg transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-3 h-3" />
                    Delete
                  </button>
                </div>
              </div>

              {/* Expanded: Child Variant Products (SKU Varian) */}
              {isExpanded && hasChildren && (
                <div className="border-b border-[var(--surface-2)]">
                  {children.map((child) => {
                    const childStock = getTotalStock(child);
                    const childTypeBadge = getProductTypeBadge(child);
                    const childHasVariants = child.variants && child.variants.length > 0;
                    const childEditable = isProductEditable(child);

                    return (
                      <div
                        key={child.id}
                        className="grid grid-cols-[1.8fr_0.6fr_0.8fr_auto] gap-2 px-4 py-2.5 pl-10 bg-[var(--surface-tint-2)] border-b border-[var(--surface-2)] hover:bg-[var(--surface-tint-4)] transition-colors items-center cursor-pointer"
                        onClick={() => childHasVariants && toggleExpand(child.id)}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <Link2 className="w-3.5 h-3.5 text-[var(--info)] flex-shrink-0" />
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-medium text-[var(--t-heading)]">{child.name}</span>
                              {childTypeBadge && (
                                <Badge className={`text-[11px] px-1.5 py-0 rounded-full font-semibold ${childTypeBadge.className}`} variant="outline">
                                  {childTypeBadge.label}
                                </Badge>
                              )}
                            </div>
                            <span className="text-xs text-[var(--t-body)] truncate block">{child.sku}</span>
                            {childHasVariants && !expandedIds.has(child.id) && (
                              <div className="flex -space-x-1 mt-1">
                                {child.variants!.slice(0, 5).map((v) => (
                                  <div
                                    key={v.id}
                                    className="w-3.5 h-3.5 rounded-full border-2 border-white shadow-sm"
                                    style={{ backgroundColor: v.colorHex }}
                                    title={`${v.color}: ${v.qty}`}
                                  />
                                ))}
                                {child.variants!.length > 5 && (
                                  <span className="text-[11px] text-[var(--t-muted)] ml-1">+{child.variants!.length - 5}</span>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="text-center">
                          <span className={`text-sm font-bold ${childStock === 0 ? 'text-[var(--danger)]' : childStock < child.minStock ? 'text-[var(--warning)]' : 'text-[var(--t-heading)]'}`}>
                            {childStock}
                          </span>
                          {!childEditable && <div className="text-[11px] text-[var(--info)]">synced</div>}
                        </div>
                        <div className="text-center">
                          {childTypeBadge ? (
                            <Badge className={`text-[11px] px-1.5 py-0 rounded-full font-semibold ${childTypeBadge.className}`} variant="outline">
                              {childTypeBadge.label}
                            </Badge>
                          ) : (
                            <span className="text-[11px] text-[var(--t-muted)]">Varian</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 justify-end" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => openEdit(child)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[var(--brand)] bg-[var(--brand)]/5 hover:bg-[var(--brand)]/10 rounded-lg transition-colors cursor-pointer"
                          >
                            <Pencil className="w-3 h-3" />
                            Edit
                          </button>
                          <button
                            onClick={() => setDeleteTarget(child)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[var(--danger)] bg-[var(--danger)]/5 hover:bg-[var(--danger)]/10 rounded-lg transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-3 h-3" />
                            Delete
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Expanded: Variant Details (Master/Standalone) */}
              {isExpanded && hasVariants && editable && (
                <div className="bg-[var(--surface-hover)] border-b border-[var(--surface-2)] px-6 py-3">
                  <div className="grid grid-cols-[1fr_1fr_0.6fr] gap-2 mb-2 px-2">
                    <span className="text-[11px] font-medium text-[var(--t-muted)]">Variant</span>
                    <span className="text-[11px] font-medium text-[var(--t-muted)] text-right">Stock</span>
                    <span className="text-[11px] font-medium text-[var(--t-muted)] text-center">Status</span>
                  </div>
                  {master.variants!.map((variant) => {
                    const cs = getStockStatus(variant.qty, master.minStock);
                    const isEditing = inlineEditingStock?.variantId === variant.id && inlineEditingStock?.productId === master.id;
                    const label = getVariantLabel(variant.color, variant.type || '');
                    const hasColor = variant.color && variant.color.trim() !== '';
                    const hasType = variant.type && variant.type.trim() !== '';

                    return (
                      <div
                        key={variant.id}
                        className="grid grid-cols-[1fr_1fr_0.6fr] gap-2 px-2 py-1.5 items-center rounded-lg hover:bg-[var(--card)] transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          {hasColor ? (
                            <div
                              className="w-5 h-5 rounded-full border border-[var(--bd)] flex-shrink-0 shadow-sm"
                              style={{ backgroundColor: variant.colorHex }}
                            />
                          ) : null}
                          {hasType ? (
                            <Badge className="text-[11px] px-1.5 py-0 rounded-full bg-[var(--brand)]/10 text-[var(--brand)] border-[var(--brand)]/30 font-medium" variant="outline">
                              <Tags className="w-2.5 h-2.5 mr-0.5" />
                              {variant.type}
                            </Badge>
                          ) : null}
                          <span className="text-xs text-[var(--t-heading)] font-medium">{label}</span>
                        </div>
                        {isEditing ? (
                          <InlineStockInput
                            value={inlineEditingStock.currentQty}
                            onSave={(newQty) =>
                              handleInlineStockSave(master.id, master.sku, variant.id, newQty, master.minStock)
                            }
                            onCancel={() => setInlineEditingStock(null)}
                            loading={inlineStockLoading}
                          />
                        ) : (
                          <div
                            className="flex items-center gap-1 justify-end cursor-pointer group"
                            onClick={() =>
                              setInlineEditingStock({
                                variantId: variant.id,
                                productId: master.id,
                                sku: master.sku,
                                minStock: master.minStock,
                                currentQty: variant.qty,
                              })
                            }
                          >
                            <span className={`text-xs font-semibold ${variant.qty === 0 ? 'text-[var(--danger)]' : 'text-[var(--t-heading)]'}`}>
                              {variant.qty}
                            </span>
                            <Pencil className="w-2.5 h-2.5 text-[var(--t-muted)] opacity-0 group-hover:opacity-100 transition-opacity" />
                          </div>
                        )}
                        <div className="text-center">
                          <Badge className={`text-[11px] px-1.5 py-0 rounded-full font-semibold ${cs.className}`} variant="outline">
                            {cs.label}
                          </Badge>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Expanded: Variant Details (Child Variant — read-only stock) */}
              {isExpanded && hasVariants && !editable && (
                <div className="bg-[var(--surface-hover)] border-b border-[var(--surface-2)] px-6 py-3">
                  <div className="grid grid-cols-[1fr_1fr_0.6fr] gap-2 mb-2 px-2">
                    <span className="text-[11px] font-medium text-[var(--t-muted)]">Variant</span>
                    <span className="text-[11px] font-medium text-[var(--t-muted)] text-right">Stock</span>
                    <span className="text-[11px] font-medium text-[var(--t-muted)] text-center">Status</span>
                  </div>
                  {master.variants!.map((variant) => {
                    const cs = getStockStatus(variant.qty, master.minStock);
                    const label = getVariantLabel(variant.color, variant.type || '');
                    const hasColor = variant.color && variant.color.trim() !== '';
                    const hasType = variant.type && variant.type.trim() !== '';
                    return (
                      <div
                        key={variant.id}
                        className="grid grid-cols-[1fr_1fr_0.6fr] gap-2 px-2 py-1.5 items-center rounded-lg hover:bg-[var(--card)] transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          {hasColor ? (
                            <div
                              className="w-5 h-5 rounded-full border border-[var(--bd)] flex-shrink-0 shadow-sm"
                              style={{ backgroundColor: variant.colorHex }}
                            />
                          ) : null}
                          {hasType ? (
                            <Badge className="text-[11px] px-1.5 py-0 rounded-full bg-[var(--brand)]/10 text-[var(--brand)] border-[var(--brand)]/30 font-medium" variant="outline">
                              <Tags className="w-2.5 h-2.5 mr-0.5" />
                              {variant.type}
                            </Badge>
                          ) : null}
                          <span className="text-xs text-[var(--t-heading)] font-medium">{label}</span>
                        </div>
                        <div className="flex items-center gap-1 justify-end">
                          <span className={`text-xs font-semibold ${variant.qty === 0 ? 'text-[var(--danger)]' : 'text-[var(--t-heading)]'}`}>
                            {variant.qty}
                          </span>
                          <span className="text-[11px] text-[var(--info)] ml-1">synced</span>
                        </div>
                        <div className="text-center">
                          <Badge className={`text-[11px] px-1.5 py-0 rounded-full font-semibold ${cs.className}`} variant="outline">
                            {cs.label}
                          </Badge>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}</div>}
      </div>
      </>
      )}

      {/* ============ ADD PRODUCT DIALOG ============ */}
      <Dialog open={showAddDialog} onOpenChange={(open) => !open && setShowAddDialog(false)}>
        <DialogContent className="sm:max-w-2xl rounded-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-[var(--t-heading)] flex items-center gap-2">
              <Plus className="w-5 h-5 text-[var(--brand)]" />
              Add New Product
            </DialogTitle>
            <DialogDescription className="text-[var(--t-body)]">
              Buat produk baru dengan varian warna dan/atau type.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Product Type */}
            <div className="space-y-2">
              <Label className="text-sm font-medium text-[var(--t-heading)]">Product Type</Label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setNewProduct({
                      ...newProduct,
                      productType: 'standalone',
                      parentProductId: '',
                      minStock: 10,
                    });
                  }}
                  className={`p-3 rounded-lg border-2 text-left transition-all cursor-pointer ${
                    newProduct.productType === 'standalone'
                      ? 'border-[var(--brand)] bg-[var(--brand)]/5'
                      : 'border-[var(--bd)] hover:border-[var(--t-muted-2)]'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Package className="w-4 h-4" style={{ color: newProduct.productType === 'standalone' ? '#4a6741' : '#6b7280' }} />
                    <span className="text-sm font-semibold" style={{ color: newProduct.productType === 'standalone' ? '#4a6741' : '#4b5563' }}>
                      Standalone
                    </span>
                  </div>
                  <span className="text-[11px] text-[var(--t-muted)]">Stok independen per warna</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setNewProduct({
                      ...newProduct,
                      productType: 'variant',
                    });
                  }}
                  className={`p-3 rounded-lg border-2 text-left transition-all cursor-pointer ${
                    newProduct.productType === 'variant'
                      ? 'border-[var(--info)] bg-[var(--info)]/5'
                      : 'border-[var(--bd)] hover:border-[var(--t-muted-2)]'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Layers className="w-4 h-4" style={{ color: newProduct.productType === 'variant' ? '#2563eb' : '#6b7280' }} />
                    <span className="text-sm font-semibold" style={{ color: newProduct.productType === 'variant' ? '#2563eb' : '#4b5563' }}>
                      Varian dari Master
                    </span>
                  </div>
                  <span className="text-[11px] text-[var(--t-muted)]">Stok sync dari Master SKU</span>
                </button>
              </div>
            </div>

            {/* Master Selection (only for variant type) */}
            {newProduct.productType === 'variant' && (
              <div className="space-y-1.5">
                <Label className="text-sm font-medium text-[var(--t-heading)]">Master SKU *</Label>
                <Select value={newProduct.parentProductId} onValueChange={handleParentSelect}>
                  <SelectTrigger className="h-10 text-sm bg-[var(--surface)] border-[var(--bd)] rounded-lg">
                    <SelectValue placeholder="Pilih Master SKU..." />
                  </SelectTrigger>
                  <SelectContent>
                    {masterProducts.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.sku} — {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {newProduct.parentProductId && (
                  <p className="text-[11px] text-[var(--info)] flex items-center gap-1">
                    <Link2 className="w-3 h-3" />
                    Warna akan otomatis sync dari Master
                  </p>
                )}
              </div>
            )}

            {/* SKU */}
            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-[var(--t-heading)]">
                {newProduct.productType === 'standalone' ? 'Master SKU *' : 'SKU Varian *'}
              </Label>
              <Input
                value={newProduct.sku}
                onChange={(e) => setNewProduct({ ...newProduct, sku: e.target.value })}
                placeholder="e.g. GD002-GT6-PRO"
                className="h-10 text-sm bg-[var(--surface)] border-[var(--bd)] rounded-lg"
              />
            </div>

            {/* Name */}
            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-[var(--t-heading)]">Product Name *</Label>
              <Input
                value={newProduct.name}
                onChange={(e) => setNewProduct({ ...newProduct, name: e.target.value })}
                placeholder="e.g. Abstract Wave GT6"
                className="h-10 text-sm bg-[var(--surface)] border-[var(--bd)] rounded-lg"
              />
            </div>

            {/* Min Stock */}
            {newProduct.productType === 'standalone' && (
              <div className="space-y-1.5">
                <Label className="text-sm font-medium text-[var(--t-heading)]">Min Stock Level</Label>
                <Input
                  type="number"
                  min={0}
                  value={newProduct.minStock}
                  onChange={(e) => setNewProduct({ ...newProduct, minStock: parseInt(e.target.value) || 0 })}
                  className="h-10 text-sm bg-[var(--surface)] border-[var(--bd)] rounded-lg w-32"
                />
              </div>
            )}

            {/* Variant Matrix — Variasi 1 (optional) × Warna */}
            <div className="space-y-3">
              <VariantMatrixBuilder
                key={`add-${newProduct.productType}-${newProduct.parentProductId || 'none'}`}
                ref={addMatrixRef}
                masterSku={newProduct.sku || 'PRODUK'}
                initialRows={addMatrixInitialRows}
                initialVariasi1Name={addMatrixInitialVariasi1Name}
                dbColors={dbColors}
                childMode={newProduct.productType === 'variant'}
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setShowAddDialog(false)}
              disabled={creating}
              className="rounded-full px-5"
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateProduct}
              disabled={
                creating ||
                !newProduct.sku.trim() ||
                !newProduct.name.trim() ||
                (newProduct.productType === 'variant' && !newProduct.parentProductId)
              }
              className="bg-[var(--brand)] hover:bg-[var(--brand-dark)] text-white rounded-full px-5 disabled:opacity-50"
            >
              {creating ? 'Creating...' : 'Add Product'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============ DELETE CONFIRM DIALOG ============ */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-sm rounded-xl">
          <DialogHeader>
            <DialogTitle className="text-[var(--t-heading)]">Delete Product</DialogTitle>
            <DialogDescription className="text-[var(--t-body)]">
              Are you sure you want to delete <strong>{deleteTarget?.name}</strong> ({deleteTarget?.sku})?
              {deleteTarget?.childProducts && deleteTarget.childProducts.length > 0 && (
                <span className="block mt-2 text-[var(--danger)] font-medium">
                  ⚠️ This is a Master SKU. All {deleteTarget.childProducts.length} variant product(s) will also be deleted.
                </span>
              )}
              {deleteTarget?.parentProductId && (
                <span className="block mt-2 text-[var(--info)]">
                  This will only remove this variant. The Master SKU and other variants will not be affected.
                </span>
              )}
              {' '}This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setDeleteTarget(null)}
              disabled={deleting}
              className="rounded-full px-5"
            >
              Cancel
            </Button>
            <Button
              onClick={handleDelete}
              disabled={deleting}
              className="bg-[var(--danger)] hover:bg-[var(--danger-dark)] text-white rounded-full px-5 disabled:opacity-50"
            >
              {deleting ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============ EDIT DIALOG ============ */}
      <Dialog open={!!editProduct} onOpenChange={(open) => !open && setEditProduct(null)}>
        <DialogContent className="sm:max-w-2xl rounded-xl max-h-[90vh] overflow-y-auto">
          {editProduct && (
            <>
              <DialogHeader>
                <div className="flex items-center gap-2 flex-wrap">
                  <DialogTitle className="text-[var(--t-heading)]">Edit Product</DialogTitle>
                  {isVariant && editProduct.parentProduct && (
                    <Badge className="text-[11px] px-1.5 py-0 rounded-full bg-[var(--info)]/10 text-[var(--info)] border-[var(--info)]/30" variant="outline">
                      <Link2 className="w-2.5 h-2.5 mr-1" />
                      Varian of {editProduct.parentProduct.sku}
                    </Badge>
                  )}
                  {isMaster && (
                    <Badge className="text-[11px] px-1.5 py-0 rounded-full bg-[var(--brand)]/10 text-[var(--brand)] border-[var(--brand)]/30" variant="outline">
                      Master SKU
                    </Badge>
                  )}
                </div>
                <DialogDescription className="text-[var(--t-body)]">
                  {isVariant
                    ? 'Edit variant product details. Stock is synced from Master.'
                    : isMaster
                      ? 'Edit master product. Stock changes will sync to all variants.'
                      : 'Update product details and color/type variants.'}
                </DialogDescription>
              </DialogHeader>

              {/* Master info banner for variant */}
              {isVariant && editProduct.parentProduct && (
                <div className="p-3 rounded-lg bg-[var(--info)]/5 border border-[var(--info)]/20">
                  <div className="flex items-center gap-2 text-xs text-[var(--info)] font-medium">
                    <Layers className="w-4 h-4" />
                    Master: {editProduct.parentProduct.sku} — {editProduct.parentProduct.name}
                  </div>
                  <p className="text-[11px] text-[var(--t-body)] mt-1">
                    Stok & warna di-sync otomatis dari Master SKU. Hanya nama & barcode yang bisa diedit.
                  </p>
                </div>
              )}

              {/* Reparent: move this child SKU to a different Master */}
              {isVariant && editProduct.parentProduct && (
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium text-[var(--t-heading)]">Ganti SKU Induk</Label>
                  <div className="flex gap-2">
                    <Select value={reparentTargetSku} onValueChange={setReparentTargetSku}>
                      <SelectTrigger className="h-10 text-sm bg-[var(--surface)] border-[var(--bd)] rounded-lg flex-1">
                        <SelectValue placeholder="Pilih Master SKU..." />
                      </SelectTrigger>
                      <SelectContent>
                        {masterProducts.map((p) => (
                          <SelectItem key={p.id} value={p.sku}>
                            {p.sku} — {p.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={!reparentTargetSku || reparentTargetSku === editProduct.parentProduct.sku}
                      onClick={() => setReparentConfirmOpen(true)}
                      className="h-10 rounded-lg border-[var(--info)]/30 text-[var(--info)] hover:bg-[var(--info)]/10 flex-shrink-0"
                    >
                      Pindahkan
                    </Button>
                  </div>
                  <p className="text-[11px] text-[var(--t-muted)]">
                    Pindah ke Master lain akan langsung nyamain stok, min stock, dan est. print ke Master baru itu.
                  </p>
                </div>
              )}

              {/* Master sync info banner */}
              {isMaster && (
                <div className="p-3 rounded-lg bg-[var(--brand)]/5 border border-[var(--brand)]/20">
                  <div className="flex items-center gap-2 text-xs text-[var(--brand)] font-medium">
                    <Layers className="w-4 h-4" />
                    Master SKU — {editProduct.childProducts?.length || 0} variant product(s) linked
                  </div>
                  <p className="text-[11px] text-[var(--t-body)] mt-1">
                    Perubahan stok & warna akan otomatis sync ke semua SKU Varian di group ini.
                  </p>
                </div>
              )}

              <div className="space-y-4">
                {/* SKU */}
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium text-[var(--t-heading)]">{isMaster ? 'Master SKU *' : 'SKU Varian *'}</Label>
                  <Input
                    value={editSku}
                    onChange={(e) => setEditSku(e.target.value)}
                    placeholder="Enter SKU"
                    className="h-10 text-sm bg-[var(--surface)] border-[var(--bd)] rounded-lg font-mono uppercase"
                  />
                  {editProduct.sku !== editSku.trim() && editSku.trim() && (
                    <p className="text-[11px] text-[var(--warning)] flex items-center gap-1">
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>
                      SKU will change from <span className="font-mono font-semibold">{editProduct.sku}</span> to <span className="font-mono font-semibold">{editSku.trim()}</span>
                    </p>
                  )}
                </div>

                {/* Product Name */}
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium text-[var(--t-heading)]">Product Name *</Label>
                  <Input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="h-10 text-sm bg-[var(--surface)] border-[var(--bd)] rounded-lg"
                  />
                </div>

                {/* Min Stock + Est. Print Minutes — only for standalone/master */}
                {!isVariant && (
                  <div className="flex gap-4">
                    <div className="space-y-1.5">
                      <Label className="text-sm font-medium text-[var(--t-heading)]">
                        Min Stock Level
                        {isMaster && <span className="text-[11px] text-[var(--brand)] ml-1.5 font-normal">(sync to variants)</span>}
                      </Label>
                      <Input
                        type="number"
                        min={0}
                        value={editMinStock}
                        onChange={(e) => setEditMinStock(parseInt(e.target.value) || 0)}
                        className="h-10 text-sm bg-[var(--surface)] border-[var(--bd)] rounded-lg w-32"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-sm font-medium text-[var(--t-heading)]">
                        Est. Print (menit/pcs)
                        {isMaster && <span className="text-[11px] text-[var(--brand)] ml-1.5 font-normal">(sync to variants)</span>}
                      </Label>
                      <Input
                        type="number"
                        min={0}
                        value={editEstPrintMinutes}
                        onChange={(e) => setEditEstPrintMinutes(e.target.value)}
                        placeholder="e.g. 45"
                        className="h-10 text-sm bg-[var(--surface)] border-[var(--bd)] rounded-lg w-32"
                      />
                      <p className="text-[11px] text-[var(--t-muted)]">Buat estimasi durasi Print Queue</p>
                    </div>
                  </div>
                )}

                {/* Variant Matrix — Variasi 1 (optional) × Warna. Harga sekarang per baris
                    kombinasi, bukan 1 harga untuk seluruh produk (variant-matrix-spec.md). */}
                <div className="space-y-3">
                  {editProduct && (
                    <VariantMatrixBuilder
                      key={editProduct.id}
                      ref={editMatrixRef}
                      masterSku={editProduct.sku}
                      initialRows={editMatrixInitialRows}
                      initialVariasi1Name={editProduct.variasi1Name || ''}
                      dbColors={dbColors}
                      childMode={!!isVariant}
                    />
                  )}
                </div>
              </div>

              <DialogFooter className="gap-2">
                <Button
                  variant="outline"
                  onClick={() => setEditProduct(null)}
                  disabled={saving}
                  className="rounded-full px-5"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleSave}
                  disabled={saving || !editSku.trim() || !editName.trim()}
                  className="bg-[var(--brand)] hover:bg-[var(--brand-dark)] text-white rounded-full px-5 disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Save Changes'}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ============ REPARENT CONFIRMATION ============ */}
      <Dialog open={reparentConfirmOpen} onOpenChange={(open) => !open && setReparentConfirmOpen(false)}>
        <DialogContent className="sm:max-w-md rounded-xl">
          <DialogHeader>
            <DialogTitle className="text-[var(--t-heading)]">Pindahkan ke Master Baru?</DialogTitle>
            <DialogDescription className="text-[var(--t-body)]">
              {editProduct?.sku} akan dipindah dari{' '}
              <span className="font-semibold">{editProduct?.parentProduct?.sku}</span> ke{' '}
              <span className="font-semibold text-[var(--info)]">{reparentTargetSku}</span>.
            </DialogDescription>
          </DialogHeader>
          <div className="p-3 rounded-lg bg-[var(--warning)]/5 border border-[var(--warning)]/20 text-xs text-[var(--warning-darker)]">
            Stok, min stock, dan est. print produk ini akan <span className="font-semibold">langsung disamakan</span> ke Master baru (per warna yang cocok). Warna yang nggak ada di Master baru stoknya tetap seperti sekarang.
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setReparentConfirmOpen(false)} className="rounded-full px-5">
              Batal
            </Button>
            <Button
              onClick={handleReparent}
              disabled={reparenting}
              className="bg-[var(--info)] hover:bg-[var(--info-dark)] text-white rounded-full px-5 disabled:opacity-50"
            >
              {reparenting ? 'Memindahkan...' : 'Ya, Pindahkan'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
