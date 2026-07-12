'use client';

import { useState, useEffect } from 'react';
import { CheckCircle2, Clock, Eye, Pencil, Trash2, XCircle, ChevronDown, ChevronUp, ShoppingCart, Printer, ArrowRight } from 'lucide-react';
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
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editingItem, setEditingItem] = useState<RecentOrderItem | null>(null);
  const [editQty, setEditQty] = useState<number>(1);
  const [editNote, setEditNote] = useState<string>('');
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

  const handleCancelOrder = async (orderId: string) => {
    setActionLoading(orderId);
    try {
      const res = await fetch(`/api/orders/${orderId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'Cancelled' }),
      });
      if (!res.ok) throw new Error('Failed');
      toast.success('Order cancelled. Stock restored.');
      onDataChange?.();
    } catch {
      toast.error('Failed to cancel order');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    setActionLoading(deleteId);
    try {
      const res = await fetch(`/api/orders/${deleteId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed');
      toast.success('Order deleted. Stock restored.');
      setDeleteId(null);
      onDataChange?.();
    } catch {
      toast.error('Failed to delete order');
    } finally {
      setActionLoading(null);
    }
  };

  // Stats
  const readyCount = activeItems.filter((i) => i.itemStatus === 'Ready').length;
  const notReadyCount = activeItems.filter((i) => i.itemStatus === 'Not Ready').length;
  const inQueueCount = activeItems.filter((i) => i.itemStatus === 'In Queue').length;

  return (
    <>
      <Card className="rounded-xl shadow-sm border-0">
        <CardHeader className="pb-3 px-4 pt-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-3">
              <CardTitle className="text-sm font-semibold text-[#2d3436]">Recent Order</CardTitle>
              <div className="flex items-center gap-2">
                <Badge className="text-[11px] px-2 py-0 rounded-full bg-[#15803d]/10 text-[#15803d] border-[#15803d]/30 gap-1" variant="outline">
                  <CheckCircle2 className="w-2.5 h-2.5" />
                  {readyCount} Ready
                </Badge>
                <Badge className="text-[11px] px-2 py-0 rounded-full bg-[#dc2626]/10 text-[#dc2626] border-[#dc2626]/30 gap-1" variant="outline">
                  <Clock className="w-2.5 h-2.5" />
                  {notReadyCount} Not Ready
                </Badge>
                <Badge className="text-[11px] px-2 py-0 rounded-full bg-[#2563eb]/10 text-[#2563eb] border-[#2563eb]/30 gap-1" variant="outline">
                  <Printer className="w-2.5 h-2.5" />
                  {inQueueCount} In Queue
                </Badge>
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
                            <p className="text-[11px] text-[#b2bec3] mt-0.5">{item.orderNo}</p>
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
                                <>
                                  <button
                                    onClick={() => handleSendToQueue(item)}
                                    disabled={!!actionLoading}
                                    title="Send to Print Queue"
                                    className="w-7 h-7 rounded-lg flex items-center justify-center text-[#2563eb] hover:bg-[#2563eb]/10 transition-colors cursor-pointer disabled:opacity-50"
                                  >
                                    <ArrowRight className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={() => {
                                      setEditingItem(item);
                                      setEditQty(item.orderedQty);
                                      setEditNote(item.note || '');
                                    }}
                                    title="Edit qty"
                                    className="w-7 h-7 rounded-lg flex items-center justify-center text-[#4b5563] hover:bg-[#f5f6fa] transition-colors cursor-pointer"
                                  >
                                    <Pencil className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={() => setDeleteId(item.orderId)}
                                    title="Cancel Order"
                                    className="w-7 h-7 rounded-lg flex items-center justify-center text-[#dc2626] hover:bg-[#dc2626]/10 transition-colors cursor-pointer"
                                  >
                                    <XCircle className="w-3.5 h-3.5" />
                                  </button>
                                </>
                              )}

                              {item.itemStatus === 'In Queue' && (
                                <span className="text-[11px] text-[#2563eb] flex items-center gap-1">
                                  <Printer className="w-3 h-3" />
                                  In Queue
                                </span>
                              )}

                              {item.itemStatus === 'Ready' && (
                                <CheckCircle2 className="w-4 h-4 text-[#15803d]" />
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

      {/* Edit Qty Dialog */}
      <Dialog open={!!editingItem} onOpenChange={() => setEditingItem(null)}>
        <DialogContent className="sm:max-w-[400px] rounded-xl">
          <DialogHeader>
            <DialogTitle className="text-[#2d3436]">Edit Order Item</DialogTitle>
            <DialogDescription>
              <span className="font-semibold text-[#4a6741]">{editingItem?.sku}</span>
              {' — '}
              {editingItem?.color}{editingItem?.type ? ` - ${editingItem.type}` : ''}
              {' | '}
              <span className="text-[#6b7280]">{editingItem?.orderNo}</span>
            </DialogDescription>
          </DialogHeader>
          {editingItem && (
            <div className="space-y-4 py-2">
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
                  const payload: { qty?: number; note?: string } = {};
                  if (editQty !== editingItem.orderedQty) payload.qty = editQty;
                  if (editNote !== (editingItem.note || '')) payload.note = editNote;
                  
                  if (Object.keys(payload).length === 0) {
                    setEditingItem(null);
                    return;
                  }

                  const res = await fetch(`/api/orders/${editingItem.orderId}/item/${editingItem.id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                  });
                  if (!res.ok) throw new Error('Failed');
                  toast.success('Order item updated.');
                  setEditingItem(null);
                  onDataChange?.();
                } catch {
                  toast.error('Failed to update order item');
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

      {/* Cancel Order Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent className="rounded-xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel Order</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to cancel this order? The stock will be restored to inventory.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-lg">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteId) handleCancelOrder(deleteId);
                setDeleteId(null);
              }}
              className="rounded-lg bg-[#dc2626] hover:bg-[#b91c1c] text-white"
            >
              Cancel Order
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
