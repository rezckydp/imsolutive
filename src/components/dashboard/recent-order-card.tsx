'use client';

import { useState, useEffect } from 'react';
import { CheckCircle2, Clock, Eye, Pencil, Trash2, AlertCircle, ChevronDown, ChevronUp, ShoppingCart, Printer, ArrowRight, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
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
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

export interface RecentOrderItem {
  id: string;
  orderId: string;
  orderNo: string;
  variantId: string;
  sku: string;
  name: string;
  color: string;
  colorHex: string;
  type: string;
  orderedQty: number;
  currentStock: number;
  itemStatus: string;       // Ready, Not Ready, In Queue (from OrderItem.status)
  orderStatus: string;      // Pending, Processing, Completed, Cancelled (from Order.status)
  note: string;             // Custom color note
  createdAt: string;
}

interface RecentOrderCardProps {
  items?: RecentOrderItem[];
  loading?: boolean;
  onDataChange?: () => void;
}

function TableSkeleton() {
  return (
    <tr className="border-t border-[#f0f0f0]">
      <td className="py-3 px-4"><Skeleton className="h-4 w-24" /></td>
      <td className="py-3 px-4"><Skeleton className="h-4 w-20" /></td>
      <td className="py-3 px-4 text-right"><Skeleton className="h-4 w-8 ml-auto" /></td>
      <td className="py-3 px-4"><Skeleton className="h-5 w-24 rounded-full" /></td>
      <td className="py-3 px-4"><Skeleton className="h-8 w-20" /></td>
    </tr>
  );
}

function formatDate(isoString: string) {
  const d = new Date(isoString);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[d.getMonth()]} ${d.getDate().toString().padStart(2, '0')}, ${d.getFullYear()}`;
}

export function RecentOrderCard({ items = [], loading = false, onDataChange }: RecentOrderCardProps) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'urgency' | 'newest' | 'oldest' | 'pickingList'>('urgency');
  const [expanded, setExpanded] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [detailOrderId, setDetailOrderId] = useState<string | null>(null);
  const [deleteItemTarget, setDeleteItemTarget] = useState<{ orderId: string; itemId: string; sku: string; color: string } | null>(null);
  const [editingItem, setEditingItem] = useState<RecentOrderItem | null>(null);
  const [editQty, setEditQty] = useState<number>(1);
  const [editNote, setEditNote] = useState<string>('');
  const [editVariantId, setEditVariantId] = useState<string>('');
  const [variantOptions, setVariantOptions] = useState<Array<{ id: string; color: string; colorHex: string; type: string; qty: number }>>([]);
  const [loadingVariants, setLoadingVariants] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Filter out cancelled orders from display
  const activeItems = items.filter((i) => i.orderStatus !== 'Cancelled');

  // Status priority for "urgency" sort: Not Ready needs action first, then In Queue, then Ready
  const statusRank = (status: string) => {
    if (status === 'Not Ready') return 0;
    if (status === 'In Queue') return 1;
    return 2; // Ready
  };

  const sortedItems = [...activeItems].sort((a, b) => {
    if (sortBy === 'urgency') {
      const rankDiff = statusRank(a.itemStatus) - statusRank(b.itemStatus);
      if (rankDiff !== 0) return rankDiff;
      // Within the same status, oldest first (FIFO — longest-waiting order gets fulfilled first)
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    }
    if (sortBy === 'oldest') {
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    }
    if (sortBy === 'pickingList') {
      return a.orderNo.localeCompare(b.orderNo);
    }
    // newest (default fallback)
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  // FIFO order index (chronological) for Not Ready items — oldest = #1
  const notReadyFifoMap = new Map<string, number>();
  [...activeItems]
    .filter((i) => i.itemStatus === 'Not Ready')
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    .forEach((item, idx) => notReadyFifoMap.set(item.id, idx + 1));

  const filteredItems = sortedItems.filter((item) => {
    const matchSearch =
      search === '' ||
      item.sku.toLowerCase().includes(search.toLowerCase()) ||
      item.name.toLowerCase().includes(search.toLowerCase()) ||
      item.color.toLowerCase().includes(search.toLowerCase()) ||
      item.orderNo.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === 'all' || item.itemStatus === statusFilter;
    return matchSearch && matchStatus;
  });

  const displayItems = expanded ? filteredItems : filteredItems.slice(0, 5);
  const hasMore = filteredItems.length > 5;

  const handleSendToQueue = async (item: RecentOrderItem) => {
    setActionLoading(item.id);
    try {
      const res = await fetch(`/api/orders/${item.orderId}/item/${item.id}`, {
        method: 'PATCH',
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed');
      }
      toast.success(`${item.sku} — ${item.color}${item.type ? ` - ${item.type}` : ''} sent to Print Queue`);
      onDataChange?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to send to Print Queue');
    } finally {
      setActionLoading(null);
    }
  };

  const handleResync = async () => {
    setSyncing(true);
    try {
      const res = await fetch('/api/print-queue/resync', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      toast.success(data.message || 'Status disinkronkan.');
      onDataChange?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal sinkronisasi');
    } finally {
      setSyncing(false);
    }
  };


  useEffect(() => {
    if (!editingItem) {
      setVariantOptions([]);
      return;
    }
    setLoadingVariants(true);
    fetch(`/api/barcode/lookup?code=${encodeURIComponent(editingItem.sku)}`)
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data.variants)) {
          setVariantOptions(data.variants);
        } else {
          setVariantOptions([]);
        }
      })
      .catch(() => setVariantOptions([]))
      .finally(() => setLoadingVariants(false));
  }, [editingItem]);

  const handleDeleteItem = async () => {
    if (!deleteItemTarget) return;
    setActionLoading(deleteItemTarget.itemId);
    try {
      const res = await fetch(`/api/orders/${deleteItemTarget.orderId}/item/${deleteItemTarget.itemId}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed');
      }
      toast.success('Item dihapus. Stok dikembalikan.');
      setDeleteItemTarget(null);
      onDataChange?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal menghapus item');
    } finally {
      setActionLoading(null);
    }
  };

  // Stats
  const notReadyCount = activeItems.filter((i) => i.itemStatus === 'Not Ready').length;

  return (
    <>
      <Card className="rounded-xl shadow-sm border-0">
        <CardHeader className="pb-3 px-4 pt-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-3">
              <CardTitle className="text-sm font-semibold text-[#2d3436]">Recent Order</CardTitle>
              <div className="flex items-center gap-2">
                <Badge className="text-[11px] px-2 py-0 rounded-full bg-[#dc2626]/10 text-[#dc2626] border-[#dc2626]/30 gap-1" variant="outline">
                  <Clock className="w-2.5 h-2.5" />
                  {notReadyCount} Belum Ready
                </Badge>
                <button
                  onClick={handleResync}
                  disabled={syncing}
                  title="Sinkronkan status In Queue dengan Print Queue"
                  className="text-[11px] text-[#6b7280] hover:text-[#4a6741] flex items-center gap-1 cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw className={`w-3 h-3 ${syncing ? 'animate-spin' : ''}`} />
                  {syncing ? 'Syncing...' : 'Sync Status'}
                </button>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#6b7280]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <Input
                  placeholder="Search..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-8 h-8 text-xs rounded-lg bg-[#f5f6fa] border-[#e8e8e8] w-[160px]"
                />
              </div>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="h-8 text-xs rounded-lg bg-white border-[#e8e8e8] px-2 text-[#4b5563] focus:outline-none focus:ring-1 focus:ring-[#4a6741]/30 cursor-pointer"
              >
                <option value="all">All Status</option>
                <option value="Ready">Ready</option>
                <option value="Not Ready">Not Ready</option>
                <option value="In Queue">In Queue</option>
              </select>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                className="h-8 text-xs rounded-lg bg-white border-[#e8e8e8] px-2 text-[#4b5563] focus:outline-none focus:ring-1 focus:ring-[#4a6741]/30 cursor-pointer"
              >
                <option value="urgency">Sort: Urgency</option>
                <option value="oldest">Sort: Terlama</option>
                <option value="newest">Sort: Terbaru</option>
                <option value="pickingList">Sort: No. Picking List</option>
              </select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="px-4 pb-4 pt-0">
          <div className="rounded-xl border border-[#e8e8e8] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-[#f5f6fa]">
                    <th className="text-left text-xs font-medium text-[#4b5563] py-3 px-4">Date</th>
                    <th className="text-left text-xs font-medium text-[#4b5563] py-3 px-4">Product</th>
                    <th className="text-left text-xs font-medium text-[#4b5563] py-3 px-4">Color</th>
                    <th className="text-right text-xs font-medium text-[#4b5563] py-3 px-4">Qty</th>
                    <th className="text-left text-xs font-medium text-[#4b5563] py-3 px-4">Status</th>
                    <th className="text-right text-xs font-medium text-[#4b5563] py-3 px-4">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <>
                      <TableSkeleton />
                      <TableSkeleton />
                      <TableSkeleton />
                      <TableSkeleton />
                      <TableSkeleton />
                    </>
                  ) : filteredItems.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center py-10">
                        <div className="flex flex-col items-center gap-3">
                          <div className="w-12 h-12 rounded-full bg-[#f5f6fa] flex items-center justify-center">
                            <ShoppingCart className="w-6 h-6 text-[#6b7280]" />
                          </div>
                          <p className="text-sm text-[#4b5563]">No recent orders yet</p>
                          <p className="text-xs text-[#6b7280]">Orders will appear here after scanning</p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    <>
                      {displayItems.map((item, idx) => (
                        <tr
                          key={item.id}
                          className={`border-t border-[#f0f0f0] hover:bg-[#fafafa] transition-colors ${
                            item.itemStatus === 'Ready' ? 'bg-[#15803d]/[0.02]' : ''
                          }`}
                        >
                          <td className="py-3 px-4">
                            <span className="text-xs text-[#6b7280]">
                              {formatDate(item.createdAt)}
                            </span>
                            <button
                              onClick={() => setDetailOrderId(item.orderId)}
                              title="Lihat semua item di Picking List ini"
                              className="flex items-center gap-1 text-[11px] text-[#4a6741] mt-0.5 hover:underline cursor-pointer font-medium"
                            >
                              <Eye className="w-3 h-3" />
                              {item.orderNo}
                            </button>
                          </td>
                          <td className="py-3 px-4">
                            <span className="text-sm font-semibold text-[#4a6741] bg-[#f0f0f0] px-1.5 py-0.5 rounded">
                              {item.sku}
                            </span>
                            <p className="text-[11px] text-[#6b7280] mt-0.5 truncate max-w-[120px]">{item.name}</p>
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2">
                              <span
                                className="w-3 h-3 rounded-full flex-shrink-0 border border-gray-300"
                                style={{ backgroundColor: item.colorHex }}
                              />
                              <div className="min-w-0">
                                <span className="text-sm text-[#4b5563]">{item.color}{item.type ? ` - ${item.type}` : ''}</span>
                                {item.note && (
                                  <p className="text-[11px] text-[#d97706] font-medium truncate max-w-[120px]" title={item.note}>
                                    {item.note}
                                  </p>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <span className="text-sm text-[#2d3436] font-medium">{item.orderedQty}</span>
                            <p className="text-[11px] text-[#6b7280]">
                              stock: {item.currentStock}
                            </p>
                          </td>
                          <td className="py-3 px-4">
                            <Badge
                              className={`text-[11px] px-2 py-0.5 rounded-full font-semibold gap-1 ${
                                item.itemStatus === 'Ready'
                                  ? 'bg-[#15803d]/10 text-[#15803d] border-[#15803d]/30'
                                  : item.itemStatus === 'In Queue'
                                  ? 'bg-[#2563eb]/10 text-[#2563eb] border-[#2563eb]/30'
                                  : 'bg-[#dc2626]/10 text-[#dc2626] border-[#dc2626]/30'
                              }`}
                              variant="outline"
                            >
                              {item.itemStatus === 'Ready' ? (
                                <CheckCircle2 className="w-2.5 h-2.5" />
                              ) : item.itemStatus === 'In Queue' ? (
                                <Printer className="w-2.5 h-2.5" />
                              ) : (
                                <Clock className="w-2.5 h-2.5" />
                              )}
                              {item.itemStatus}
                            </Badge>
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex items-center justify-end gap-1">
                              {/* FIFO number indicator */}
                              {item.itemStatus === 'Not Ready' && notReadyFifoMap.get(item.id) && (
                                <span className="text-[11px] text-[#6b7280] mr-1">#{notReadyFifoMap.get(item.id)}</span>
                              )}

                              {item.itemStatus === 'Not Ready' && (
                                <button
                                  onClick={() => handleSendToQueue(item)}
                                  disabled={!!actionLoading}
                                  title="Send to Print Queue"
                                  className="w-7 h-7 rounded-lg flex items-center justify-center text-[#2563eb] hover:bg-[#2563eb]/10 transition-colors cursor-pointer disabled:opacity-50"
                                >
                                  <ArrowRight className="w-3.5 h-3.5" />
                                </button>
                              )}

                              {(item.itemStatus === 'Not Ready' || item.itemStatus === 'Ready') && (
                                <>
                                  <button
                                    onClick={() => {
                                      setEditingItem(item);
                                      setEditQty(item.orderedQty);
                                      setEditNote(item.note || '');
                                      setEditVariantId(item.variantId);
                                    }}
                                    title="Edit qty / ganti varian"
                                    className="w-7 h-7 rounded-lg flex items-center justify-center text-[#4b5563] hover:bg-[#f5f6fa] transition-colors cursor-pointer"
                                  >
                                    <Pencil className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={() => setDeleteItemTarget({ orderId: item.orderId, itemId: item.id, sku: item.sku, color: item.color })}
                                    title="Hapus item ini (customer cancel)"
                                    className="w-7 h-7 rounded-lg flex items-center justify-center text-[#dc2626] hover:bg-[#dc2626]/10 transition-colors cursor-pointer"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </>
                              )}

                              {item.itemStatus === 'In Queue' && (
                                <span className="text-[11px] text-[#2563eb] flex items-center gap-1">
                                  <Printer className="w-3 h-3" />
                                  In Queue
                                </span>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}

                      {/* Show More / Less Row */}
                      {hasMore && (
                        <tr>
                          <td colSpan={6} className="py-2">
                            <button
                              onClick={() => setExpanded(!expanded)}
                              className="w-full text-center text-xs text-[#4a6741] font-medium hover:text-[#3d5535] py-1 transition-colors cursor-pointer flex items-center justify-center gap-1"
                            >
                              {expanded ? (
                                <>
                                  Show Less <ChevronUp className="w-3 h-3" />
                                </>
                              ) : (
                                <>
                                  Show More ({filteredItems.length - 5} more) <ChevronDown className="w-3 h-3" />
                                </>
                              )}
                            </button>
                          </td>
                        </tr>
                      )}
                    </>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Picking List Detail Panel */}
      <Dialog open={!!detailOrderId} onOpenChange={(o) => !o && setDetailOrderId(null)}>
        <DialogContent className="sm:max-w-md rounded-xl max-h-[85vh] flex flex-col p-0">
          {(() => {
            const detailItems = activeItems.filter((i) => i.orderId === detailOrderId);
            const dReady = detailItems.filter((i) => i.itemStatus === 'Ready').length;
            const dNotReady = detailItems.filter((i) => i.itemStatus === 'Not Ready').length;
            const dInQueue = detailItems.filter((i) => i.itemStatus === 'In Queue').length;
            return (
              <>
                <DialogHeader className="px-5 pt-5 pb-0 flex-shrink-0">
                  <DialogTitle className="text-[#2d3436] flex items-center gap-2">
                    <ShoppingCart className="w-4 h-4 text-[#4a6741]" />
                    {detailItems[0]?.orderNo || 'Picking List'}
                  </DialogTitle>
                  <DialogDescription>
                    {detailItems[0] && formatDate(detailItems[0].createdAt)} · {detailItems.length} item
                  </DialogDescription>
                  <div className="flex items-center gap-2 pt-1">
                    {dReady > 0 && (
                      <Badge className="text-[11px] px-2 py-0 rounded-full bg-[#15803d]/10 text-[#15803d] border-[#15803d]/30 gap-1" variant="outline">
                        <CheckCircle2 className="w-2.5 h-2.5" />{dReady} Ready
                      </Badge>
                    )}
                    {dNotReady > 0 && (
                      <Badge className="text-[11px] px-2 py-0 rounded-full bg-[#dc2626]/10 text-[#dc2626] border-[#dc2626]/30 gap-1" variant="outline">
                        <Clock className="w-2.5 h-2.5" />{dNotReady} Not Ready
                      </Badge>
                    )}
                    {dInQueue > 0 && (
                      <Badge className="text-[11px] px-2 py-0 rounded-full bg-[#2563eb]/10 text-[#2563eb] border-[#2563eb]/30 gap-1" variant="outline">
                        <Printer className="w-2.5 h-2.5" />{dInQueue} In Queue
                      </Badge>
                    )}
                  </div>
                </DialogHeader>

                <div className="flex-1 overflow-y-auto px-5 py-4 space-y-2">
                  {detailItems.length === 0 && (
                    <p className="text-sm text-[#6b7280] text-center py-6">Semua item di Picking List ini sudah dihapus/selesai.</p>
                  )}
                  {detailItems.map((item) => (
                    <div
                      key={item.id}
                      className={`p-3 rounded-lg border ${
                        item.itemStatus === 'Ready' ? 'border-[#15803d]/20 bg-[#15803d]/[0.03]' : 'border-[#e8e8e8] bg-white'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-semibold text-[#2d3436] bg-[#f0f0f0] px-1.5 py-0.5 rounded">
                              {item.sku}
                            </span>
                            <Badge
                              className={`text-[10px] px-1.5 py-0 rounded-full font-semibold gap-1 ${
                                item.itemStatus === 'Ready'
                                  ? 'bg-[#15803d]/10 text-[#15803d] border-[#15803d]/30'
                                  : item.itemStatus === 'In Queue'
                                  ? 'bg-[#2563eb]/10 text-[#2563eb] border-[#2563eb]/30'
                                  : 'bg-[#dc2626]/10 text-[#dc2626] border-[#dc2626]/30'
                              }`}
                              variant="outline"
                            >
                              {item.itemStatus}
                            </Badge>
                          </div>
                          <p className="text-[11px] text-[#6b7280] mt-0.5 truncate">{item.name}</p>
                          <div className="flex items-center gap-1.5 mt-1">
                            <span className="w-3 h-3 rounded-full border border-gray-300 flex-shrink-0" style={{ backgroundColor: item.colorHex }} />
                            <span className="text-xs text-[#4b5563]">{item.color}{item.type ? ` - ${item.type}` : ''}</span>
                            <span className="text-xs text-[#2d3436] font-medium ml-1">× {item.orderedQty}</span>
                          </div>
                          {item.note && (
                            <p className="text-[11px] text-[#d97706] font-medium mt-1">{item.note}</p>
                          )}
                        </div>

                        <div className="flex items-center gap-1 flex-shrink-0">
                          {item.itemStatus === 'Not Ready' && (
                            <button
                              onClick={() => handleSendToQueue(item)}
                              disabled={!!actionLoading}
                              title="Send to Print Queue"
                              className="w-7 h-7 rounded-lg flex items-center justify-center text-[#2563eb] hover:bg-[#2563eb]/10 transition-colors cursor-pointer disabled:opacity-50"
                            >
                              <ArrowRight className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {(item.itemStatus === 'Not Ready' || item.itemStatus === 'Ready') && (
                            <>
                              <button
                                onClick={() => {
                                  setEditingItem(item);
                                  setEditQty(item.orderedQty);
                                  setEditNote(item.note || '');
                                  setEditVariantId(item.variantId);
                                }}
                                title="Edit qty / ganti varian"
                                className="w-7 h-7 rounded-lg flex items-center justify-center text-[#4b5563] hover:bg-[#f5f6fa] transition-colors cursor-pointer"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => setDeleteItemTarget({ orderId: item.orderId, itemId: item.id, sku: item.sku, color: item.color })}
                                title="Hapus item ini (customer cancel)"
                                className="w-7 h-7 rounded-lg flex items-center justify-center text-[#dc2626] hover:bg-[#dc2626]/10 transition-colors cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="px-5 py-4 border-t border-[#f0f0f0] flex-shrink-0">
                  <Button variant="outline" onClick={() => setDetailOrderId(null)} className="w-full rounded-lg border-[#e8e8e8] text-[#4b5563]">
                    Tutup
                  </Button>
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Edit Item Dialog */}
      <Dialog open={!!editingItem} onOpenChange={() => setEditingItem(null)}>
        <DialogContent className="sm:max-w-[400px] rounded-xl">
          <DialogHeader>
            <DialogTitle className="text-[#2d3436]">Edit Order Item</DialogTitle>
            <DialogDescription>
              <span className="font-semibold text-[#4a6741]">{editingItem?.sku}</span>
              {' | '}
              <span className="text-[#6b7280]">{editingItem?.orderNo}</span>
            </DialogDescription>
          </DialogHeader>
          {editingItem && (
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label className="text-sm font-medium text-[#2d3436]">Warna / Varian</Label>
                <select
                  value={editVariantId}
                  onChange={(e) => setEditVariantId(e.target.value)}
                  disabled={loadingVariants}
                  className="w-full h-10 text-sm rounded-lg bg-[#f5f6fa] border border-[#e8e8e8] px-3 text-[#2d3436] focus:outline-none focus:ring-1 focus:ring-[#4a6741]/30 cursor-pointer disabled:opacity-60"
                >
                  {loadingVariants && <option>Memuat pilihan warna...</option>}
                  {!loadingVariants && variantOptions.length === 0 && (
                    <option value={editingItem.variantId}>
                      {editingItem.color}{editingItem.type ? ` - ${editingItem.type}` : ''}
                    </option>
                  )}
                  {variantOptions.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.color}{v.type ? ` - ${v.type}` : ''} (stock: {v.qty})
                    </option>
                  ))}
                </select>
                {editVariantId !== editingItem.variantId && (
                  <p className="text-[11px] text-[#d97706] flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" /> Ganti varian akan mengembalikan stok warna lama & motong stok warna baru
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium text-[#2d3436]">Order Quantity</Label>
                <Input
                  type="number"
                  min={1}
                  value={editQty}
                  onChange={(e) => setEditQty(Number(e.target.value) || 1)}
                  className="rounded-lg"
                />
                <p className="text-[11px] text-[#6b7280]">
                  Current stock: {editingItem.currentStock} | Previously ordered: {editingItem.orderedQty}
                </p>
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium text-[#2d3436]">Color Note</Label>
                <Input
                  type="text"
                  value={editNote}
                  onChange={(e) => setEditNote(e.target.value)}
                  placeholder="e.g. Navy Blue, Custom Red..."
                  className="rounded-lg"
                />
                <p className="text-[11px] text-[#6b7280]">
                  Warna yang diminta customer (opsional)
                </p>
              </div>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setEditingItem(null)} className="rounded-lg border-[#e8e8e8] text-[#4b5563]">
              Cancel
            </Button>
            <Button
              onClick={async () => {
                if (!editingItem) {
                  setEditingItem(null);
                  return;
                }
                setActionLoading(editingItem.id);
                try {
                  const payload: { qty?: number; note?: string; variantId?: string } = {};
                  if (editQty !== editingItem.orderedQty) payload.qty = editQty;
                  if (editNote !== (editingItem.note || '')) payload.note = editNote;
                  if (editVariantId && editVariantId !== editingItem.variantId) payload.variantId = editVariantId;

                  if (Object.keys(payload).length === 0) {
                    setEditingItem(null);
                    return;
                  }

                  const res = await fetch(`/api/orders/${editingItem.orderId}/item/${editingItem.id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                  });
                  if (!res.ok) {
                    const data = await res.json().catch(() => ({}));
                    throw new Error(data.error || 'Failed');
                  }
                  toast.success('Order item updated.');
                  setEditingItem(null);
                  onDataChange?.();
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : 'Failed to update order item');
                } finally {
                  setActionLoading(null);
                }
              }}
              disabled={!!actionLoading}
              className="rounded-lg bg-[#4a6741] hover:bg-[#3d5535] text-white"
            >
              {actionLoading ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Item Confirmation */}
      <AlertDialog open={!!deleteItemTarget} onOpenChange={() => setDeleteItemTarget(null)}>
        <AlertDialogContent className="rounded-xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus Item Ini?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteItemTarget && (
                <>
                  <span className="font-semibold text-[#2d3436]">{deleteItemTarget.sku}</span>
                  {deleteItemTarget.color ? ` — ${deleteItemTarget.color}` : ''} akan dihapus dari Picking List ini dan stoknya dikembalikan ke inventory.
                  Item lain di Picking List yang sama tidak akan terpengaruh.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-lg">Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => handleDeleteItem()}
              className="rounded-lg bg-[#dc2626] hover:bg-[#b91c1c] text-white"
            >
              Hapus Item
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
