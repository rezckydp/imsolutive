'use client';

import { useState, useMemo, useCallback } from 'react';
import { X, Loader2, ArrowUpDown, Play } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export interface PrintQueueItem {
  id: string;
  variantId: string;
  sku: string;
  name: string;
  color: string;
  colorHex: string;
  type: string;
  qty: number;
  status: string;
  note: string;
}

interface PrintQueueCardProps {
  items?: PrintQueueItem[];
  loading?: boolean;
  onRemoveItem?: (id: string) => void;
  onUpdateItem?: (id: string, data: { qty?: number; status?: string }) => void;
  onSendToProduction?: (item: PrintQueueItem) => void;
}

function getStatusStyle(status: string) {
  switch (status) {
    case 'Priority':
      return 'bg-[#dc2626] text-white border-0';
    case 'Urgent':
      return 'bg-[#b91c1c] text-white border-0';
    case 'Normal':
      return 'bg-[#d97706] text-white border-0';
    default:
      return 'bg-gray-100 text-gray-700';
  }
}

const STATUS_ORDER: Record<string, number> = {
  'Priority': 0,
  'Urgent': 1,
  'Normal': 2,
};

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
          <td className="py-2.5 px-3">
            <Skeleton className="h-7 w-14" />
          </td>
          <td className="py-2.5 px-3">
            <Skeleton className="h-7 w-20" />
          </td>
          <td className="py-2.5 px-1 w-8" />
        </tr>
      ))}
    </>
  );
}

