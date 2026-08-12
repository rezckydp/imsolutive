'use client';

import { useState, useEffect } from 'react';
import { CheckCircle2, Clock, Eye, Pencil, Trash2, AlertCircle, ChevronDown, ChevronUp, ShoppingCart, Printer, ArrowRight, RefreshCw, Factory, Sparkles, Loader2 } from 'lucide-react';
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
  groupSku: string;         // Master SKU (rolled up from child SKU Variants, for Summary)
  groupName: string;
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
  const [sortBy, setSortBy] = useState<'oldest' | 'newest'>('oldest');
  const [viewMode, setViewMode] = useState<'summary' | 'picking' | 'adjustment'>('picking');
  const [expanded, setExpanded] = useState(false);
  const [readyExpanded, setReadyExpanded] = useState(false);
  const [bulkPrintingOrderId, setBulkPrintingOrderId] = useState<string | null>(null);
  const [bulkPrintingGroupKey, setBulkPrintingGroupKey] = useState<string | null>(null);
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

  // Picking List (PICK-xxx, or anything not explicitly ADJ) vs Adjustment (ADJ-xxx)
  const isAdjustment = (orderNo: string) => orderNo.trim().toUpperCase().startsWith('ADJ');
  const viewItems = activeItems.filter((i) =>
    viewMode === 'adjustment' ? isAdjustment(i.orderNo) : !isAdjustment(i.orderNo)
  );
  const pickingCount = activeItems.filter((i) => !isAdjustment(i.orderNo)).length;
  const adjustmentCount = activeItems.filter((i) => isAdjustment(i.orderNo)).length;

  const sortedItems = [...viewItems].sort((a, b) => {
    if (sortBy === 'newest') {
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    }
    // 'oldest' (default) — FIFO: longest-waiting Picking List first
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });

  // FIFO order index (chronological) for Not Ready items — oldest = #1 (Picking List view only)
  const notReadyFifoMap = new Map<string, number>();
  [...viewItems]
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
    const matchStatus = viewMode === 'adjustment' || statusFilter === 'all' || item.itemStatus === statusFilter;
    return matchSearch && matchStatus;
  });

  const displayItems = expanded ? filteredItems : filteredItems.slice(0, 5);
  const hasMore = filteredItems.length > 5;

  // Shared search matcher — also checks groupSku/groupName (Master SKU) for Kanban + Summary
  const searchMatch = (it: RecentOrderItem) =>
    search === '' ||
    it.sku.toLowerCase().includes(search.toLowerCase()) ||
    it.groupSku.toLowerCase().includes(search.toLowerCase()) ||
    it.name.toLowerCase().includes(search.toLowerCase()) ||
    it.groupName.toLowerCase().includes(search.toLowerCase()) ||
    it.color.toLowerCase().includes(search.toLowerCase()) ||
    it.orderNo.toLowerCase().includes(search.toLowerCase());

  const pickingListItems = activeItems.filter((i) => !isAdjustment(i.orderNo));

  // ============ KANBAN BOARD (Picking List tab) ============
  const LANES = ['Not Ready', 'In Queue', 'In Production', 'Ready'] as const;
  type Lane = (typeof LANES)[number];

  const getCardLane = (its: RecentOrderItem[]): Lane => {
    for (const s of LANES) {
      if (its.some((i) => i.itemStatus === s)) return s;
    }
    return 'Ready';
  };

  const cardMap = new Map<string, { orderId: string; orderNo: string; createdAt: string; items: RecentOrderItem[] }>();
  for (const it of pickingListItems) {
    if (!cardMap.has(it.orderId)) {
      cardMap.set(it.orderId, { orderId: it.orderId, orderNo: it.orderNo, createdAt: it.createdAt, items: [] });
    }
    cardMap.get(it.orderId)!.items.push(it);
  }

  const kanbanCards = Array.from(cardMap.values())
    .filter((c) => c.items.some(searchMatch))
    .map((c) => ({ ...c, lane: getCardLane(c.items) }))
    .sort((a, b) =>
      sortBy === 'newest'
        ? new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        : new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );

  // FIFO rank for cards sitting in the Not Ready lane
  const cardFifoMap = new Map<string, number>();
  kanbanCards
    .filter((c) => c.lane === 'Not Ready')
    .slice()
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    .forEach((c, idx) => cardFifoMap.set(c.orderId, idx + 1));

  const visibleLanes: Lane[] = statusFilter === 'all' ? [...LANES] : [statusFilter as Lane];

  // ============ SUMMARY (Master SKU roll-up, Not Ready only) ============
  interface SummaryGroup {
    key: string;
    groupSku: string;
    groupName: string;
    color: string;
    colorHex: string;
    type: string;
    totalQty: number;
    orderNos: Set<string>;
    items: RecentOrderItem[];
    oldestCreatedAt: string;
  }
  const summaryMap = new Map<string, SummaryGroup>();
  for (const it of pickingListItems) {
    if (it.itemStatus !== 'Not Ready' || !searchMatch(it)) continue;
    const key = `${it.groupSku}|${it.color}|${it.type}`;
    if (!summaryMap.has(key)) {
      summaryMap.set(key, {
        key,
        groupSku: it.groupSku,
        groupName: it.groupName,
        color: it.color,
        colorHex: it.colorHex,
        type: it.type,
        totalQty: 0,
        orderNos: new Set(),
        items: [],
        oldestCreatedAt: it.createdAt,
      });
    }
    const g = summaryMap.get(key)!;
    g.totalQty += it.orderedQty;
    g.orderNos.add(it.orderNo);
    g.items.push(it);
    if (new Date(it.createdAt).getTime() < new Date(g.oldestCreatedAt).getTime()) {
      g.oldestCreatedAt = it.createdAt;
    }
  }
  // Urgency-first: whichever group has been waiting longest (oldest contributing
  // order) goes on top — matches the FIFO philosophy used everywhere else.
  const summaryGroups = Array.from(summaryMap.values()).sort(
    (a, b) => new Date(a.oldestCreatedAt).getTime() - new Date(b.oldestCreatedAt).getTime()
  );
  const daysWaiting = (iso: string) => {
    const ms = Date.now() - new Date(iso).getTime();
    return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
  };

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

  const sendItemsToQueue = async (itemsToSend: RecentOrderItem[]) => {
    for (const it of itemsToSend) {
      const res = await fetch(`/api/orders/${it.orderId}/item/${it.id}`, { method: 'PATCH' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Gagal kirim ${it.sku}`);
      }
    }
  };

  const handleBulkPrintOrder = async (orderId: string, notReadyItems: RecentOrderItem[]) => {
    if (notReadyItems.length === 0) return;
    setBulkPrintingOrderId(orderId);
    try {
      await sendItemsToQueue(notReadyItems);
      toast.success(`${notReadyItems.length} item dikirim ke Print Queue`);
      onDataChange?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Sebagian item gagal dikirim');
    } finally {
      setBulkPrintingOrderId(null);
    }
  };

  const handleBulkPrintGroup = async (groupKey: string, groupItems: RecentOrderItem[]) => {
    if (groupItems.length === 0) return;
    setBulkPrintingGroupKey(groupKey);
    try {
      await sendItemsToQueue(groupItems);
      toast.success(`${groupItems.length} item dikirim ke Print Queue`);
      onDataChange?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Sebagian item gagal dikirim');
    } finally {
      setBulkPrintingGroupKey(null);
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
  const notReadyCount = viewItems.filter((i) => i.itemStatus === 'Not Ready').length;

  return (
    <>
      <Card className="rounded-xl shadow-sm border-0">
        <CardHeader className="pb-3 px-4 pt-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-3 flex-wrap">
              <CardTitle className="text-sm font-semibold text-[#2d3436]">Recent Order</CardTitle>
              <div className="flex items-center gap-1 bg-[#f5f6fa] p-0.5 rounded-full">
                <button
                  onClick={() => setViewMode('summary')}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-colors cursor-pointer ${
                    viewMode === 'summary' ? 'bg-white text-[#2d3436] shadow-sm' : 'text-[#6b7280] hover:text-[#2d3436]'
                  }`}
                >
                  <Sparkles className="w-3 h-3" />
                  Summary
                  {summaryGroups.length > 0 && (
                    <span className={`text-[10px] px-1.5 py-0 rounded-full ${viewMode === 'summary' ? 'bg-[#4a6741]/10 text-[#4a6741]' : 'bg-[#e8e8e8] text-[#6b7280]'}`}>
                      {summaryGroups.length}
                    </span>
                  )}
                </button>
                <button
                  onClick={() => setViewMode('picking')}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-colors cursor-pointer ${
                    viewMode === 'picking' ? 'bg-white text-[#2d3436] shadow-sm' : 'text-[#6b7280] hover:text-[#2d3436]'
                  }`}
                >
                  <ShoppingCart className="w-3 h-3" />
                  Picking List
                  <span className={`text-[10px] px-1.5 py-0 rounded-full ${viewMode === 'picking' ? 'bg-[#4a6741]/10 text-[#4a6741]' : 'bg-[#e8e8e8] text-[#6b7280]'}`}>
                    {pickingCount}
                  </span>
                </button>
                <button
                  onClick={() => setViewMode('adjustment')}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-colors cursor-pointer ${
                    viewMode === 'adjustment' ? 'bg-white text-[#2d3436] shadow-sm' : 'text-[#6b7280] hover:text-[#2d3436]'
                  }`}
                >
                  <AlertCircle className="w-3 h-3" />
                  Adjustment
                  <span className={`text-[10px] px-1.5 py-0 rounded-full ${viewMode === 'adjustment' ? 'bg-[#d97706]/10 text-[#d97706]' : 'bg-[#e8e8e8] text-[#6b7280]'}`}>
                    {adjustmentCount}
                  </span>
                </button>
              </div>
              <div className="flex items-center gap-2">
                {viewMode !== 'adjustment' && (
                  <Badge className="text-[11px] px-2 py-0 rounded-full bg-[#dc2626]/10 text-[#dc2626] border-[#dc2626]/30 gap-1" variant="outline">
                    <Clock className="w-2.5 h-2.5" />
                    {notReadyCount} Belum Ready
                  </Badge>
                )}
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
              {viewMode === 'picking' && (
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="h-8 text-xs rounded-lg bg-white border-[#e8e8e8] px-2 text-[#4b5563] focus:outline-none focus:ring-1 focus:ring-[#4a6741]/30 cursor-pointer"
                >
                  <option value="all">All Status</option>
                  <option value="Not Ready">Not Ready</option>
                  <option value="In Queue">In Queue</option>
                  <option value="In Production">In Production</option>
                  <option value="Ready">Ready</option>
                </select>
              )}
              {viewMode !== 'summary' && (
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                  className="h-8 text-xs rounded-lg bg-white border-[#e8e8e8] px-2 text-[#4b5563] focus:outline-none focus:ring-1 focus:ring-[#4a6741]/30 cursor-pointer"
                >
                  <option value="oldest">Sort: Terlama</option>
                  <option value="newest">Sort: Terbaru</option>
                </select>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="px-4 pb-4 pt-0">
          {/* ============ SUMMARY TAB ============ */}
          {viewMode === 'summary' && (
            <div className="rounded-xl border border-[#e8e8e8] overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-[#f5f6fa]">
                      <th className="text-left text-xs font-medium text-[#4b5563] py-3 px-4">Urgency</th>
                      <th className="text-left text-xs font-medium text-[#4b5563] py-3 px-4">Master SKU</th>
                      <th className="text-left text-xs font-medium text-[#4b5563] py-3 px-4">Warna</th>
                      <th className="text-right text-xs font-medium text-[#4b5563] py-3 px-4">Butuh Print</th>
                      <th className="text-right text-xs font-medium text-[#4b5563] py-3 px-4">Dari</th>
                      <th className="text-right text-xs font-medium text-[#4b5563] py-3 px-4">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <>
                        <TableSkeleton />
                        <TableSkeleton />
                        <TableSkeleton />
                      </>
                    ) : summaryGroups.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="text-center py-10">
                          <div className="flex flex-col items-center gap-3">
                            <div className="w-12 h-12 rounded-full bg-[#f5f6fa] flex items-center justify-center">
                              <Sparkles className="w-6 h-6 text-[#6b7280]" />
                            </div>
                            <p className="text-sm text-[#4b5563]">Nggak ada yang perlu diprint</p>
                            <p className="text-xs text-[#6b7280]">Semua Picking List udah Ready / lagi diproses</p>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      summaryGroups.map((g, idx) => {
                        const days = daysWaiting(g.oldestCreatedAt);
                        const urgencyColor = days >= 5 ? '#dc2626' : days >= 2 ? '#d97706' : '#6b7280';
                        return (
                        <tr key={g.key} className="border-t border-[#f0f0f0] hover:bg-[#fafafa] transition-colors">
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2">
                              <span
                                className="text-[11px] font-bold w-5 h-5 rounded-full flex items-center justify-center text-white flex-shrink-0"
                                style={{ backgroundColor: urgencyColor }}
                              >
                                {idx + 1}
                              </span>
                              <span className="text-xs font-medium" style={{ color: urgencyColor }}>
                                {days === 0 ? 'Hari ini' : `${days} hari`}
                              </span>
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <span className="text-sm font-semibold text-[#4a6741] bg-[#f0f0f0] px-1.5 py-0.5 rounded">
                              {g.groupSku}
                            </span>
                            <p className="text-[11px] text-[#6b7280] mt-0.5 truncate max-w-[160px]">{g.groupName}</p>
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2">
                              <span className="w-3 h-3 rounded-full flex-shrink-0 border border-gray-300" style={{ backgroundColor: g.colorHex }} />
                              <span className="text-sm text-[#4b5563]">{g.color}{g.type ? ` - ${g.type}` : ''}</span>
                            </div>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <span className="text-base font-bold text-[#dc2626]">{g.totalQty}</span>
                            <span className="text-xs text-[#6b7280]"> pcs</span>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <span className="text-xs text-[#6b7280]">{g.orderNos.size} Picking List</span>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <button
                              onClick={() => handleBulkPrintGroup(g.key, g.items)}
                              disabled={bulkPrintingGroupKey === g.key}
                              title={`Kirim ${g.totalQty} pcs ke Print Queue`}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#4a6741] hover:bg-[#3d5535] text-white text-xs font-medium transition-colors cursor-pointer disabled:opacity-50"
                            >
                              {bulkPrintingGroupKey === g.key ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Printer className="w-3.5 h-3.5" />
                              )}
                              Print
                            </button>
                          </td>
                        </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ============ PICKING LIST TAB — KANBAN BOARD ============ */}
          {viewMode === 'picking' && (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
              {loading ? (
                [1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-40 w-full rounded-xl" />)
              ) : (
                visibleLanes.map((lane) => {
                  const laneMeta: Record<Lane, { color: string; bg: string; icon: typeof Clock }> = {
                    'Not Ready': { color: '#dc2626', bg: '#fef2f2', icon: Clock },
                    'In Queue': { color: '#2563eb', bg: '#eff6ff', icon: Printer },
                    'In Production': { color: '#7c3aed', bg: '#f5f3ff', icon: Factory },
                    'Ready': { color: '#15803d', bg: '#f0fdf4', icon: CheckCircle2 },
                  };
                  const meta = laneMeta[lane];
                  const LaneIcon = meta.icon;
                  let laneCards = kanbanCards.filter((c) => c.lane === lane);
                  const isReadyLane = lane === 'Ready';
                  const totalInLane = laneCards.length;
                  if (isReadyLane) {
                    laneCards = readyExpanded ? laneCards.slice(0, 3) : [];
                  }

                  return (
                    <div key={lane} className="flex flex-col">
                      <button
                        onClick={() => isReadyLane && setReadyExpanded(!readyExpanded)}
                        className={`flex items-center justify-between px-3 py-2 rounded-t-xl border-b-2 ${isReadyLane ? 'cursor-pointer' : ''}`}
                        style={{ backgroundColor: meta.bg, borderColor: meta.color }}
                      >
                        <span className="text-xs font-semibold flex items-center gap-1.5" style={{ color: meta.color }}>
                          <LaneIcon className="w-3.5 h-3.5" />
                          {lane}
                          {isReadyLane && (readyExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                        </span>
                        <span className="text-[11px] font-bold px-1.5 py-0.5 rounded-full text-white" style={{ backgroundColor: meta.color }}>
                          {totalInLane}
                        </span>
                      </button>
                      <div className="bg-[#eef0f4] rounded-b-xl p-2 space-y-2 flex-1 min-h-[100px]">
                        {isReadyLane && !readyExpanded && totalInLane > 0 && (
                          <p className="text-[11px] text-[#6b7280] text-center py-4">
                            {totalInLane} Picking List Ready — klik header buat lihat
                          </p>
                        )}
                        {(!isReadyLane || readyExpanded) && laneCards.length === 0 && (
                          <p className="text-[11px] text-[#9ca3af] text-center py-6">Kosong</p>
                        )}
                        {laneCards.map((card) => {
                          const notReadyItems = card.items.filter((i) => i.itemStatus === 'Not Ready');
                          const readyCount = card.items.filter((i) => i.itemStatus === 'Ready').length;
                          return (
                            <div
                              key={card.orderId}
                              className="bg-white rounded-lg shadow-sm p-3 border-l-[3px] hover:shadow-md transition-shadow"
                              style={{ borderLeftColor: meta.color }}
                            >
                              <div className="flex items-center justify-between mb-1.5">
                                <button
                                  onClick={() => setDetailOrderId(card.orderId)}
                                  className="text-xs font-bold text-[#2d3436] flex items-center gap-1 hover:underline cursor-pointer"
                                >
                                  <Eye className="w-3 h-3 text-[#4a6741]" />
                                  {card.orderNo}
                                </button>
                                {lane === 'Not Ready' && cardFifoMap.get(card.orderId) && (
                                  <span className="text-[10px] font-bold text-[#dc2626] bg-[#dc2626]/10 px-1.5 rounded-full">
                                    #{cardFifoMap.get(card.orderId)}
                                  </span>
                                )}
                              </div>
                              <p className="text-[10px] text-[#9ca3af] mb-2">{formatDate(card.createdAt)}</p>

                              <div className="space-y-1 mb-2">
                                {card.items.map((item) => {
                                  const itemMeta: Record<string, { color: string; icon: typeof Clock }> = {
                                    'Not Ready': { color: '#dc2626', icon: Clock },
                                    'In Queue': { color: '#2563eb', icon: Printer },
                                    'In Production': { color: '#7c3aed', icon: Factory },
                                    'Ready': { color: '#15803d', icon: CheckCircle2 },
                                  };
                                  const im = itemMeta[item.itemStatus] || itemMeta['Not Ready'];
                                  const ItemIcon = im.icon;
                                  const canEdit = item.itemStatus === 'Not Ready' || item.itemStatus === 'Ready';
                                  return (
                                    <div key={item.id} className="flex items-center gap-1.5 text-[11px] group">
                                      <ItemIcon className="w-3 h-3 flex-shrink-0" style={{ color: im.color }} />
                                      <span className="text-[#4b5563] truncate flex-1">
                                        {item.sku} <span className="text-[#9ca3af]">· {item.color}{item.type ? ` - ${item.type}` : ''}</span>
                                      </span>
                                      <span className="text-[#2d3436] font-medium flex-shrink-0">×{item.orderedQty}</span>
                                      {canEdit && (
                                        <span className="flex items-center gap-0.5 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                                          <button
                                            onClick={() => {
                                              setEditingItem(item);
                                              setEditQty(item.orderedQty);
                                              setEditNote(item.note || '');
                                              setEditVariantId(item.variantId);
                                            }}
                                            title="Edit qty / ganti varian"
                                            className="w-4 h-4 flex items-center justify-center text-[#4b5563] hover:text-[#2d3436] cursor-pointer"
                                          >
                                            <Pencil className="w-3 h-3" />
                                          </button>
                                          <button
                                            onClick={() => setDeleteItemTarget({ orderId: item.orderId, itemId: item.id, sku: item.sku, color: item.color })}
                                            title="Hapus item ini (customer cancel)"
                                            className="w-4 h-4 flex items-center justify-center text-[#dc2626] hover:text-[#b91c1c] cursor-pointer"
                                          >
                                            <Trash2 className="w-3 h-3" />
                                          </button>
                                        </span>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>

                              <div className="flex items-center gap-2">
                                <div className="flex-1 h-1 bg-[#f0f0f0] rounded-full overflow-hidden">
                                  <div
                                    className="h-full bg-[#15803d] rounded-full transition-all"
                                    style={{ width: `${(readyCount / card.items.length) * 100}%` }}
                                  />
                                </div>
                                <span className="text-[10px] text-[#6b7280] flex-shrink-0">
                                  {readyCount}/{card.items.length}
                                </span>
                                {notReadyItems.length > 0 && (
                                  <button
                                    onClick={() => handleBulkPrintOrder(card.orderId, notReadyItems)}
                                    disabled={bulkPrintingOrderId === card.orderId}
                                    title={`Kirim ${notReadyItems.length} item Not Ready ke Print Queue`}
                                    className="w-6 h-6 rounded-md flex items-center justify-center bg-[#2563eb]/10 hover:bg-[#2563eb]/20 text-[#2563eb] transition-colors cursor-pointer disabled:opacity-50 flex-shrink-0"
                                  >
                                    {bulkPrintingOrderId === card.orderId ? (
                                      <Loader2 className="w-3 h-3 animate-spin" />
                                    ) : (
                                      <Printer className="w-3 h-3" />
                                    )}
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })
              )}
              {!loading && kanbanCards.length === 0 && (
                <div className="col-span-full flex flex-col items-center gap-3 py-10">
                  <div className="w-12 h-12 rounded-full bg-[#f5f6fa] flex items-center justify-center">
                    <ShoppingCart className="w-6 h-6 text-[#6b7280]" />
                  </div>
                  <p className="text-sm text-[#4b5563]">No recent orders yet</p>
                  <p className="text-xs text-[#6b7280]">Orders will appear here after scanning</p>
                </div>
              )}
            </div>
          )}

          {/* ============ ADJUSTMENT TAB — TABLE ============ */}
          {viewMode === 'adjustment' && (
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
                                  : item.itemStatus === 'In Production'
                                  ? 'bg-[#7c3aed]/10 text-[#7c3aed] border-[#7c3aed]/30'
                                  : 'bg-[#dc2626]/10 text-[#dc2626] border-[#dc2626]/30'
                              }`}
                              variant="outline"
                            >
                              {item.itemStatus === 'Ready' ? (
                                <CheckCircle2 className="w-2.5 h-2.5" />
                              ) : item.itemStatus === 'In Queue' ? (
                                <Printer className="w-2.5 h-2.5" />
                              ) : item.itemStatus === 'In Production' ? (
                                <Factory className="w-2.5 h-2.5" />
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

                              {item.itemStatus === 'In Production' && (
                                <span className="text-[11px] text-[#7c3aed] flex items-center gap-1">
                                  <Factory className="w-3 h-3" />
                                  In Production
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
          )}
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
            const dInProduction = detailItems.filter((i) => i.itemStatus === 'In Production').length;
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
                    {dInProduction > 0 && (
                      <Badge className="text-[11px] px-2 py-0 rounded-full bg-[#7c3aed]/10 text-[#7c3aed] border-[#7c3aed]/30 gap-1" variant="outline">
                        <Factory className="w-2.5 h-2.5" />{dInProduction} In Production
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
                                  : item.itemStatus === 'In Production'
                                  ? 'bg-[#7c3aed]/10 text-[#7c3aed] border-[#7c3aed]/30'
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
