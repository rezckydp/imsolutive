'use client';

import { useState, useEffect, useCallback } from 'react';
import { Check, Loader2, RotateCcw, Printer as PrinterIcon } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';

export interface ProductionItem {
  id: string;
  variantId: string;
  sku: string;
  name: string;
  color: string;
  colorHex: string;
  type: string;
  qty: number;
  assignedTo: string;
  note: string;
}

interface PrinterOption {
  id: string;
  name: string;
  status: string;
}

interface InProductionCardProps {
  items?: ProductionItem[];
  loading?: boolean;
  onComplete?: (id: string) => void;
  onSendBack?: (item: ProductionItem) => void;
  onAdd?: () => void;
  onUpdatePrinter?: (itemId: string, printerName: string) => void;
}

function SkeletonRows() {
  return (
    <>
      {[...Array(5)].map((_, i) => (
        <tr key={i} className="border-t border-[#f0f0f0]">
          <td className="py-2.5 px-3">
            <Skeleton className="h-4 w-16" />
          </td>
          <td className="py-2.5 px-3">
            <div className="flex items-center gap-2">
              <Skeleton className="h-2.5 w-2.5 rounded-full" />
              <Skeleton className="h-4 w-14" />
            </div>
          </td>
          <td className="py-2.5 px-3 text-right">
            <Skeleton className="h-4 w-6 ml-auto" />
          </td>
          <td className="py-2.5 px-3">
            <Skeleton className="h-7 w-28" />
          </td>
          <td className="py-2.5 px-1">
            <Skeleton className="h-7 w-7 rounded-md" />
          </td>
        </tr>
      ))}
    </>
  );
}