export function PrintQueueCard({ items = [], loading = false, onRemoveItem, onUpdateItem, onSendToProduction }: PrintQueueCardProps) {
  const [editingQtyId, setEditingQtyId] = useState<string | null>(null);
  const [editingQtyValue, setEditingQtyValue] = useState('');
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [sendingToProductionId, setSendingToProductionId] = useState<string | null>(null);
  const [sortAsc, setSortAsc] = useState(true); // true = Priority first

  // Sort items by urgency: Priority > Urgent > Normal
  const sortedItems = useMemo(() => {
    if (!sortAsc) return items;
    return [...items].sort((a, b) => {
      const orderA = STATUS_ORDER[a.status] ?? 99;
      const orderB = STATUS_ORDER[b.status] ?? 99;
      if (orderA !== orderB) return orderA - orderB;
      return 0;
    });
  }, [items, sortAsc]);

  const handleQtySave = useCallback(async (id: string) => {
    const newQty = parseInt(editingQtyValue, 10);
    if (isNaN(newQty) || newQty < 1) {
      setEditingQtyId(null);
      return;
    }
    setUpdatingId(id);
    try {
      await onUpdateItem?.(id, { qty: newQty });
    } finally {
      setUpdatingId(null);
      setEditingQtyId(null);
    }
  }, [editingQtyValue, onUpdateItem]);

  const handleQtyBlur = useCallback((id: string) => {
    handleQtySave(id);
  }, [handleQtySave]);

  const handleQtyKeyDown = useCallback((e: React.KeyboardEvent, id: string) => {
    if (e.key === 'Enter') {
      handleQtySave(id);
    } else if (e.key === 'Escape') {
      setEditingQtyId(null);
    }
  }, [handleQtySave]);

  const handleStatusChange = useCallback(async (id: string, newStatus: string) => {
    setUpdatingId(id);
    try {
      await onUpdateItem?.(id, { status: newStatus });
    } finally {
      setUpdatingId(null);
    }
  }, [onUpdateItem]);

  const startEditQty = (id: string, currentQty: number) => {
    setEditingQtyId(id);
    setEditingQtyValue(String(currentQty));
  };

  const handleSendToProduction = async (item: PrintQueueItem) => {
    setSendingToProductionId(item.id);
    try {
      await onSendToProduction?.(item);
    } finally {
      setSendingToProductionId(null);
    }
  };

  return (
    <Card className="rounded-xl shadow-sm border-0">
      <CardHeader className="pb-3 px-4 pt-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold text-[#2d3436]">Print Queue</CardTitle>
          <button
            onClick={() => setSortAsc(!sortAsc)}
            className="flex items-center gap-1 px-1.5 py-1 rounded-md hover:bg-[#f0f0f0] transition-colors cursor-pointer"
            title={sortAsc ? 'Sorted: Priority first' : 'Sorted: Default order'}
          >
            <ArrowUpDown className="w-3.5 h-3.5 text-[#4b5563]" />
            <span className="text-[11px] text-[#4b5563] font-medium">
              {sortAsc ? 'Urgency' : 'Default'}
            </span>
          </button>
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-4 pt-0">
        <div className="rounded-lg border border-[#e8e8e8] overflow-x-auto -webkit-overflow-scrolling-touch">
          <table className="w-full min-w-[450px]">
            <thead>
              <tr className="bg-[#f5f6fa]">
                <th className="text-left text-xs font-medium text-[#4b5563] py-2 px-3">Product</th>
                <th className="text-left text-xs font-medium text-[#4b5563] py-2 px-3">Color</th>
                <th className="text-right text-xs font-medium text-[#4b5563] py-2 px-3">Qty</th>
                <th className="text-left text-xs font-medium text-[#4b5563] py-2 px-3">Status</th>
                <th className="w-16"></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <SkeletonRows />
              ) : sortedItems.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-6 text-sm text-[#4b5563]">
                    No items in queue
                  </td>
                </tr>
              ) : (
                sortedItems.map((item) => (
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
                    <td className="py-2.5 px-3 text-right">
                      {editingQtyId === item.id ? (
                        <Input
                          value={editingQtyValue}
                          onChange={(e) => setEditingQtyValue(e.target.value)}
                          onBlur={() => handleQtyBlur(item.id)}
                          onKeyDown={(e) => handleQtyKeyDown(e, item.id)}
                          type="number"
                          min="1"
                          autoFocus
                          disabled={updatingId === item.id}
                          className="h-7 w-16 text-sm text-right bg-white border border-[#4a6741]/30 focus-visible:ring-1 focus-visible:ring-[#4a6741] px-2"
                        />
                      ) : (
                        <button
                          onClick={() => startEditQty(item.id, item.qty)}
                          className="text-sm text-[#2d3436] font-medium hover:text-[#4a6741] hover:underline cursor-pointer transition-colors"
                        >
                          {updatingId === item.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin inline" />
                          ) : (
                            item.qty
                          )}
                        </button>
                      )}
                    </td>
                    <td className="py-2.5 px-3">
                      <Select
                        value={item.status}
                        onValueChange={(val) => handleStatusChange(item.id, val)}
                        disabled={updatingId === item.id}
                      >
                        <SelectTrigger className={`h-7 w-[100px] text-[11px] px-2 rounded-full font-semibold border-0 ${getStatusStyle(item.status)}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Priority">
                            <span className="flex items-center gap-1.5">
                              <span className="w-2 h-2 rounded-full bg-[#dc2626]" />
                              Priority
                            </span>
                          </SelectItem>
                          <SelectItem value="Normal">
                            <span className="flex items-center gap-1.5">
                              <span className="w-2 h-2 rounded-full bg-[#d97706]" />
                              Normal
                            </span>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="py-2.5 px-1">
                      <div className="flex items-center gap-0.5 justify-end">
                        <button
                          onClick={() => handleSendToProduction(item)}
                          disabled={sendingToProductionId === item.id}
                          className="p-1.5 rounded-md bg-[#4a6741]/10 hover:bg-[#4a6741]/20 text-[#4a6741] transition-colors cursor-pointer disabled:opacity-50"
                          title="Send to Production"
                        >
                          {sendingToProductionId === item.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Play className="w-3.5 h-3.5" />
                          )}
                        </button>
                        <button
                          onClick={() => onRemoveItem?.(item.id)}
                          className="p-1 rounded hover:bg-[#f5f6fa] transition-colors cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5 text-[#4b5563] hover:text-[#dc2626]" />
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
