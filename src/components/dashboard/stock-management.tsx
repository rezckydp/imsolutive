'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
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

// ============ TYPES ============

interface VariantData {
  id?: string;
  color: string;
  colorHex: string;
  qty: number;
  barcode: string;
  type?: string;
  _delete?: boolean;
}

interface TypeVariantData {
  id?: string;
  type: string;
  qty: number;
  barcode: string;
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
  parentProductId?: string | null;
  parentProduct?: { id: string; sku: string; name: string } | null;
  childProducts?: Array<{ id: string; sku: string; name: string }>;
  variants?: Array<{ id: string; color: string; colorHex: string; qty: number; barcode: string; type?: string }>;
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
  if (qty === 0) return { label: 'Out', className: 'bg-[#dc2626]/10 text-[#dc2626] border-[#dc2626]/30' };
  if (qty < minStock) return { label: 'Low', className: 'bg-[#d97706]/10 text-[#d97706] border-[#d97706]/30' };
  return { label: 'OK', className: 'bg-[#15803d]/10 text-[#15803d] border-[#15803d]/30' };
}

function getTotalStock(product: ProductData): number {
  return product.variants?.reduce((sum, v) => sum + v.qty, 0) ?? 0;
}

function getProductTypeBadge(product: ProductData): { label: string; className: string } | null {
  if (product.parentProductId) {
    return { label: 'Varian', className: 'bg-[#2563eb]/10 text-[#2563eb] border-[#2563eb]/30' };
  }
  if (product.childProducts && product.childProducts.length > 0) {
    return { label: 'Master', className: 'bg-[#4a6741]/10 text-[#4a6741] border-[#4a6741]/30' };
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
      {loading && <Loader2 className="w-3 h-3 animate-spin text-[#4a6741]" />}
      <Input
        ref={inputRef}
        type="number"
        min={0}
        value={tempValue}
        onChange={(e) => setTempValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        disabled={loading}
        className="h-6 w-16 text-xs text-right bg-white border-[#4a6741] focus:border-[#4a6741] rounded px-1.5 py-0 ml-auto"
      />
    </div>
  );
}

// ============ MAIN COMPONENT ============

export function StockManagement() {
  const [products, setProducts] = useState<ProductData[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  // Edit state
  const [editProduct, setEditProduct] = useState<ProductData | null>(null);
  const [editSku, setEditSku] = useState('');
  const [editName, setEditName] = useState('');
  const [editMinStock, setEditMinStock] = useState(10);
  const [editVariants, setEditVariants] = useState<VariantData[]>([]);
  const [saving, setSaving] = useState(false);

  // Edit — Type variants state
  const [editVariantTab, setEditVariantTab] = useState<'color' | 'type'>('color');
  const [editTypeVariants, setEditTypeVariants] = useState<Array<TypeVariantData>>([]);

  // Add Product state
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newProduct, setNewProduct] = useState<NewProductData>({
    sku: '',
    name: '',
    minStock: 10,
    variants: [{ color: '', colorHex: '#000000', qty: 0, barcode: '' }],
    productType: 'standalone',
    parentProductId: '',
  });
  const [creating, setCreating] = useState(false);

  // Add Product — Type variants state
  const [variantTab, setVariantTab] = useState<'color' | 'type'>('color');
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
    setVariantTab('color');
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

  const addVariant = () => {
    setNewProduct({
      ...newProduct,
      variants: [...newProduct.variants, { color: '', colorHex: '#000000', qty: 0, barcode: '' }],
    });
  };

  const removeVariant = (index: number) => {
    // Allow removal if there are other variants (color or type)
    const totalVariants = newProduct.variants.length + typeVariants.length;
    if (totalVariants <= 1) return;
    if (newProduct.variants.length <= 1 && typeVariants.length === 0) return;
    setNewProduct({
      ...newProduct,
      variants: newProduct.variants.filter((_, i) => i !== index),
    });
  };

  const updateVariant = (index: number, field: keyof VariantData, value: string | number) => {
    const variants = newProduct.variants.map((v, i) =>
      i === index ? { ...v, [field]: value } : v
    );
    setNewProduct({ ...newProduct, variants });
  };

  const handlePresetColorAdd = (index: number, name: string, hex: string) => {
    const variants = newProduct.variants.map((v, i) =>
      i === index ? { ...v, color: name, colorHex: hex } : v
    );
    setNewProduct({ ...newProduct, variants });
  };

  // Type variant helpers (Add dialog)
  const addTypeVariant = () => {
    setTypeVariants([...typeVariants, { type: '', qty: 0, barcode: '' }]);
  };

  const removeTypeVariant = (index: number) => {
    setTypeVariants(typeVariants.filter((_, i) => i !== index));
  };

  const updateTypeVariant = (index: number, field: keyof TypeVariantData, value: string | number) => {
    setTypeVariants(typeVariants.map((v, i) =>
      i === index ? { ...v, [field]: value } : v
    ));
  };

  const handleCreateProduct = async () => {
    if (!newProduct.sku.trim() || !newProduct.name.trim()) {
      alert('SKU dan Nama Produk wajib diisi.');
      return;
    }

    setCreating(true);
    try {
      const validColorVariants = newProduct.variants.filter((v) => v.color.trim());
      const validTypeVariants = typeVariants.filter((v) => v.type.trim());
      const allVariants = newProduct.productType === 'standalone'
        ? [...validColorVariants, ...validTypeVariants]
        : validColorVariants;

      if (newProduct.productType === 'standalone' && allVariants.length === 0) {
        alert('Produk harus memiliki minimal 1 varian (warna atau type).');
        setCreating(false);
        return;
      }

      const payload: Record<string, unknown> = {
        sku: newProduct.sku.trim(),
        name: newProduct.name.trim(),
        minStock: newProduct.minStock,
      };

      if (newProduct.productType === 'variant' && newProduct.parentProductId) {
        payload.parentProductId = newProduct.parentProductId;
        if (validColorVariants.length > 0) {
          payload.variants = validColorVariants.map((v) => ({
            color: v.color,
            colorHex: v.colorHex,
            qty: 0, // Server will sync from master
            barcode: v.barcode || null,
            type: v.type || '',
          }));
        }
      } else {
        if (allVariants.length > 0) {
          payload.variants = allVariants.map((v) => {
            if ('color' in v) {
              // Color variant
              return {
                color: v.color,
                colorHex: v.colorHex,
                qty: v.qty,
                barcode: v.barcode || null,
                type: (v as VariantData).type || '',
              };
            } else {
              // Type variant
              return {
                color: '',
                colorHex: '#2d3436',
                type: (v as TypeVariantData).type,
                qty: v.qty,
                barcode: v.barcode || null,
              };
            }
          });
        }
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
    // Separate variants into color variants and type variants
    const colorVariants: VariantData[] = [];
    const typeVariantsData: TypeVariantData[] = [];
    (product.variants || []).forEach((v) => {
      const hasColor = v.color && v.color.trim() !== '';
      const hasType = v.type && v.type.trim() !== '';
      if (hasType && !hasColor) {
        typeVariantsData.push({
          id: v.id,
          type: v.type || '',
          qty: v.qty,
          barcode: v.barcode || '',
        });
      } else {
        colorVariants.push({
          id: v.id,
          color: v.color,
          colorHex: v.colorHex,
          qty: v.qty,
          barcode: v.barcode || '',
          type: v.type || '',
        });
      }
    });
    setEditVariants(colorVariants.length > 0 ? colorVariants : [{ color: '', colorHex: '#000000', qty: 0, barcode: '' }]);
    setEditTypeVariants(typeVariantsData);
    setEditVariantTab('color');
    setEditProduct(product);
  };

  const isVariant = editProduct?.parentProductId;
  const isMaster = editProduct && !editProduct?.parentProductId && (editProduct?.childProducts?.length ?? 0) > 0;

  const addEditVariant = () => {
    if (isVariant) return; // Variants can't add new colors
    setEditVariants([...editVariants, { color: '', colorHex: '#000000', qty: 0, barcode: '' }]);
  };

  const removeEditVariant = (index: number) => {
    if (isVariant) return; // Variants can't remove colors
    // Allow removal if there are other variants (color or type)
    const totalVariants = editVariants.filter((v) => !v._delete).length + editTypeVariants.filter((v) => !v._delete).length;
    if (totalVariants <= 1) return;
    if (editVariants.filter((v) => !v._delete).length <= 1 && editTypeVariants.filter((v) => !v._delete).length === 0) return;
    const variant = editVariants[index];
    if (variant.id) {
      setEditVariants(editVariants.map((v, i) =>
        i === index ? { ...v, _delete: true } : v
      ));
    } else {
      setEditVariants(editVariants.filter((_, i) => i !== index));
    }
  };

  const updateEditVariant = (index: number, field: keyof VariantData, value: string | number) => {
    // Variants cannot edit qty (synced from master) or add/remove colors
    if (isVariant && field === 'qty') return;
    setEditVariants(editVariants.map((v, i) =>
      i === index ? { ...v, [field]: value } : v
    ));
  };

  const handlePresetColorEdit = (index: number, name: string, hex: string) => {
    if (isVariant) return;
    setEditVariants(editVariants.map((v, i) =>
      i === index ? { ...v, color: name, colorHex: hex } : v
    ));
  };

  // Edit — Type variant helpers
  const addEditTypeVariant = () => {
    if (isVariant) return;
    setEditTypeVariants([...editTypeVariants, { type: '', qty: 0, barcode: '' }]);
  };

  const removeEditTypeVariant = (index: number) => {
    if (isVariant) return;
    const variant = editTypeVariants[index];
    if (variant.id) {
      setEditTypeVariants(editTypeVariants.map((v, i) =>
        i === index ? { ...v, _delete: true } : v
      ));
    } else {
      setEditTypeVariants(editTypeVariants.filter((_, i) => i !== index));
    }
  };

  const updateEditTypeVariant = (index: number, field: keyof TypeVariantData, value: string | number) => {
    if (isVariant && field === 'qty') return;
    setEditTypeVariants(editTypeVariants.map((v, i) =>
      i === index ? { ...v, [field]: value } : v
    ));
  };

  const handleSave = async () => {
    if (!editProduct) return;
    setSaving(true);
    try {
      // Combine color variants and type variants
      const allVariants = [
        ...editVariants.map((v) => ({
          id: v.id,
          color: v.color,
          colorHex: v.colorHex,
          qty: v.qty,
          barcode: v.barcode || '',
          type: v.type || '',
          _delete: v._delete,
        })),
        ...editTypeVariants.map((v) => ({
          id: v.id,
          color: '',
          colorHex: '#2d3436',
          qty: v.qty,
          barcode: v.barcode || '',
          type: v.type,
          _delete: v._delete,
        })),
      ];

      const res = await fetch(`/api/products/${editProduct.sku}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sku: editSku.trim(),
          name: editName,
          minStock: editMinStock,
          variants: allVariants,
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
          <h1 className="text-2xl font-bold text-[#2d3436]">Stock Management</h1>
          <p className="text-sm text-[#4b5563] mt-1">Manage products & inventory</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            onClick={handleDownloadTemplate}
            className="text-sm font-medium rounded-lg flex items-center gap-2 h-10 px-4 border-[#e8e8e8] hover:bg-[#f5f6fa] cursor-pointer"
          >
            <Download className="w-4 h-4" />
            Download Template
          </Button>
          <Button
            variant="outline"
            onClick={() => document.getElementById('import-excel-input')?.click()}
            disabled={importing}
            className="text-sm font-medium rounded-lg flex items-center gap-2 h-10 px-4 border-[#e8e8e8] hover:bg-[#f5f6fa] cursor-pointer"
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
            onClick={openAddDialog}
            className="bg-[#4a6741] hover:bg-[#3d5535] text-white text-sm font-semibold rounded-lg flex items-center gap-2 h-10 px-4 shadow-sm cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Add Product
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="bg-white rounded-xl shadow-sm p-4 mb-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#6b7280]" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by SKU or product name..."
            className="pl-10 text-sm bg-[#f5f6fa] border-[#e8e8e8] rounded-lg h-10"
          />
        </div>
      </div>

      {/* Product List */}
      <div className="bg-white rounded-xl shadow-sm overflow-x-auto -webkit-overflow-scrolling-touch">
        {/* Table Header */}
        <div className="grid grid-cols-[1.8fr_0.6fr_0.8fr_auto] gap-2 px-4 py-3 bg-[#f5f6fa] border-b border-[#e8e8e8] min-w-[450px]">
          <span className="text-xs font-medium text-[#4b5563]">Product</span>
          <span className="text-xs font-medium text-[#4b5563] text-center">Total Stock</span>
          <span className="text-xs font-medium text-[#4b5563] text-center">Type</span>
          <span className="text-xs font-medium text-[#4b5563] text-right">Action</span>
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
            <Package className="w-10 h-10 text-[#6b7280] mx-auto mb-3" />
            <p className="text-sm text-[#6b7280]">
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
                className={`grid grid-cols-[1.8fr_0.6fr_0.8fr_auto] gap-2 px-4 py-3 border-b border-[#f0f0f0] hover:bg-[#fafafa] transition-colors items-center cursor-pointer ${hasChildren || hasVariants ? '' : ''}`}
                onClick={() => (hasChildren || hasVariants) && toggleExpand(master.id)}
              >
                <div className="flex items-center gap-2 min-w-0">
                  {(hasChildren || hasVariants) && (
                    isExpanded
                      ? <ChevronDown className="w-4 h-4 text-[#6b7280] flex-shrink-0" />
                      : <ChevronRight className="w-4 h-4 text-[#6b7280] flex-shrink-0" />
                  )}
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-[#2d3436]">{master.sku}</span>
                      {typeBadge && (
                        <Badge className={`text-[11px] px-1.5 py-0 rounded-full font-semibold ${typeBadge.className}`} variant="outline">
                          {typeBadge.label}
                        </Badge>
                      )}
                    </div>
                    <span className="text-xs text-[#4b5563] truncate block">{master.name}</span>
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
                          <span className="text-[11px] text-[#6b7280] ml-1">+{master.variants!.length - 5}</span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                <div className="text-center">
                  <span className={`text-sm font-bold ${totalStock === 0 ? 'text-[#dc2626]' : totalStock < master.minStock ? 'text-[#d97706]' : 'text-[#2d3436]'}`}>
                    {totalStock}
                  </span>
                </div>
                <div className="text-center">
                  {typeBadge ? (
                    <Badge className={`text-[11px] px-1.5 py-0 rounded-full font-semibold ${typeBadge.className}`} variant="outline">
                      {typeBadge.label}
                    </Badge>
                  ) : (
                    <span className="text-[11px] text-[#6b7280]">Standalone</span>
                  )}
                </div>
                <div className="flex items-center gap-2 justify-end" onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={() => openEdit(master)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#4a6741] bg-[#4a6741]/5 hover:bg-[#4a6741]/10 rounded-lg transition-colors cursor-pointer"
                  >
                    <Pencil className="w-3 h-3" />
                    Edit
                  </button>
                  <button
                    onClick={() => setDeleteTarget(master)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#dc2626] bg-[#dc2626]/5 hover:bg-[#dc2626]/10 rounded-lg transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-3 h-3" />
                    Delete
                  </button>
                </div>
              </div>

              {/* Expanded: Child Variant Products (SKU Varian) */}
              {isExpanded && hasChildren && (
                <div className="border-b border-[#f0f0f0]">
                  {children.map((child) => {
                    const childStock = getTotalStock(child);
                    const childTypeBadge = getProductTypeBadge(child);
                    const childHasVariants = child.variants && child.variants.length > 0;
                    const childEditable = isProductEditable(child);

                    return (
                      <div
                        key={child.id}
                        className="grid grid-cols-[1.8fr_0.6fr_0.8fr_auto] gap-2 px-4 py-2.5 pl-10 bg-[#f8fbff] border-b border-[#f0f0f0] hover:bg-[#f0f5ff] transition-colors items-center cursor-pointer"
                        onClick={() => childHasVariants && toggleExpand(child.id)}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <Link2 className="w-3.5 h-3.5 text-[#2563eb] flex-shrink-0" />
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-medium text-[#2d3436]">{child.sku}</span>
                              {childTypeBadge && (
                                <Badge className={`text-[11px] px-1.5 py-0 rounded-full font-semibold ${childTypeBadge.className}`} variant="outline">
                                  {childTypeBadge.label}
                                </Badge>
                              )}
                            </div>
                            <span className="text-xs text-[#4b5563] truncate block">{child.name}</span>
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
                                  <span className="text-[11px] text-[#6b7280] ml-1">+{child.variants!.length - 5}</span>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="text-center">
                          <span className={`text-sm font-bold ${childStock === 0 ? 'text-[#dc2626]' : childStock < child.minStock ? 'text-[#d97706]' : 'text-[#2d3436]'}`}>
                            {childStock}
                          </span>
                          {!childEditable && <div className="text-[11px] text-[#2563eb]">synced</div>}
                        </div>
                        <div className="text-center">
                          {childTypeBadge ? (
                            <Badge className={`text-[11px] px-1.5 py-0 rounded-full font-semibold ${childTypeBadge.className}`} variant="outline">
                              {childTypeBadge.label}
                            </Badge>
                          ) : (
                            <span className="text-[11px] text-[#6b7280]">Varian</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 justify-end" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => openEdit(child)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#4a6741] bg-[#4a6741]/5 hover:bg-[#4a6741]/10 rounded-lg transition-colors cursor-pointer"
                          >
                            <Pencil className="w-3 h-3" />
                            Edit
                          </button>
                          <button
                            onClick={() => setDeleteTarget(child)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#dc2626] bg-[#dc2626]/5 hover:bg-[#dc2626]/10 rounded-lg transition-colors cursor-pointer"
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
                <div className="bg-[#fafafa] border-b border-[#f0f0f0] px-6 py-3">
                  <div className="grid grid-cols-[1fr_1fr_0.6fr] gap-2 mb-2 px-2">
                    <span className="text-[11px] font-medium text-[#6b7280]">Variant</span>
                    <span className="text-[11px] font-medium text-[#6b7280] text-right">Stock</span>
                    <span className="text-[11px] font-medium text-[#6b7280] text-center">Status</span>
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
                        className="grid grid-cols-[1fr_1fr_0.6fr] gap-2 px-2 py-1.5 items-center"
                      >
                        <div className="flex items-center gap-2">
                          {hasColor ? (
                            <div
                              className="w-5 h-5 rounded-full border border-[#e8e8e8] flex-shrink-0 shadow-sm"
                              style={{ backgroundColor: variant.colorHex }}
                            />
                          ) : null}
                          {hasType ? (
                            <Badge className="text-[11px] px-1.5 py-0 rounded-full bg-[#4a6741]/10 text-[#4a6741] border-[#4a6741]/30 font-medium" variant="outline">
                              <Tags className="w-2.5 h-2.5 mr-0.5" />
                              {variant.type}
                            </Badge>
                          ) : null}
                          <span className="text-xs text-[#2d3436] font-medium">{label}</span>
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
                            <span className={`text-xs font-semibold ${variant.qty === 0 ? 'text-[#dc2626]' : 'text-[#2d3436]'}`}>
                              {variant.qty}
                            </span>
                            <Pencil className="w-2.5 h-2.5 text-[#6b7280] opacity-0 group-hover:opacity-100 transition-opacity" />
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
                <div className="bg-[#fafafa] border-b border-[#f0f0f0] px-6 py-3">
                  <div className="grid grid-cols-[1fr_1fr_0.6fr] gap-2 mb-2 px-2">
                    <span className="text-[11px] font-medium text-[#6b7280]">Variant</span>
                    <span className="text-[11px] font-medium text-[#6b7280] text-right">Stock</span>
                    <span className="text-[11px] font-medium text-[#6b7280] text-center">Status</span>
                  </div>
                  {master.variants!.map((variant) => {
                    const cs = getStockStatus(variant.qty, master.minStock);
                    const label = getVariantLabel(variant.color, variant.type || '');
                    const hasColor = variant.color && variant.color.trim() !== '';
                    const hasType = variant.type && variant.type.trim() !== '';
                    return (
                      <div
                        key={variant.id}
                        className="grid grid-cols-[1fr_1fr_0.6fr] gap-2 px-2 py-1.5 items-center"
                      >
                        <div className="flex items-center gap-2">
                          {hasColor ? (
                            <div
                              className="w-5 h-5 rounded-full border border-[#e8e8e8] flex-shrink-0 shadow-sm"
                              style={{ backgroundColor: variant.colorHex }}
                            />
                          ) : null}
                          {hasType ? (
                            <Badge className="text-[11px] px-1.5 py-0 rounded-full bg-[#4a6741]/10 text-[#4a6741] border-[#4a6741]/30 font-medium" variant="outline">
                              <Tags className="w-2.5 h-2.5 mr-0.5" />
                              {variant.type}
                            </Badge>
                          ) : null}
                          <span className="text-xs text-[#2d3436] font-medium">{label}</span>
                        </div>
                        <div className="flex items-center gap-1 justify-end">
                          <span className={`text-xs font-semibold ${variant.qty === 0 ? 'text-[#dc2626]' : 'text-[#2d3436]'}`}>
                            {variant.qty}
                          </span>
                          <span className="text-[11px] text-[#2563eb] ml-1">synced</span>
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

      {/* ============ ADD PRODUCT DIALOG ============ */}
      <Dialog open={showAddDialog} onOpenChange={(open) => !open && setShowAddDialog(false)}>
        <DialogContent className="sm:max-w-2xl rounded-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-[#2d3436] flex items-center gap-2">
              <Plus className="w-5 h-5 text-[#4a6741]" />
              Add New Product
            </DialogTitle>
            <DialogDescription className="text-[#4b5563]">
              Buat produk baru dengan varian warna dan/atau type.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Product Type */}
            <div className="space-y-2">
              <Label className="text-sm font-medium text-[#2d3436]">Product Type</Label>
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
                      ? 'border-[#4a6741] bg-[#4a6741]/5'
                      : 'border-[#e8e8e8] hover:border-[#b2bec3]'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Package className="w-4 h-4" style={{ color: newProduct.productType === 'standalone' ? '#4a6741' : '#6b7280' }} />
                    <span className="text-sm font-semibold" style={{ color: newProduct.productType === 'standalone' ? '#4a6741' : '#4b5563' }}>
                      Standalone
                    </span>
                  </div>
                  <span className="text-[11px] text-[#6b7280]">Stok independen per warna</span>
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
                      ? 'border-[#2563eb] bg-[#2563eb]/5'
                      : 'border-[#e8e8e8] hover:border-[#b2bec3]'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Layers className="w-4 h-4" style={{ color: newProduct.productType === 'variant' ? '#2563eb' : '#6b7280' }} />
                    <span className="text-sm font-semibold" style={{ color: newProduct.productType === 'variant' ? '#2563eb' : '#4b5563' }}>
                      Varian dari Master
                    </span>
                  </div>
                  <span className="text-[11px] text-[#6b7280]">Stok sync dari Master SKU</span>
                </button>
              </div>
            </div>

            {/* Master Selection (only for variant type) */}
            {newProduct.productType === 'variant' && (
              <div className="space-y-1.5">
                <Label className="text-sm font-medium text-[#2d3436]">Master SKU *</Label>
                <Select value={newProduct.parentProductId} onValueChange={handleParentSelect}>
                  <SelectTrigger className="h-10 text-sm bg-[#f5f6fa] border-[#e8e8e8] rounded-lg">
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
                  <p className="text-[11px] text-[#2563eb] flex items-center gap-1">
                    <Link2 className="w-3 h-3" />
                    Warna akan otomatis sync dari Master
                  </p>
                )}
              </div>
            )}

            {/* SKU */}
            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-[#2d3436]">Product SKU *</Label>
              <Input
                value={newProduct.sku}
                onChange={(e) => setNewProduct({ ...newProduct, sku: e.target.value })}
                placeholder="e.g. GD002-GT6-PRO"
                className="h-10 text-sm bg-[#f5f6fa] border-[#e8e8e8] rounded-lg"
              />
            </div>

            {/* Name */}
            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-[#2d3436]">Product Name *</Label>
              <Input
                value={newProduct.name}
                onChange={(e) => setNewProduct({ ...newProduct, name: e.target.value })}
                placeholder="e.g. Abstract Wave GT6"
                className="h-10 text-sm bg-[#f5f6fa] border-[#e8e8e8] rounded-lg"
              />
            </div>

            {/* Min Stock */}
            {newProduct.productType === 'standalone' && (
              <div className="space-y-1.5">
                <Label className="text-sm font-medium text-[#2d3436]">Min Stock Level</Label>
                <Input
                  type="number"
                  min={0}
                  value={newProduct.minStock}
                  onChange={(e) => setNewProduct({ ...newProduct, minStock: parseInt(e.target.value) || 0 })}
                  className="h-10 text-sm bg-[#f5f6fa] border-[#e8e8e8] rounded-lg w-32"
                />
              </div>
            )}

            {/* Variants — Tabbed: Color / Type */}
            <div className="space-y-3">
              {/* Tab buttons — only for standalone */}
              {newProduct.productType === 'standalone' ? (
                <>
                  <div className="flex border-b border-[#e8e8e8]">
                    <button
                      type="button"
                      onClick={() => setVariantTab('color')}
                      className={`px-4 py-2 text-sm font-medium transition-colors cursor-pointer border-b-2 -mb-px ${
                        variantTab === 'color'
                          ? 'border-[#4a6741] text-[#4a6741]'
                          : 'border-transparent text-[#6b7280] hover:text-[#4b5563]'
                      }`}
                    >
                      Varian Warna
                      <span className="text-[11px] text-[#6b7280] ml-1.5 font-normal">
                        ({newProduct.variants.filter((v) => v.color.trim()).length})
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setVariantTab('type')}
                      className={`px-4 py-2 text-sm font-medium transition-colors cursor-pointer border-b-2 -mb-px ${
                        variantTab === 'type'
                          ? 'border-[#4a6741] text-[#4a6741]'
                          : 'border-transparent text-[#6b7280] hover:text-[#4b5563]'
                      }`}
                    >
                      Varian Type
                      <span className="text-[11px] text-[#6b7280] ml-1.5 font-normal">
                        ({typeVariants.filter((v) => v.type.trim()).length})
                      </span>
                    </button>
                  </div>

                  {/* Color Variants Tab */}
                  {variantTab === 'color' && (
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <Label className="text-sm font-medium text-[#2d3436]">Color Variants</Label>
                        <button
                          onClick={addVariant}
                          className="text-xs text-[#4a6741] font-semibold hover:underline flex items-center gap-1 cursor-pointer"
                        >
                          <Plus className="w-3 h-3" />
                          Add Color Variant
                        </button>
                      </div>
                      <div className="rounded-lg border border-[#e8e8e8] overflow-hidden">
                        <div className="grid grid-cols-[auto_100px_70px_1fr_32px] gap-2 px-3 py-1.5 bg-[#f0f0f0] items-end">
                          <span className="text-[11px] font-medium text-[#6b7280] uppercase tracking-wide">Color</span>
                          <span className="text-[11px] font-medium text-[#6b7280] uppercase tracking-wide">Name</span>
                          <span className="text-[11px] font-medium text-[#6b7280] uppercase tracking-wide">Qty</span>
                          <span className="text-[11px] font-medium text-[#6b7280] uppercase tracking-wide">Barcode</span>
                          <span />
                        </div>
                        <div className="divide-y divide-[#f0f0f0]">
                          {newProduct.variants.map((variant, index) => (
                            <div
                              key={index}
                              className="grid grid-cols-[auto_100px_70px_1fr_32px] gap-2 px-3 py-2 items-end"
                            >
                              <div className="flex items-center gap-1.5">
                                <div
                                  className="w-6 h-6 rounded border border-[#e8e8e8] flex-shrink-0 shadow-sm"
                                  style={{ backgroundColor: variant.colorHex }}
                                />
                                <select
                                  value={variant.colorHex}
                                  onChange={(e) => {
                                    const preset = dbColors.find(c => c.hex === e.target.value);
                                    if (preset) handlePresetColorAdd(index, preset.name, preset.hex);
                                  }}
                                  className="h-8 text-[11px] bg-[#f5f6fa] border border-[#e8e8e8] rounded-lg px-1.5 pr-5 cursor-pointer text-[#2d3436]"
                                >
                                  <option value="">Pilih</option>
                                  {dbColors.map((c) => (
                                    <option key={c.hex} value={c.hex}>{c.name}</option>
                                  ))}
                                </select>
                              </div>
                              <Input
                                value={variant.color}
                                onChange={(e) => updateVariant(index, 'color', e.target.value)}
                                placeholder="Black"
                                className="h-8 text-xs bg-white border-[#e8e8e8] rounded-lg"
                              />
                              <Input
                                type="number"
                                min={0}
                                value={variant.qty}
                                onChange={(e) => updateVariant(index, 'qty', parseInt(e.target.value) || 0)}
                                className="h-8 text-xs bg-white border-[#e8e8e8] rounded-lg"
                              />
                              <Input
                                value={variant.barcode}
                                onChange={(e) => updateVariant(index, 'barcode', e.target.value)}
                                placeholder="Scan or enter"
                                className="h-8 text-xs bg-white border-[#e8e8e8] rounded-lg"
                              />
                              <div className="flex items-center justify-center">
                                {(newProduct.variants.length > 1 || typeVariants.length > 0) ? (
                                  <button
                                    onClick={() => removeVariant(index)}
                                    className="w-6 h-6 flex items-center justify-center rounded text-[#dc2626] hover:bg-[#dc2626]/10 transition-colors cursor-pointer"
                                    title="Remove variant"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                ) : (
                                  <span />
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Type Variants Tab */}
                  {variantTab === 'type' && (
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <Label className="text-sm font-medium text-[#2d3436]">Type Variants</Label>
                        <button
                          onClick={addTypeVariant}
                          className="text-xs text-[#4a6741] font-semibold hover:underline flex items-center gap-1 cursor-pointer"
                        >
                          <Plus className="w-3 h-3" />
                          Add Type Variant
                        </button>
                      </div>
                      <div className="rounded-lg border border-[#e8e8e8] overflow-hidden">
                        <div className="grid grid-cols-[1fr_70px_1fr_32px] gap-2 px-3 py-1.5 bg-[#f0f0f0] items-end">
                          <span className="text-[11px] font-medium text-[#6b7280] uppercase tracking-wide">Type Name</span>
                          <span className="text-[11px] font-medium text-[#6b7280] uppercase tracking-wide">Qty</span>
                          <span className="text-[11px] font-medium text-[#6b7280] uppercase tracking-wide">Barcode</span>
                          <span />
                        </div>
                        <div className="divide-y divide-[#f0f0f0]">
                          {typeVariants.length === 0 && (
                            <div className="px-3 py-6 text-center text-xs text-[#6b7280]">
                              Belum ada varian type. Klik "Add Type Variant" untuk menambahkan.
                            </div>
                          )}
                          {typeVariants.map((tv, index) => (
                            <div
                              key={index}
                              className="grid grid-cols-[1fr_70px_1fr_32px] gap-2 px-3 py-2 items-end"
                            >
                              <Input
                                value={tv.type}
                                onChange={(e) => updateTypeVariant(index, 'type', e.target.value)}
                                placeholder="e.g. XL, 10kg, Premium"
                                className="h-8 text-xs bg-white border-[#e8e8e8] rounded-lg"
                              />
                              <Input
                                type="number"
                                min={0}
                                value={tv.qty}
                                onChange={(e) => updateTypeVariant(index, 'qty', parseInt(e.target.value) || 0)}
                                className="h-8 text-xs bg-white border-[#e8e8e8] rounded-lg"
                              />
                              <Input
                                value={tv.barcode}
                                onChange={(e) => updateTypeVariant(index, 'barcode', e.target.value)}
                                placeholder="Scan or enter"
                                className="h-8 text-xs bg-white border-[#e8e8e8] rounded-lg"
                              />
                              <div className="flex items-center justify-center">
                                <button
                                  onClick={() => removeTypeVariant(index)}
                                  className="w-6 h-6 flex items-center justify-center rounded text-[#dc2626] hover:bg-[#dc2626]/10 transition-colors cursor-pointer"
                                  title="Remove type variant"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                /* Variant type — color variants only (synced) */
                <>
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-medium text-[#2d3436]">
                      Color Variants
                      <span className="text-[11px] text-[#2563eb] ml-1.5 font-normal">(synced)</span>
                    </Label>
                  </div>
                  <div className="rounded-lg border border-[#e8e8e8] overflow-hidden">
                    <div className="grid grid-cols-[auto_100px_70px_1fr_32px] gap-2 px-3 py-1.5 bg-[#f0f0f0] items-end">
                      <span className="text-[11px] font-medium text-[#6b7280] uppercase tracking-wide">Color</span>
                      <span className="text-[11px] font-medium text-[#6b7280] uppercase tracking-wide">Name</span>
                      <span className="text-[11px] font-medium text-[#6b7280] uppercase tracking-wide">
                        Qty<span className="text-[#2563eb] ml-0.5">*</span>
                      </span>
                      <span className="text-[11px] font-medium text-[#6b7280] uppercase tracking-wide">Barcode</span>
                      <span />
                    </div>
                    <div className="divide-y divide-[#f0f0f0]">
                      {newProduct.variants.map((variant, index) => (
                        <div
                          key={index}
                          className="grid grid-cols-[auto_100px_70px_1fr_32px] gap-2 px-3 py-2 items-end"
                        >
                          <div className="flex items-center gap-1.5">
                            <div
                              className="w-6 h-6 rounded border border-[#e8e8e8] flex-shrink-0 shadow-sm"
                              style={{ backgroundColor: variant.colorHex }}
                            />
                          </div>
                          <Input
                            value={variant.color}
                            onChange={(e) => updateVariant(index, 'color', e.target.value)}
                            placeholder="Black"
                            disabled={newProduct.productType === 'variant'}
                            className="h-8 text-xs bg-white border-[#e8e8e8] rounded-lg disabled:opacity-60"
                          />
                          <Input
                            type="number"
                            min={0}
                            value={variant.qty}
                            onChange={(e) => updateVariant(index, 'qty', parseInt(e.target.value) || 0)}
                            disabled={newProduct.productType === 'variant'}
                            className="h-8 text-xs bg-white border-[#e8e8e8] rounded-lg disabled:opacity-60"
                          />
                          <Input
                            value={variant.barcode}
                            onChange={(e) => updateVariant(index, 'barcode', e.target.value)}
                            placeholder="Barcode"
                            className="h-8 text-xs bg-white border-[#e8e8e8] rounded-lg"
                          />
                          <div className="flex items-center justify-center">
                            <span />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
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
              className="bg-[#4a6741] hover:bg-[#3d5535] text-white rounded-full px-5 disabled:opacity-50"
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
            <DialogTitle className="text-[#2d3436]">Delete Product</DialogTitle>
            <DialogDescription className="text-[#4b5563]">
              Are you sure you want to delete <strong>{deleteTarget?.name}</strong> ({deleteTarget?.sku})?
              {deleteTarget?.childProducts && deleteTarget.childProducts.length > 0 && (
                <span className="block mt-2 text-[#dc2626] font-medium">
                  ⚠️ This is a Master SKU. All {deleteTarget.childProducts.length} variant product(s) will also be deleted.
                </span>
              )}
              {deleteTarget?.parentProductId && (
                <span className="block mt-2 text-[#2563eb]">
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
              className="bg-[#dc2626] hover:bg-[#b91c1c] text-white rounded-full px-5 disabled:opacity-50"
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
                  <DialogTitle className="text-[#2d3436]">Edit Product</DialogTitle>
                  {isVariant && editProduct.parentProduct && (
                    <Badge className="text-[11px] px-1.5 py-0 rounded-full bg-[#2563eb]/10 text-[#2563eb] border-[#2563eb]/30" variant="outline">
                      <Link2 className="w-2.5 h-2.5 mr-1" />
                      Varian of {editProduct.parentProduct.sku}
                    </Badge>
                  )}
                  {isMaster && (
                    <Badge className="text-[11px] px-1.5 py-0 rounded-full bg-[#4a6741]/10 text-[#4a6741] border-[#4a6741]/30" variant="outline">
                      Master SKU
                    </Badge>
                  )}
                </div>
                <DialogDescription className="text-[#4b5563]">
                  {isVariant
                    ? 'Edit variant product details. Stock is synced from Master.'
                    : isMaster
                      ? 'Edit master product. Stock changes will sync to all variants.'
                      : 'Update product details and color/type variants.'}
                </DialogDescription>
              </DialogHeader>

              {/* Master info banner for variant */}
              {isVariant && editProduct.parentProduct && (
                <div className="p-3 rounded-lg bg-[#2563eb]/5 border border-[#2563eb]/20">
                  <div className="flex items-center gap-2 text-xs text-[#2563eb] font-medium">
                    <Layers className="w-4 h-4" />
                    Master: {editProduct.parentProduct.sku} — {editProduct.parentProduct.name}
                  </div>
                  <p className="text-[11px] text-[#4b5563] mt-1">
                    Stok & warna di-sync otomatis dari Master SKU. Hanya nama & barcode yang bisa diedit.
                  </p>
                </div>
              )}

              {/* Master sync info banner */}
              {isMaster && (
                <div className="p-3 rounded-lg bg-[#4a6741]/5 border border-[#4a6741]/20">
                  <div className="flex items-center gap-2 text-xs text-[#4a6741] font-medium">
                    <Layers className="w-4 h-4" />
                    Master SKU — {editProduct.childProducts?.length || 0} variant product(s) linked
                  </div>
                  <p className="text-[11px] text-[#4b5563] mt-1">
                    Perubahan stok & warna akan otomatis sync ke semua SKU Varian di group ini.
                  </p>
                </div>
              )}

              <div className="space-y-4">
                {/* SKU */}
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium text-[#2d3436]">SKU *</Label>
                  <Input
                    value={editSku}
                    onChange={(e) => setEditSku(e.target.value)}
                    placeholder="Enter SKU"
                    className="h-10 text-sm bg-[#f5f6fa] border-[#e8e8e8] rounded-lg font-mono uppercase"
                  />
                  {editProduct.sku !== editSku.trim() && editSku.trim() && (
                    <p className="text-[11px] text-[#d97706] flex items-center gap-1">
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>
                      SKU will change from <span className="font-mono font-semibold">{editProduct.sku}</span> to <span className="font-mono font-semibold">{editSku.trim()}</span>
                    </p>
                  )}
                </div>

                {/* Product Name */}
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium text-[#2d3436]">Product Name *</Label>
                  <Input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="h-10 text-sm bg-[#f5f6fa] border-[#e8e8e8] rounded-lg"
                  />
                </div>

                {/* Min Stock — only for standalone/master */}
                {!isVariant && (
                  <div className="space-y-1.5">
                    <Label className="text-sm font-medium text-[#2d3436]">
                      Min Stock Level
                      {isMaster && <span className="text-[11px] text-[#4a6741] ml-1.5 font-normal">(sync to variants)</span>}
                    </Label>
                    <Input
                      type="number"
                      min={0}
                      value={editMinStock}
                      onChange={(e) => setEditMinStock(parseInt(e.target.value) || 0)}
                      className="h-10 text-sm bg-[#f5f6fa] border-[#e8e8e8] rounded-lg w-32"
                    />
                  </div>
                )}

                {/* Variants — Tabbed: Color / Type */}
                <div className="space-y-3">
                  {!isVariant ? (
                    <>
                      <div className="flex border-b border-[#e8e8e8]">
                        <button
                          type="button"
                          onClick={() => setEditVariantTab('color')}
                          className={`px-4 py-2 text-sm font-medium transition-colors cursor-pointer border-b-2 -mb-px ${
                            editVariantTab === 'color'
                              ? 'border-[#4a6741] text-[#4a6741]'
                              : 'border-transparent text-[#6b7280] hover:text-[#4b5563]'
                          }`}
                        >
                          Varian Warna
                          <span className="text-[11px] text-[#6b7280] ml-1.5 font-normal">
                            ({editVariants.filter((v) => !v._delete).length})
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditVariantTab('type')}
                          className={`px-4 py-2 text-sm font-medium transition-colors cursor-pointer border-b-2 -mb-px ${
                            editVariantTab === 'type'
                              ? 'border-[#4a6741] text-[#4a6741]'
                              : 'border-transparent text-[#6b7280] hover:text-[#4b5563]'
                          }`}
                        >
                          Varian Type
                          <span className="text-[11px] text-[#6b7280] ml-1.5 font-normal">
                            ({editTypeVariants.filter((v) => !v._delete).length})
                          </span>
                        </button>
                      </div>

                      {/* Color Variants Tab */}
                      {editVariantTab === 'color' && (
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <Label className="text-sm font-medium text-[#2d3436]">Color Variants</Label>
                            <button
                              onClick={addEditVariant}
                              className="text-xs text-[#4a6741] font-semibold hover:underline flex items-center gap-1 cursor-pointer"
                            >
                              <Plus className="w-3 h-3" />
                              Add Color Variant
                            </button>
                          </div>
                          <div className="rounded-lg border border-[#e8e8e8] overflow-hidden">
                            <div className="grid grid-cols-[auto_100px_70px_1fr_32px] gap-2 px-3 py-1.5 bg-[#f0f0f0] items-end">
                              <span className="text-[11px] font-medium text-[#6b7280] uppercase tracking-wide">Color</span>
                              <span className="text-[11px] font-medium text-[#6b7280] uppercase tracking-wide">Name</span>
                              <span className="text-[11px] font-medium text-[#6b7280] uppercase tracking-wide">
                                Stock{isMaster && <span className="text-[#4a6741] ml-0.5">^</span>}
                              </span>
                              <span className="text-[11px] font-medium text-[#6b7280] uppercase tracking-wide">Barcode</span>
                              <span />
                            </div>
                            <div className="divide-y divide-[#f0f0f0]">
                            {editVariants.map((variant, index) => {
                              if (variant._delete) return null;
                              return (
                                <div
                                  key={variant.id || `new-${index}`}
                                  className="grid grid-cols-[auto_100px_70px_1fr_32px] gap-2 px-3 py-2 items-end"
                                >
                                  <div className="flex items-center gap-1.5">
                                    <div
                                      className="w-6 h-6 rounded border border-[#e8e8e8] flex-shrink-0 shadow-sm"
                                      style={{ backgroundColor: variant.colorHex }}
                                    />
                                    <select
                                      value={variant.colorHex}
                                      onChange={(e) => {
                                        const preset = dbColors.find(c => c.hex === e.target.value);
                                        if (preset) handlePresetColorEdit(index, preset.name, preset.hex);
                                      }}
                                      className="h-8 text-[11px] bg-[#f5f6fa] border border-[#e8e8e8] rounded-lg px-1.5 pr-5 cursor-pointer text-[#2d3436]"
                                    >
                                      <option value="">Pilih</option>
                                      {dbColors.map((c) => (
                                        <option key={c.hex} value={c.hex}>{c.name}</option>
                                      ))}
                                    </select>
                                  </div>
                                  <Input
                                    value={variant.color}
                                    onChange={(e) => updateEditVariant(index, 'color', e.target.value)}
                                    placeholder="Black"
                                    className="h-8 text-xs bg-white border-[#e8e8e8] rounded-lg"
                                  />
                                  <Input
                                    type="number"
                                    min={0}
                                    value={variant.qty}
                                    onChange={(e) => updateEditVariant(index, 'qty', parseInt(e.target.value) || 0)}
                                    className={`h-8 text-xs bg-white border-[#e8e8e8] rounded-lg ${variant.qty === 0 ? 'text-[#dc2626] font-bold' : ''}`}
                                  />
                                  <Input
                                    value={variant.barcode}
                                    onChange={(e) => updateEditVariant(index, 'barcode', e.target.value)}
                                    placeholder="Scan or enter"
                                    className="h-8 text-xs bg-white border-[#e8e8e8] rounded-lg"
                                  />
                                  <div className="flex items-center justify-center">
                                    {(editVariants.filter((v) => !v._delete).length > 1 || editTypeVariants.filter((v) => !v._delete).length > 0) ? (
                                      <button
                                        onClick={() => removeEditVariant(index)}
                                        className="w-6 h-6 flex items-center justify-center rounded text-[#dc2626] hover:bg-[#dc2626]/10 transition-colors cursor-pointer"
                                        title="Remove variant"
                                      >
                                        <Trash2 className="w-3 h-3" />
                                      </button>
                                    ) : (
                                      <span />
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Type Variants Tab */}
                      {editVariantTab === 'type' && (
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <Label className="text-sm font-medium text-[#2d3436]">Type Variants</Label>
                            <button
                              onClick={addEditTypeVariant}
                              className="text-xs text-[#4a6741] font-semibold hover:underline flex items-center gap-1 cursor-pointer"
                            >
                              <Plus className="w-3 h-3" />
                              Add Type Variant
                            </button>
                          </div>
                          <div className="rounded-lg border border-[#e8e8e8] overflow-hidden">
                            <div className="grid grid-cols-[1fr_70px_1fr_32px] gap-2 px-3 py-1.5 bg-[#f0f0f0] items-end">
                              <span className="text-[11px] font-medium text-[#6b7280] uppercase tracking-wide">Type Name</span>
                              <span className="text-[11px] font-medium text-[#6b7280] uppercase tracking-wide">Stock</span>
                              <span className="text-[11px] font-medium text-[#6b7280] uppercase tracking-wide">Barcode</span>
                              <span />
                            </div>
                            <div className="divide-y divide-[#f0f0f0]">
                              {editTypeVariants.filter((v) => !v._delete).length === 0 && (
                                <div className="px-3 py-6 text-center text-xs text-[#6b7280]">
                                  Belum ada varian type. Klik "Add Type Variant" untuk menambahkan.
                                </div>
                              )}
                              {editTypeVariants.map((tv, index) => {
                                if (tv._delete) return null;
                                return (
                                  <div
                                    key={tv.id || `new-type-${index}`}
                                    className="grid grid-cols-[1fr_70px_1fr_32px] gap-2 px-3 py-2 items-end"
                                  >
                                    <Input
                                      value={tv.type}
                                      onChange={(e) => updateEditTypeVariant(index, 'type', e.target.value)}
                                      placeholder="e.g. XL, 10kg, Premium"
                                      className="h-8 text-xs bg-white border-[#e8e8e8] rounded-lg"
                                    />
                                    <Input
                                      type="number"
                                      min={0}
                                      value={tv.qty}
                                      onChange={(e) => updateEditTypeVariant(index, 'qty', parseInt(e.target.value) || 0)}
                                      className={`h-8 text-xs bg-white border-[#e8e8e8] rounded-lg ${tv.qty === 0 ? 'text-[#dc2626] font-bold' : ''}`}
                                    />
                                    <Input
                                      value={tv.barcode}
                                      onChange={(e) => updateEditTypeVariant(index, 'barcode', e.target.value)}
                                      placeholder="Scan or enter"
                                      className="h-8 text-xs bg-white border-[#e8e8e8] rounded-lg"
                                    />
                                    <div className="flex items-center justify-center">
                                      {editTypeVariants.filter((v) => !v._delete).length > 1 || !tv.id ? (
                                        <button
                                          onClick={() => removeEditTypeVariant(index)}
                                          className="w-6 h-6 flex items-center justify-center rounded text-[#dc2626] hover:bg-[#dc2626]/10 transition-colors cursor-pointer"
                                          title="Remove type variant"
                                        >
                                          <Trash2 className="w-3 h-3" />
                                        </button>
                                      ) : (
                                        <button
                                          onClick={() => removeEditTypeVariant(index)}
                                          className="w-6 h-6 flex items-center justify-center rounded text-[#dc2626] hover:bg-[#dc2626]/10 transition-colors cursor-pointer"
                                          title="Remove type variant"
                                        >
                                          <Trash2 className="w-3 h-3" />
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    /* Variant (child) — color variants only (synced) */
                    <>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Label className="text-sm font-medium text-[#2d3436]">Color Variants</Label>
                          <span className="text-[11px] text-[#6b7280] bg-[#f5f6fa] px-2 py-0.5 rounded-full">
                            {editVariants.filter((v) => !v._delete).length}
                          </span>
                        </div>
                      </div>
                      <div className="rounded-lg border border-[#e8e8e8] overflow-hidden">
                        <div className="grid grid-cols-[auto_100px_70px_1fr_32px] gap-2 px-3 py-1.5 bg-[#f0f0f0] items-end">
                          <span className="text-[11px] font-medium text-[#6b7280] uppercase tracking-wide">Color</span>
                          <span className="text-[11px] font-medium text-[#6b7280] uppercase tracking-wide">Name</span>
                          <span className="text-[11px] font-medium text-[#6b7280] uppercase tracking-wide">
                            Stock<span className="text-[#2563eb] ml-0.5">*</span>
                          </span>
                          <span className="text-[11px] font-medium text-[#6b7280] uppercase tracking-wide">Barcode</span>
                          <span />
                        </div>
                        <div className="divide-y divide-[#f0f0f0]">
                        {editVariants.map((variant, index) => {
                          if (variant._delete) return null;
                          return (
                            <div
                              key={variant.id || `new-${index}`}
                              className="grid grid-cols-[auto_100px_70px_1fr_32px] gap-2 px-3 py-2 items-end"
                            >
                              <div className="flex items-center gap-1.5">
                                <div
                                  className="w-6 h-6 rounded border border-[#e8e8e8] flex-shrink-0 shadow-sm"
                                  style={{ backgroundColor: variant.colorHex }}
                                />
                              </div>
                              <Input
                                value={variant.color}
                                onChange={(e) => updateEditVariant(index, 'color', e.target.value)}
                                placeholder="Black"
                                disabled={!!isVariant}
                                className="h-8 text-xs bg-white border-[#e8e8e8] rounded-lg disabled:opacity-60"
                              />
                              <Input
                                type="number"
                                min={0}
                                value={variant.qty}
                                onChange={(e) => updateEditVariant(index, 'qty', parseInt(e.target.value) || 0)}
                                disabled={!!isVariant}
                                className={`h-8 text-xs bg-white border-[#e8e8e8] rounded-lg disabled:opacity-60 ${!isVariant && variant.qty === 0 ? 'text-[#dc2626] font-bold' : ''}`}
                              />
                              <Input
                                value={variant.barcode}
                                onChange={(e) => updateEditVariant(index, 'barcode', e.target.value)}
                                placeholder="Scan or enter"
                                className="h-8 text-xs bg-white border-[#e8e8e8] rounded-lg"
                              />
                              <div className="flex items-center justify-center">
                                <span />
                              </div>
                            </div>
                          );
                        })}
                        </div>
                      </div>
                    </>
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
                  className="bg-[#4a6741] hover:bg-[#3d5535] text-white rounded-full px-5 disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Save Changes'}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