export function InProductionCard({ items = [], loading = false, onComplete, onSendBack, onAdd, onUpdatePrinter }: InProductionCardProps) {
  const [completingId, setCompletingId] = useState<string | null>(null);
  const [sendingBackId, setSendingBackId] = useState<string | null>(null);
  const [printers, setPrinters] = useState<PrinterOption[]>([]);
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);
  const [updatingPrinterId, setUpdatingPrinterId] = useState<string | null>(null);

  const fetchPrinters = useCallback(async () => {
    try {
      const res = await fetch('/api/printers');
      if (res.ok) {
        const data = await res.json();
        setPrinters(data);
      }
    } catch {
      // silent - printers are optional
    }
  }, []);

  useEffect(() => {
    fetchPrinters();
  }, [fetchPrinters]);

  const handleComplete = async (id: string) => {
    setCompletingId(id);
    try {
      await onComplete?.(id);
    } finally {
      setCompletingId(null);
    }
  };

  const handleSendBack = async (item: ProductionItem) => {
    setSendingBackId(item.id);
    try {
      await onSendBack?.(item);
    } finally {
      setSendingBackId(null);
    }
  };

  const handlePrinterChange = async (itemId: string, printerName: string) => {
    setUpdatingPrinterId(itemId);
    setOpenDropdownId(null);
    try {
      // Try to update via the production API
      let success = false;
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          const res = await fetch(`/api/production/${itemId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ assignedTo: printerName }),
          });
          if (res.ok) {
            success = true;
            break;
          }
        } catch {
          // retry
        }
        if (attempt < 2) await new Promise(r => setTimeout(r, 1500));
      }
      if (success) {
        toast.success(`Printer diubah ke ${printerName}`);
        onUpdatePrinter?.(itemId, printerName);
      } else {
        throw new Error('Gagal update printer');
      }
    } catch {
      toast.error('Gagal mengubah printer. Coba lagi.');
    } finally {
      setUpdatingPrinterId(null);
    }
  };

  const workingPrinters = printers.filter(p => p.status === 'Working');
  const allPrintersAvailable = workingPrinters.length > 0;

  return (
    <Card className="rounded-xl shadow-sm border-0">
      <CardHeader className="pb-3 px-4 pt-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold text-[#2d3436]">In Production</CardTitle>
          {printers.length > 0 && (
            <div className="flex items-center gap-1 text-[11px] text-[#6b7280]">
              <PrinterIcon className="w-3 h-3" />
              {workingPrinters.length} printer aktif
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-4 pt-0">
        <div className="rounded-lg border border-[#e8e8e8] overflow-x-auto -webkit-overflow-scrolling-touch">
          <table className="w-full min-w-[500px]">
            <thead>
              <tr className="bg-[#f5f6fa]">
                <th className="text-left text-xs font-medium text-[#4b5563] py-2 px-3">Product</th>
                <th className="text-left text-xs font-medium text-[#4b5563] py-2 px-3">Color</th>
                <th className="text-right text-xs font-medium text-[#4b5563] py-2 px-3">Qty</th>
                <th className="text-left text-xs font-medium text-[#4b5563] py-2 px-3">Printer</th>
                <th className="w-[76px] text-center text-xs font-medium text-[#4b5563] py-2 px-1">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <SkeletonRows />
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-6 text-sm text-[#4b5563]">
                    No items in production
                  </td>
                </tr>
              ) : (
                items.map((item) => (
                  <tr
                    key={item.id}
                    className="border-t border-[#f0f0f0] hover:bg-[#fafafa] transition-colors"
                  >
                    <td className="py-2.5 px-3">
                      <span className="text-sm font-semibold text-[#2d3436] bg-[#f0f0f0] px-1.5 py-0.5 rounded">
                        {item.sku}
                      </span>
                      <p className="text-[11px] text-[#6b7280] mt-0.5 truncate max-w-[80px]">{item.name}</p>
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="flex items-center gap-2">
                        <span
                          className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                          style={{ backgroundColor: item.colorHex }}
                        />
                        <div className="min-w-0">
                          <span className="text-sm text-[#4b5563]">{item.color}{item.type ? ` - ${item.type}` : ''}</span>
                          {item.note && (
                            <p className="text-[11px] text-[#d97706] font-medium truncate max-w-[100px]" title={item.note}>
                              {item.note}
                            </p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-right text-sm text-[#2d3436] font-medium">
                      {item.qty}
                    </td>
                    <td className="py-2.5 px-3">
                      {updatingPrinterId === item.id ? (
                        <div className="flex items-center gap-1">
                          <Loader2 className="w-3 h-3 animate-spin text-[#d97706]" />
                          <span className="text-[11px] text-[#6b7280]">Updating...</span>
                        </div>
                      ) : allPrintersAvailable ? (
                        <Select
                          value={item.assignedTo || '__none__'}
                          onValueChange={(val) => {
                            if (val === '__none__') {
                              handlePrinterChange(item.id, '');
                            } else {
                              handlePrinterChange(item.id, val);
                            }
                          }}
                        >
                          <SelectTrigger className="h-7 text-[11px] bg-[#f1c40f]/10 border-[#f1c40f]/30 rounded-full px-2 py-0 w-auto min-w-[90px] max-w-[120px] focus:ring-1 focus:ring-[#f1c40f]/40 hover:bg-[#f1c40f]/20 transition-colors">
                            <SelectValue placeholder="Pilih Printer">
                              {item.assignedTo ? (
                                <span className="flex items-center gap-1 truncate">
                                  <Check className="w-2.5 h-2.5 text-[#4a6741] flex-shrink-0" />
                                  <span className="truncate">{item.assignedTo}</span>
                                </span>
                              ) : (
                                <span className="text-[#6b7280] truncate">Pilih Printer</span>
                              )}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">
                              <span className="text-[#6b7280] italic">— Tanpa Printer —</span>
                            </SelectItem>
                            {workingPrinters.map((printer) => (
                              <SelectItem key={printer.id} value={printer.name}>
                                <span className="flex items-center gap-2">
                                  <span className="w-2 h-2 rounded-full flex-shrink-0 bg-[#15803d]" />
                                  <span className="truncate">{printer.name}</span>
                                </span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Badge
                          variant="outline"
                          className="text-[11px] px-2 py-0.5 rounded-full font-semibold bg-[#f1c40f]/10 text-[#2d3436] border-[#f1c40f]/30 gap-1"
                        >
                          {item.assignedTo || (
                            <span className="text-[#6b7280]">—</span>
                          )}
                        </Badge>
                      )}
                    </td>
                    <td className="py-2.5 px-1">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => handleSendBack(item)}
                          disabled={sendingBackId === item.id}
                          className="p-1.5 rounded-md bg-[#e67e22]/10 hover:bg-[#e67e22]/20 text-[#e67e22] transition-colors cursor-pointer disabled:opacity-60"
                          title="Send back to Print Queue"
                        >
                          {sendingBackId === item.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <RotateCcw className="w-3.5 h-3.5" />
                          )}
                        </button>
                        <button
                          onClick={() => handleComplete(item.id)}
                          disabled={completingId === item.id || sendingBackId === item.id}
                          className="p-1.5 rounded-md bg-[#4a6741] hover:bg-[#3d5535] text-white transition-colors cursor-pointer disabled:opacity-60"
                          title="Mark as completed"
                        >
                          {completingId === item.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Check className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
