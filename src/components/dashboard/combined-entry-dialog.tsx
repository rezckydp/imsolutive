'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
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
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ShoppingCart, Factory, Link2, Layers } from 'lucide-react';

type EntryType = 'order' | 'production';

interface CombinedEntryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOrderCreated?: () => void;
  onProductionAdded?: () => void;
}

// ==================== ORDER FORM STATE ====================

interface VariantOption {
  id: string;
  color: string;
  colorHex: string;
  type: string;
  qty: number;
}

interface OrderEntry {
  sku: string;
  productName: string;
  qty: string;
  variantId: string | null;
  selectedColor: string;
  lookingUp: boolean;
  error: string;
  variantOptions: VariantOption[];
  parentProduct?: { sku: string; name: string } | null;
}

const emptyEntry = (): OrderEntry => ({
  sku: '',
  productName: '',
  qty: '',
  variantId: null,
  selectedColor: '',
  lookingUp: false,
  error: '',
  variantOptions: [],
});

// ==================== PRODUCTION FORM STATE ====================

interface VariantInfo {
  id: string;
  color: string;
  colorHex: string;
  type: string;
  product: {
    id: string;
    sku: string;
    name: string;
    parentProductId?: string | null;
    parentProduct?: { sku: string; name: string } | null;
  };
}

