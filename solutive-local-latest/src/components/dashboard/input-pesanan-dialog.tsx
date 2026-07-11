'use client';

import { useState, useCallback, useRef } from 'react';
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
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from '@/components/ui/popover';
import { ScanBarcode } from 'lucide-react';

interface InputPesananProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOrderCreated?: () => void;
}

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

function BarcodeScannerPopover({
  disabled,
  onScan,
}: {
  disabled: boolean;
  onScan: (code: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [barcode, setBarcode] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = () => {
    const trimmed = barcode.trim();
    if (!trimmed) return;
    onScan(trimmed);
    setBarcode('');
    setOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1 rounded-md text-[#4b5563] hover:text-[#4a6741] hover:bg-[#4a6741]/10 transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
          aria-label="Scan barcode"
        >
          <ScanBarcode className="w-3.5 h-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-64 p-3"
        side="bottom"
        align="start"
        sideOffset={4}
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          inputRef.current?.focus();
        }}
      >
        <p className="text-xs font-medium text-[#2d3436] mb-2">Barcode / SKU Entry</p>
        <div className="flex gap-2">
          <Input
            ref={inputRef}
            value={barcode}
            onChange={(e) => setBarcode(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Enter barcode..."
            className="h-8 text-sm bg-[#f0f0f0] border-none focus-visible:ring-1 focus-visible:ring-[#4a6741]/30"
          />
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={!barcode.trim()}
            className="h-8 px-3 bg-[#4a6741] hover:bg-[#3d5535] text-white text-xs rounded-md disabled:opacity-50"
          >
            Add
          </Button>
        </div>
        <p className="text-[11px] text-[#6b7280] mt-1.5">Enter a barcode or SKU and press Add or Enter</p>
      </PopoverContent>
    </Popover>
  );
}

export function InputPesananDialog({ open, onOpenChange, onOrderCreated }: InputPesananProps) {
  const [entries, setEntries] = useState<OrderEntry[]>([emptyEntry()]);
  const [submitting, setSubmitting] = useState(false);

  const addEntry = () => {
    setEntries((prev) => [emptyEntry(), ...prev]);
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
        // Clear product info when SKU changes
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
        return;
      }
      const data = await res.json();

      if (data.variantId) {
        // Barcode matched a specific variant — move entry to top
        const updated = {
          lookingUp: false as const,
          variantId: data.variantId,
          productName: data.name,
          sku: data.sku,
          selectedColor: data.color,
          variantOptions: [] as VariantOption[],
          error: '' as const,
        };
        setEntries((prev) => {
          const copy = prev.map((entry, i) => (i === index ? { ...entry, ...updated } : entry));
          const [moved] = copy.splice(index, 1);
          return [moved, ...copy];
        });
      } else if (data.variants) {
        // SKU matched — show variant options, move entry to top
        const updated = {
          lookingUp: false as const,
          productName: data.name,
          sku: data.sku,
          variantId: null as string | null,
          selectedColor: '' as string,
          variantOptions: data.variants.map((v: { id: string; color: string; colorHex: string; type: string; qty: number }) => ({
            id: v.id,
            color: v.color,
            colorHex: v.colorHex,
            type: v.type || '',
            qty: v.qty,
          })) as VariantOption[],
          error: '' as const,
        };
        setEntries((prev) => {
          const copy = prev.map((entry, i) => (i === index ? { ...entry, ...updated } : entry));
          const [moved] = copy.splice(index, 1);
          return [moved, ...copy];
        });
      }
    } catch {
      setEntries((prev) =>
        prev.map((entry, i) =>
          i === index ? { ...entry, lookingUp: false, error: 'Lookup failed' } : entry
        )
      );
    }
  }, []);

  const handleSkuBlur = (index: number) => {
    const entry = entries[index];
    if (entry.sku.trim() && !entry.variantId && entry.variantOptions.length === 0) {
      lookupSku(index, entry.sku);
    }
  };

  const handleBarcodeScan = (index: number, code: string) => {
    updateEntry(index, 'sku', code);
    lookupSku(index, code);
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

  const handleSubmit = async () => {
    const validEntries = entries.filter((e) => e.variantId && e.qty);
    if (validEntries.length === 0) return;

    setSubmitting(true);

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
        setSubmitting(false);
        return;
      }

      // Reset form and close
      setEntries([emptyEntry()]);
      onOpenChange(false);
      onOrderCreated?.();
    } catch {
      alert('Failed to create order. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg rounded-xl max-h-[85vh]">
        <DialogHeader>
          <DialogTitle className="text-[#2d3436]">Input Pesanan</DialogTitle>
          <DialogDescription className="text-[#4b5563]">
            Add new order entries. Enter SKU, pick a color variant, and set quantity.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Column headers */}
          <div className="grid grid-cols-[1fr_1fr_0.6fr_1fr_auto] gap-2 px-1">
            <Label className="text-xs text-[#4b5563]">SKU</Label>
            <Label className="text-xs text-[#4b5563]">Product Name</Label>
            <Label className="text-xs text-[#4b5563]">Qty</Label>
            <Label className="text-xs text-[#4b5563]">Color Variant</Label>
            <div className="w-6" />
          </div>

          <ScrollArea className="max-h-60">
            <div className="space-y-2">
              {entries.map((entry, idx) => (
                <div key={idx} className="grid grid-cols-[1fr_1fr_0.6fr_1fr_auto] gap-2 items-center">
                  <div className="relative">
                    <Input
                      value={entry.sku}
                      onChange={(e) => updateEntry(idx, 'sku', e.target.value)}
                      onBlur={() => handleSkuBlur(idx)}
                      placeholder="SKU"
                      disabled={entry.lookingUp}
                      className="h-9 text-sm bg-[#f0f0f0] border-none focus-visible:ring-1 focus-visible:ring-[#4a6741]/30 pr-8"
                    />
                    <BarcodeScannerPopover
                      disabled={entry.lookingUp}
                      onScan={(code) => handleBarcodeScan(idx, code)}
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
          </ScrollArea>

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
            onClick={() => onOpenChange(false)}
            disabled={submitting}
            className="rounded-full px-5"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={submitting || entries.every((e) => !e.variantId || !e.qty)}
            className="bg-[#4a6741] hover:bg-[#3d5535] text-white rounded-full px-5 disabled:opacity-50"
          >
            {submitting ? 'Submitting...' : 'Submit Order'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
