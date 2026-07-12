'use client';

import { useState, useEffect } from 'react';
import { Plus, X } from 'lucide-react';
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


interface Variant {
  id?: string;
  _delete?: boolean;
  color: string;
  colorHex: string;
  type: string;
  qty: string;
  barcode: string;
}

interface ProductFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product?: {
    id: string;
    sku: string;
    name: string;
    minStock: number;
    variants: Array<{
      id: string;
      color: string;
      colorHex: string;
      qty: number;
      barcode: string | null;
    }>;
  } | null;
  onSaved: () => void;
}

const colorPresets = [
  { name: 'Black', hex: '#2d3436' },
  { name: 'White', hex: '#dfe6e9' },
  { name: 'Red', hex: '#e74c3c' },
  { name: 'Blue', hex: '#3498db' },
  { name: 'Green', hex: '#27ae60' },
  { name: 'Orange', hex: '#f39c12' },
  { name: 'Purple', hex: '#9b59b6' },
  { name: 'Navy', hex: '#2c3e50' },
  { name: 'Teal', hex: '#1abc9c' },
  { name: 'Pink', hex: '#e84393' },
  { name: 'Brown', hex: '#795548' },
  { name: 'Gray', hex: '#95a5a6' },
];

interface FormData {
  sku: string;
  name: string;
  minStock: string;
  variants: Variant[];
}

function createEmptyVariant(): Variant {
  return {
    color: '',
    colorHex: '#2d3436',
    type: '',
    qty: '0',
    barcode: '',
  };
}

