'use client';

import { useState, useEffect, useCallback } from 'react';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface AddProductionProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onProductionAdded?: () => void;
}

interface VariantInfo {
  id: string;
  color: string;
  colorHex: string;
  type: string;
  product: {
    sku: string;
    name: string;
  };
}

interface PrinterOption {
  id: string;
  name: string;
  status: string;
}

export function AddProductionDialog({ open, onOpenChange, onProductionAdded }: AddProductionProps) {
  const [variants, setVariants] = useState<VariantInfo[]>([]);
  const [selectedVariantId, setSelectedVariantId] = useState('');
  const [qty, setQty] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [loadingVariants, setLoadingVariants] = useState(false);
  const [printers, setPrinters] = useState<PrinterOption[]>([]);

  const workingPrinters = printers.filter(p => p.status === 'Working');

  const fetchVariants = useCallback(async () => {
    setLoadingVariants(true);
    try {
      const [productsRes, printersRes] = await Promise.all([
        fetch('/api/products'),
        fetch('/api/printers'),
      ]);

      if (productsRes.ok) {
        const data = await productsRes.json();
        const products = data.products || data;

        // Flatten all variants with product info
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
                  sku: product.sku,
                  name: product.name,
                },
              });
            }
          }
        }
        setVariants(allVariants);
      }

      if (printersRes.ok) {
        const printersData = await printersRes.json();
        setPrinters(printersData);
      }
    } catch {
      // silent
    } finally {
      setLoadingVariants(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      fetchVariants();
    }
  }, [open, fetchVariants]);

  const resetForm = () => {
    setSelectedVariantId('');
    setQty('');
    setAssignedTo('');
  };

  const handleSubmit = async () => {
    if (!selectedVariantId || !qty || parseInt(qty, 10) <= 0) return;

    setSubmitting(true);
    try {
      const res = await fetch('/api/production', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          variantId: selectedVariantId,
          qty: parseInt(qty, 10),
          assignedTo: assignedTo.trim() || '',
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        alert(data.error || 'Failed to add production item');
        setSubmitting(false);
        return;
      }

      resetForm();
      onOpenChange(false);
      onProductionAdded?.();
    } catch {
      alert('Failed to add production item. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const selectedVariant = variants.find((v) => v.id === selectedVariantId);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) resetForm(); onOpenChange(v); }}>
      <DialogContent className="sm:max-w-md rounded-xl">
        <DialogHeader>
          <DialogTitle className="text-[#2d3436]">Add Production Item</DialogTitle>
          <DialogDescription className="text-[#4b5563]">
            Record a new production entry. Stock will be added when marked as completed.
          </DialogDescription>
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
              <p className="text-[11px] text-[#6b7280]">
                {selectedVariant.product.name} — {selectedVariant.color}{selectedVariant.type ? ` - ${selectedVariant.type}` : ''}
              </p>
            )}
          </div>

          {/* Quantity */}
          <div className="space-y-1.5">
            <Label className="text-xs text-[#4b5563] font-medium">Quantity to Produce</Label>
            <Input
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              placeholder="Enter quantity"
              type="number"
              min="1"
              className="h-10 text-sm bg-[#f0f0f0] border-none focus-visible:ring-1 focus-visible:ring-[#4a6741]/30"
            />
          </div>

          {/* Printer (Assigned To) */}
          <div className="space-y-1.5">
            <Label className="text-xs text-[#4b5563] font-medium">Printer (optional)</Label>
            {workingPrinters.length > 0 ? (
              <Select value={assignedTo || '__none__'} onValueChange={(val) => setAssignedTo(val === '__none__' ? '' : val)}>
                <SelectTrigger className="h-10 text-sm bg-[#f0f0f0] border-none focus:ring-1 focus:ring-[#4a6741]/30">
                  <SelectValue placeholder="Select printer..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">
                    <span className="text-[#6b7280] italic">— No Printer —</span>
                  </SelectItem>
                  {workingPrinters.map((printer) => (
                    <SelectItem key={printer.id} value={printer.name}>
                      <span className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-[#15803d]" />
                        <span>{printer.name}</span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input
                value={assignedTo}
                onChange={(e) => setAssignedTo(e.target.value)}
                placeholder="Worker name (no printers available)"
                className="h-10 text-sm bg-[#f0f0f0] border-none focus-visible:ring-1 focus-visible:ring-[#4a6741]/30"
              />
            )}
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => { resetForm(); onOpenChange(false); }}
            disabled={submitting}
            className="rounded-full px-5"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={submitting || !selectedVariantId || !qty || parseInt(qty, 10) <= 0}
            className="bg-[#4a6741] hover:bg-[#3d5535] text-white rounded-full px-5 disabled:opacity-50"
          >
            {submitting ? 'Adding...' : 'Add to Production'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