export function CombinedEntryDialog({
  open,
  onOpenChange,
  onOrderCreated,
  onProductionAdded,
}: CombinedEntryDialogProps) {
  const [entryType, setEntryType] = useState<EntryType | null>(null);

  // Order form state
  const [entries, setEntries] = useState<OrderEntry[]>([emptyEntry()]);
  const [submittingOrder, setSubmittingOrder] = useState(false);
  const skuInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Production form state
  const [variants, setVariants] = useState<VariantInfo[]>([]);
  const [printers, setPrinters] = useState<Array<{ id: string; name: string; status: string }>>([]);
  const [selectedVariantId, setSelectedVariantId] = useState('');
  const [prodQty, setProdQty] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const [submittingProd, setSubmittingProd] = useState(false);
  const [loadingVariants, setLoadingVariants] = useState(false);

  const fetchVariants = useCallback(async () => {
    setLoadingVariants(true);
    try {
      const [prodRes, printerRes] = await Promise.all([
        fetch('/api/products'),
        fetch('/api/printers'),
      ]);
      if (prodRes.ok) {
        const data = await prodRes.json();
        const products = data.products || data;

        const allVariants: VariantInfo[] = [];
        for (const product of products) {
          if (product.variants && Array.isArray(product.variants)) {
            for (const v of product.variants) {
              allVariants.push({
                id: v.id,
                color: v.color,
                colorHex: v.colorHex,
                type: v.type || '',
                product: {
                  id: product.id,
                  sku: product.sku,
                  name: product.name,
                  parentProductId: product.parentProductId,
                  parentProduct: product.parentProduct || null,
                },
              });
            }
          }
        }
        setVariants(allVariants);
      }
      if (printerRes.ok) {
        const printerData = await printerRes.json();
        setPrinters(printerData);
      }
    } catch {
      // silent
    } finally {
      setLoadingVariants(false);
    }
  }, []);

  useEffect(() => {
    if (open && entryType === 'production') {
      fetchVariants();
    }
  }, [open, entryType, fetchVariants]);

  // Reset everything when dialog closes
  const handleClose = (val: boolean) => {
    if (!val) {
      setEntryType(null);
      setEntries([emptyEntry()]);
      setSubmittingOrder(false);
      setSelectedVariantId('');
      setProdQty('');
      setAssignedTo('');
      setSubmittingProd(false);
    }
    onOpenChange(val);
  };

  // ==================== ORDER FORM LOGIC ====================

  const addEntry = () => {
    setEntries((prev) => [...prev, emptyEntry()]);
    // Focus the new entry's SKU input after render
    setTimeout(() => {
      skuInputRefs.current[entries.length]?.focus();
    }, 50);
  };

  const removeEntry = (index: number) => {
    if (entries.length > 1) {
      setEntries((prev) => prev.filter((_, i) => i !== index));
    }
  };

  const updateEntry = (index: number, field: keyof OrderEntry, value: string) => {
    setEntries((prev) =>
      prev.map((entry, i) => {
        if (i !== index) return entry;
        const updated = { ...entry, [field]: value, error: '' };
        if (field === 'sku') {
          updated.variantId = null;
          updated.productName = '';
          updated.selectedColor = '';
          updated.variantOptions = [];
        }
        return updated;
      })
    );
  };

  const focusSkuInput = (index: number) => {
    setTimeout(() => skuInputRefs.current[index]?.focus(), 10);
  };

  // Auto-focus first entry when order form opens
  useEffect(() => {
    if (open && entryType === 'order') {
      setTimeout(() => skuInputRefs.current[0]?.focus(), 150);
    }
  }, [open, entryType]);

  const lookupSku = useCallback(async (index: number, sku: string) => {
    if (!sku.trim()) return;

    setEntries((prev) =>
      prev.map((entry, i) =>
        i === index ? { ...entry, lookingUp: true, error: '', variantOptions: [] } : entry
      )
    );

    try {
      const res = await fetch(`/api/barcode/lookup?code=${encodeURIComponent(sku.trim())}`);
      if (!res.ok) {
        const data = await res.json();
        setEntries((prev) =>
          prev.map((entry, i) =>
            i === index ? { ...entry, lookingUp: false, error: data.error || 'Product not found' } : entry
          )
        );
        // Re-focus the input on error so user can scan again
        setTimeout(() => skuInputRefs.current[index]?.focus(), 10);
        return;
      }
      const data = await res.json();

      if (data.variantId) {
        setEntries((prev) =>
          prev.map((entry, i) =>
            i === index
              ? {
                  ...entry,
                  lookingUp: false,
                  variantId: data.variantId,
                  productName: data.name,
                  sku: data.sku,
                  selectedColor: data.color,
                  variantOptions: [],
                  error: '',
                }
              : entry
          )
        );
        // Variant found — add a new blank entry and focus it
        const currentLength = entries.length;
        setEntries((prev) => {
          const newEntries = [...prev, emptyEntry()];
          return newEntries;
        });
        setTimeout(() => {
          skuInputRefs.current[index + 1]?.focus();
        }, 50);
      } else if (data.variants) {
        setEntries((prev) =>
          prev.map((entry, i) =>
            i === index
              ? {
                  ...entry,
                  lookingUp: false,
                  productName: data.name,
                  sku: data.sku,
                  variantId: null,
                  selectedColor: '',
                  variantOptions: data.variants.map((v: { id: string; color: string; colorHex: string; type: string; qty: number }) => ({
                    id: v.id,
                    color: v.color,
                    colorHex: v.colorHex,
                    type: v.type || '',
                    qty: v.qty,
                  })),
                  error: '',
                }
              : entry
          )
        );
        // Multiple variants — don't auto-add entry, user needs to pick color first
        // Input stays visible, no focus change needed
      }
    } catch {
      setEntries((prev) =>
        prev.map((entry, i) =>
          i === index ? { ...entry, lookingUp: false, error: 'Lookup failed' } : entry
        )
      );
      setTimeout(() => skuInputRefs.current[index]?.focus(), 10);
    }
  }, [entries.length]);

  const handleSkuBlur = (index: number) => {
    const entry = entries[index];
    if (entry.sku.trim() && !entry.variantId && entry.variantOptions.length === 0) {
      lookupSku(index, entry.sku);
    }
  };

  const handleVariantSelect = (index: number, variantId: string) => {
    setEntries((prev) =>
      prev.map((entry, i) => {
        if (i !== index) return entry;
        const selected = entry.variantOptions.find((v) => v.id === variantId);
        return {
          ...entry,
          variantId,
          selectedColor: selected?.color || '',
        };
      })
    );
  };

  const handleOrderSubmit = async () => {
    const validEntries = entries.filter((e) => e.variantId && e.qty);
    if (validEntries.length === 0) return;

    setSubmittingOrder(true);

    try {
      const orderNo = `ORD-${Date.now()}`;
      const items = validEntries.map((e) => ({
        variantId: e.variantId!,
        qty: parseInt(e.qty, 10),
      }));

      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderNo, items }),
      });

      if (!res.ok) {
        const data = await res.json();
        alert(data.error || 'Failed to create order');
        setSubmittingOrder(false);
        return;
      }

      setEntries([emptyEntry()]);
      setEntryType(null);
      onOpenChange(false);
      onOrderCreated?.();
    } catch {
      alert('Failed to create order. Please try again.');
    } finally {
      setSubmittingOrder(false);
    }
  };

  // ==================== PRODUCTION FORM LOGIC ====================

  const handleProdSubmit = async () => {
    if (!selectedVariantId || !prodQty || parseInt(prodQty, 10) <= 0) return;

    setSubmittingProd(true);
    try {
      const res = await fetch('/api/production', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          variantId: selectedVariantId,
          qty: parseInt(prodQty, 10),
          assignedTo: assignedTo.trim() || '',
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        alert(data.error || 'Failed to add production item');
        setSubmittingProd(false);
        return;
      }

      setSelectedVariantId('');
      setProdQty('');
      setAssignedTo('');
      setEntryType(null);
      onOpenChange(false);
      onProductionAdded?.();
    } catch {
      alert('Failed to add production item. Please try again.');
    } finally {
      setSubmittingProd(false);
    }
  };

  const selectedVariant = variants.find((v) => v.id === selectedVariantId);

  // ==================== RENDER ====================

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg rounded-xl max-h-[85vh]">
        {/* TYPE SELECTOR STEP */}
        {!entryType && (
          <>
            <DialogHeader>
              <DialogTitle className="text-[#2d3436]">Add New Entry</DialogTitle>
              <DialogDescription className="text-[#4b5563]">
                Choose what type of entry you want to create.
              </DialogDescription>
            </DialogHeader>

            <div className="grid grid-cols-2 gap-4 py-4">
              {/* Input Pesanan Card */}
              <button
                onClick={() => setEntryType('order')}
                className="group flex flex-col items-center gap-3 p-6 rounded-xl border-2 border-[#e8e8e8] hover:border-[#4a6741] hover:bg-[#4a6741]/5 transition-all duration-200 cursor-pointer"
              >
                <div className="w-14 h-14 rounded-xl bg-[#4a6741]/10 group-hover:bg-[#4a6741]/20 flex items-center justify-center transition-colors">
                  <ShoppingCart className="w-7 h-7 text-[#4a6741]" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-semibold text-[#2d3436]">Input Pesanan</p>
                  <p className="text-[11px] text-[#6b7280] mt-0.5">Create new order</p>
                </div>
              </button>

              {/* Production Card */}
              <button
                onClick={() => setEntryType('production')}
                className="group flex flex-col items-center gap-3 p-6 rounded-xl border-2 border-[#e8e8e8] hover:border-[#2563eb] hover:bg-[#2563eb]/5 transition-all duration-200 cursor-pointer"
              >
                <div className="w-14 h-14 rounded-xl bg-[#2563eb]/10 group-hover:bg-[#2563eb]/20 flex items-center justify-center transition-colors">
                  <Factory className="w-7 h-7 text-[#2563eb]" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-semibold text-[#2d3436]">Production</p>
                  <p className="text-[11px] text-[#6b7280] mt-0.5">Record production output</p>
                </div>
              </button>
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => handleClose(false)}
                className="rounded-full px-5"
              >
                Cancel
              </Button>
            </DialogFooter>
          </>
        )}

        {/* ORDER FORM */}
        {entryType === 'order' && (
          <>
            <DialogHeader>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setEntryType(null)}
                  className="p-1 rounded-md hover:bg-[#f0f0f0] transition-colors cursor-pointer"
                >
                  <svg className="w-4 h-4 text-[#4b5563]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <div>
                  <DialogTitle className="text-[#2d3436] flex items-center gap-2">
                    <ShoppingCart className="w-5 h-5 text-[#4a6741]" />
                    Input Pesanan
                  </DialogTitle>
                  <DialogDescription className="text-[#4b5563]">
                    Add new order entries. Enter SKU, pick a color variant, and set quantity.
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>

            <div className="space-y-4">
              <div className="grid grid-cols-[1fr_1fr_0.6fr_1fr_auto] gap-2 px-1 max-sm:hidden">
                <Label className="text-xs text-[#4b5563]">SKU</Label>
                <Label className="text-xs text-[#4b5563]">Product Name</Label>
                <Label className="text-xs text-[#4b5563]">Qty</Label>
                <Label className="text-xs text-[#4b5563]">Color Variant</Label>
                <div className="w-6" />
              </div>

              <div className="max-h-60 overflow-y-auto -webkit-overflow-scrolling-touch">
                <div className="space-y-2">
                  {entries.map((entry, idx) => (
                    <div key={idx} className="grid grid-cols-[1fr_1fr_0.6fr_1fr_auto] gap-2 items-center max-sm:grid-cols-1 max-sm:gap-1.5">
                      <div className="relative">
                        <Input
                          ref={(el) => { skuInputRefs.current[idx] = el; }}
                          value={entry.sku}
                          onChange={(e) => updateEntry(idx, 'sku', e.target.value)}
                          onBlur={() => handleSkuBlur(idx)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              if (entry.variantId) {
                                // Already found — add new entry and focus it
                                addEntry();
                              } else {
                                // Trigger lookup (will auto-focus after completion)
                                lookupSku(idx, entry.sku);
                              }
                            }
                          }}
                          placeholder="SKU"
                          disabled={entry.lookingUp}
                          autoFocus={idx === 0}
                          className="h-9 text-sm bg-[#f0f0f0] border-none focus-visible:ring-1 focus-visible:ring-[#4a6741]/30"
                        />
                      </div>
                      <Input
                        value={entry.productName}
                        onChange={(e) => updateEntry(idx, 'productName', e.target.value)}
                        placeholder="Product Name"
                        disabled
                        className="h-9 text-sm bg-[#f0f0f0] border-none opacity-70"
                      />
                      <Input
                        value={entry.qty}
                        onChange={(e) => updateEntry(idx, 'qty', e.target.value)}
                        placeholder="0"
                        type="number"
                        min="1"
                        className="h-9 text-sm bg-[#f0f0f0] border-none focus-visible:ring-1 focus-visible:ring-[#4a6741]/30"
                      />
                      {entry.variantOptions.length > 0 ? (
                        <Select
                          value={entry.selectedColor ? entry.variantId || '' : ''}
                          onValueChange={(val) => handleVariantSelect(idx, val)}
                        >
                          <SelectTrigger className="h-9 text-sm bg-[#f0f0f0] border-none focus:ring-1 focus:ring-[#4a6741]/30">
                            <SelectValue placeholder="Select color" />
                          </SelectTrigger>
                          <SelectContent>
                            {entry.variantOptions.map((v) => (
                              <SelectItem key={v.id} value={v.id}>
                                <div className="flex items-center gap-2">
                                  <span
                                    className="w-3 h-3 rounded-full border border-[#e8e8e8] flex-shrink-0"
                                    style={{ backgroundColor: v.colorHex }}
                                  />
                                  <span>{v.color}{v.type ? ` - ${v.type}` : ''}</span>
                                  <span className="text-[11px] text-[#6b7280]">(qty: {v.qty})</span>
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Input
                          value={entry.selectedColor}
                          onChange={(e) => updateEntry(idx, 'selectedColor', e.target.value)}
                          placeholder="Color"
                          disabled={!entry.variantId}
                          className="h-9 text-sm bg-[#f0f0f0] border-none opacity-70"
                        />
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeEntry(idx)}
                        disabled={entries.length <= 1}
                        className="w-6 h-6 p-0 text-[#4b5563] hover:text-[#dc2626] hover:bg-[#fef2f2] disabled:opacity-20"
                      >
                        ×
                      </Button>
                    </div>
                  ))}
                  {entries.some((e) => e.error) && (
                    <p className="text-xs text-[#dc2626]">
                      {entries.find((e) => e.error)?.error}
                    </p>
                  )}
                </div>
              </div>

              <Button
                variant="outline"
                onClick={addEntry}
                className="w-full border-dashed border-[#e8e8e8] text-[#4b5563] hover:text-[#4a6741] hover:border-[#4a6741] text-sm"
              >
                + Add Item
              </Button>
            </div>

            <DialogFooter className="gap-2">
              <Button
                variant="outline"
                onClick={() => setEntryType(null)}
                disabled={submittingOrder}
                className="rounded-full px-5"
              >
                Back
              </Button>
              <Button
                onClick={handleOrderSubmit}
                disabled={submittingOrder || entries.every((e) => !e.variantId || !e.qty)}
                className="bg-[#4a6741] hover:bg-[#3d5535] text-white rounded-full px-5 disabled:opacity-50"
              >
                {submittingOrder ? 'Submitting...' : 'Submit Order'}
              </Button>
            </DialogFooter>
          </>
        )}

        {/* PRODUCTION FORM */}
        {entryType === 'production' && (
          <>
            <DialogHeader>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setEntryType(null)}
                  className="p-1 rounded-md hover:bg-[#f0f0f0] transition-colors cursor-pointer"
                >
                  <svg className="w-4 h-4 text-[#4b5563]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <div>
                  <DialogTitle className="text-[#2d3436] flex items-center gap-2">
                    <Factory className="w-5 h-5 text-[#2563eb]" />
                    Add Production Item
                  </DialogTitle>
                  <DialogDescription className="text-[#4b5563]">
                    Record a new production entry. Stock will be added when marked as completed.
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>

            <div className="space-y-4">
              {/* Select Variant */}
              <div className="space-y-1.5">
                <Label className="text-xs text-[#4b5563] font-medium">Product Variant</Label>
                {loadingVariants ? (
                  <div className="h-9 bg-[#f0f0f0] rounded-md animate-pulse" />
                ) : (
                  <Select value={selectedVariantId} onValueChange={setSelectedVariantId}>
                    <SelectTrigger className="h-10 text-sm bg-[#f0f0f0] border-none focus:ring-1 focus:ring-[#4a6741]/30">
                      <SelectValue placeholder="Select a variant..." />
                    </SelectTrigger>
                    <SelectContent>
                      {variants.length === 0 ? (
                        <div className="px-2 py-3 text-sm text-[#6b7280] text-center">
                          No variants found. Add products first.
                        </div>
                      ) : (
                        variants.map((v) => (
                          <SelectItem key={v.id} value={v.id}>
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-[#2d3436]">{v.product.sku}</span>
                              <span className="text-[#4b5563]">·</span>
                              <span
                                className="w-3 h-3 rounded-full border border-[#e8e8e8] flex-shrink-0"
                                style={{ backgroundColor: v.colorHex }}
                              />
                              <span className="text-[#4b5563]">{v.color}{v.type ? ` - ${v.type}` : ''}</span>
                            </div>
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                )}
                {selectedVariant && (
                  <div className="text-[11px] text-[#6b7280] space-y-0.5">
                    <p>{selectedVariant.product.name} — {selectedVariant.color}{selectedVariant.type ? ` - ${selectedVariant.type}` : ''}</p>
                    {selectedVariant.product.parentProduct && (
                      <p className="text-[#2563eb] flex items-center gap-1">
                        <Layers className="w-3 h-3" />
                        Varian of {selectedVariant.product.parentProduct.sku} — stock will sync to group
                      </p>
                    )}
                    {!selectedVariant.product.parentProductId && selectedVariant.product.id && (
                      <p className="text-[#4a6741] flex items-center gap-1">
                        <Layers className="w-3 h-3" />
                        Master/Standalone — stock changes apply to this product only
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Quantity */}
              <div className="space-y-1.5">
                <Label className="text-xs text-[#4b5563] font-medium">Quantity to Produce</Label>
                <Input
                  value={prodQty}
                  onChange={(e) => setProdQty(e.target.value)}
                  placeholder="Enter quantity"
                  type="number"
                  min="1"
                  className="h-10 text-sm bg-[#f0f0f0] border-none focus-visible:ring-1 focus-visible:ring-[#4a6741]/30"
                />
              </div>

              {/* Printer */}
              <div className="space-y-1.5">
                <Label className="text-xs text-[#4b5563] font-medium">Printer</Label>
                {printers.length > 0 ? (
                  <Select value={assignedTo} onValueChange={setAssignedTo}>
                    <SelectTrigger className="h-10 text-sm bg-[#f0f0f0] border-none focus:ring-1 focus:ring-[#4a6741]/30">
                      <SelectValue placeholder="Select printer..." />
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
                ) : (
                  <Input
                    value={assignedTo}
                    onChange={(e) => setAssignedTo(e.target.value)}
                    placeholder="No printers configured yet"
                    className="h-10 text-sm bg-[#f0f0f0] border-none focus-visible:ring-1 focus-visible:ring-[#4a6741]/30"
                  />
                )}
              </div>
            </div>

            <DialogFooter className="gap-2">
              <Button
                variant="outline"
                onClick={() => setEntryType(null)}
                disabled={submittingProd}
                className="rounded-full px-5"
              >
                Back
              </Button>
              <Button
                onClick={handleProdSubmit}
                disabled={submittingProd || !selectedVariantId || !prodQty || parseInt(prodQty, 10) <= 0}
                className="bg-[#2563eb] hover:bg-[#2980b9] text-white rounded-full px-5 disabled:opacity-50"
              >
                {submittingProd ? 'Adding...' : 'Add to Production'}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