export function ProductFormDialog({ open, onOpenChange, product, onSaved }: ProductFormDialogProps) {
  const isEditing = !!product;

  const [form, setForm] = useState<FormData>({
    sku: '',
    name: '',
    minStock: '10',
    variants: [createEmptyVariant()],
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (product) {
      setForm({
        sku: product.sku,
        name: product.name,
        minStock: String(product.minStock),
        variants: product.variants.map((v) => ({
          id: v.id,
          color: v.color,
          colorHex: v.colorHex,
          type: (v as any).type || '',
          qty: String(v.qty),
          barcode: v.barcode || '',
        })),
      });
    } else {
      setForm({
        sku: '',
        name: '',
        minStock: '10',
        variants: [createEmptyVariant()],
      });
    }
    setError('');
  }, [product, open]);

  const updateField = (field: keyof Omit<FormData, 'variants'>, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setError('');
  };

  const updateVariant = (index: number, field: keyof Variant, value: string) => {
    setForm((prev) => ({
      ...prev,
      variants: prev.variants.map((v, i) =>
        i === index ? { ...v, [field]: value } : v
      ),
    }));
    setError('');
  };

  const handleVariantColorSelect = (index: number, preset: typeof colorPresets[0]) => {
    setForm((prev) => ({
      ...prev,
      variants: prev.variants.map((v, i) =>
        i === index ? { ...v, color: preset.name, colorHex: preset.hex } : v
      ),
    }));
  };

  const addVariant = () => {
    setForm((prev) => ({
      ...prev,
      variants: [...prev.variants, createEmptyVariant()],
    }));
  };

  const removeVariant = (index: number) => {
    if (form.variants.length <= 1) return;
    setForm((prev) => ({
      ...prev,
      variants: prev.variants.map((v, i) =>
        i === index && v.id ? { ...v, _delete: true } : v
      ).filter((v, i) => !(i === index && !v.id)),
    }));
  };

  const handleSubmit = async () => {
    if (!form.sku.trim() || !form.name.trim()) {
      setError('SKU and Product Name are required.');
      return;
    }

    const validVariants = form.variants.filter((v) => !v._delete);
    if (validVariants.length === 0) {
      setError('At least one variant is required.');
      return;
    }

    for (const v of validVariants) {
      if (!v.color.trim() && !v.type.trim()) {
        setError('Each variant must have at least a color or a type.');
        return;
      }
    }

    setSaving(true);
    setError('');

    try {
      const url = isEditing ? `/api/products/${encodeURIComponent(product!.sku)}` : '/api/products';
      const method = isEditing ? 'PUT' : 'POST';

      const body: Record<string, unknown> = {
        name: form.name.trim(),
        minStock: parseInt(form.minStock, 10) || 10,
        variants: form.variants.map((v) => ({
          ...(v.id && !v._delete && { id: v.id }),
          ...(v._delete && { id: v.id, _delete: true }),
          color: v.color.trim(),
          colorHex: v.colorHex,
          type: v.type?.trim() || "",
          qty: parseInt(v.qty, 10) || 0,
          barcode: v.barcode.trim() || null,
        })),
      };

      if (!isEditing) {
        body.sku = form.sku.trim();
      }

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to save product');
      }

      onOpenChange(false);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save product');
    } finally {
      setSaving(false);
    }
  };

  const displayVariants = form.variants.filter((v) => !v._delete);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg rounded-xl max-h-[90vh] flex flex-col p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6">
          <DialogTitle className="text-[#2d3436]">
            {isEditing ? 'Edit Product' : 'Add New Product'}
          </DialogTitle>
          <DialogDescription className="text-[#4b5563]">
            {isEditing
              ? 'Update the product details and variants below.'
              : 'Fill in the product details and add at least one color variant.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2 overflow-y-auto flex-1 px-6 pb-2" style={{ scrollbarWidth: 'thin', scrollbarColor: '#d1d5db transparent' }}>
          {/* SKU */}
          <div className="space-y-1.5">
            <Label className="text-sm font-medium text-[#2d3436]">
              SKU <span className="text-[#dc2626]">*</span>
            </Label>
            <Input
              value={form.sku}
              onChange={(e) => updateField('sku', e.target.value)}
              placeholder="e.g. UCS001, GD002"
              disabled={isEditing}
              className="h-10 text-sm bg-[#f0f0f0] border-none focus-visible:ring-1 focus-visible:ring-[#4a6741]/30 disabled:opacity-60"
            />
            {isEditing && (
              <p className="text-[11px] text-[#4b5563]">SKU cannot be changed after creation</p>
            )}
          </div>

          {/* Product Name */}
          <div className="space-y-1.5">
            <Label className="text-sm font-medium text-[#2d3436]">
              Product Name <span className="text-[#dc2626]">*</span>
            </Label>
            <Input
              value={form.name}
              onChange={(e) => updateField('name', e.target.value)}
              placeholder="e.g. Classic T-Shirt"
              className="h-10 text-sm bg-[#f0f0f0] border-none focus-visible:ring-1 focus-visible:ring-[#4a6741]/30"
            />
          </div>

          {/* Min Stock */}
          <div className="space-y-1.5">
            <Label className="text-sm font-medium text-[#2d3436]">Min Stock Level</Label>
            <Input
              type="number"
              min="0"
              value={form.minStock}
              onChange={(e) => updateField('minStock', e.target.value)}
              className="h-10 text-sm bg-[#f0f0f0] border-none focus-visible:ring-1 focus-visible:ring-[#4a6741]/30 w-32"
            />
          </div>

          {/* Variants Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium text-[#2d3436]">
                Color Variants <span className="text-[#dc2626]">*</span>
              </Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={addVariant}
                className="text-xs text-[#4a6741] hover:text-[#3d5535] hover:bg-[#4a6741]/10 h-7 px-2"
              >
                <Plus className="w-3 h-3 mr-1" />
                Add Variant
              </Button>
            </div>

            <div className="max-h-[320px] overflow-y-auto space-y-3 pr-1" style={{ scrollbarWidth: 'thin', scrollbarColor: '#d1d5db transparent' }}>
                {displayVariants.map((variant, idx) => {
                  const actualIdx = form.variants.indexOf(variant);
                  return (
                    <div key={actualIdx} className="bg-[#f8f9fb] rounded-lg p-3 space-y-2.5 border border-[#e8e8e8]">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-[#4b5563]">
                          Variant {idx + 1}
                        </span>
                        {displayVariants.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeVariant(actualIdx)}
                            className="p-0.5 rounded hover:bg-[#dc2626]/10 text-[#6b7280] hover:text-[#dc2626] transition-colors cursor-pointer"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>

                      {/* Color Picker */}
                      <div className="space-y-1.5">
                        <Label className="text-[11px] text-[#4b5563] uppercase tracking-wider">Color</Label>
                        <div className="flex flex-wrap gap-1.5 mb-1.5">
                          {colorPresets.map((preset) => (
                            <button
                              key={preset.hex}
                              type="button"
                              onClick={() => handleVariantColorSelect(actualIdx, preset)}
                              className={`w-5 h-5 rounded-full border-2 transition-all cursor-pointer hover:scale-110 ${
                                variant.colorHex === preset.hex && variant.color === preset.name
                                  ? 'border-[#4a6741] ring-1 ring-[#4a6741]/30 scale-110'
                                  : 'border-[#e0e0e0]'
                              }`}
                              style={{ backgroundColor: preset.hex }}
                              title={preset.name}
                            />
                          ))}
                        </div>
                        <div className="flex gap-2">
                          <Input
                            value={variant.color}
                            onChange={(e) => updateVariant(actualIdx, 'color', e.target.value)}
                            placeholder="Color name"
                            className="h-8 text-xs bg-white border-[#e8e8e8] focus-visible:ring-1 focus-visible:ring-[#4a6741]/30"
                          />
                          <div className="relative">
                            <Input
                              value={variant.colorHex}
                              onChange={(e) => updateVariant(actualIdx, 'colorHex', e.target.value)}
                              placeholder="#000000"
                              className="h-8 w-[80px] text-xs bg-white border-[#e8e8e8] focus-visible:ring-1 focus-visible:ring-[#4a6741]/30 pl-7"
                            />
                            <div
                              className="absolute left-1.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full border border-[#e8e8e8]"
                              style={{ backgroundColor: variant.colorHex }}
                            />
                          </div>
                        </div>
                      </div>

                      {/* Type */}
                      <div className="space-y-1.5">
                        <Label className="text-[11px] text-[#4b5563] uppercase tracking-wider">Type <span className="font-normal text-[#6b7280]">(opt)</span></Label>
                        <Input
                          value={variant.type}
                          onChange={(e) => updateVariant(actualIdx, 'type', e.target.value)}
                          placeholder="e.g. XL, Cotton"
                          className="h-8 text-xs bg-white border-[#e8e8e8] focus-visible:ring-1 focus-visible:ring-[#4a6741]/30"
                        />
                      </div>

                      {/* Qty and Barcode */}
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <Label className="text-[11px] text-[#4b5563] uppercase tracking-wider">Quantity</Label>
                          <Input
                            type="number"
                            min="0"
                            value={variant.qty}
                            onChange={(e) => updateVariant(actualIdx, 'qty', e.target.value)}
                            className="h-8 text-xs bg-white border-[#e8e8e8] focus-visible:ring-1 focus-visible:ring-[#4a6741]/30"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[11px] text-[#4b5563] uppercase tracking-wider">
                            Barcode <span className="font-normal text-[#6b7280]">(opt)</span>
                          </Label>
                          <Input
                            value={variant.barcode}
                            onChange={(e) => updateVariant(actualIdx, 'barcode', e.target.value)}
                            placeholder="Barcode"
                            className="h-8 text-xs bg-white border-[#e8e8e8] focus-visible:ring-1 focus-visible:ring-[#4a6741]/30"
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="bg-[#fef2f2] border border-[#fecaca] rounded-lg p-3">
              <p className="text-sm text-[#dc2626]">{error}</p>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 pt-2 px-6 pb-6">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="rounded-full px-5"
            disabled={saving}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            className="bg-[#4a6741] hover:bg-[#3d5535] text-white rounded-full px-5"
            disabled={saving}
          >
            {saving ? 'Saving...' : isEditing ? 'Update Product' : 'Add Product'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
