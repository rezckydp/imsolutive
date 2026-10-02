'use client';

import { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight, Printer, Loader2, AlertTriangle, PackageX, Sparkles } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';

export interface LowStockItem {
  sku: string;
  name: string;
  variantId: string;
  color: string;
  colorHex: string;
  type: string;
  qty: number;
  minStock: number;
  note: string;
}

export interface RecommendationItem {
  sku: string;
  name: string;
  variantId: string;
  color: string;
  colorHex: string;
  type: string;
  currentQty: number;
  avgDailyDemand: number;
  suggestedQty: number;
}

interface VariantQtyRef {
  variantId: string;
  qty: number;
}

interface LowStockCardProps {
  minusItems?: LowStockItem[];
  lowItems?: LowStockItem[];
  recommendationItems?: RecommendationItem[];
  recommendationLoading?: boolean;
  loading?: boolean;
  onSendToPrintQueue?: (variantId: string, qty?: number) => void;
  printQueueItems?: VariantQtyRef[];
  productionItems?: VariantQtyRef[];
}

function SkeletonRows() {
  return (
    <>
      {[...Array(4)].map((_, i) => (
        <tr key={i} className="border-t border-[var(--surface-2)]">
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
          <td className="py-2.5 px-3 text-right">
            <Skeleton className="h-4 w-6 ml-auto" />
          </td>
          <td className="py-2.5 px-1">
            <Skeleton className="h-6 w-6 rounded-md ml-auto" />
          </td>
        </tr>
      ))}
    </>
  );
}

export function LowStockCard({ minusItems = [], lowItems = [], recommendationItems = [], recommendationLoading = false, loading = false, onSendToPrintQueue, printQueueItems = [], productionItems = [] }: LowStockCardProps) {
  const [tab, setTab] = useState<'minus' | 'low' | 'reco'>('minus');
  const [page, setPage] = useState(0);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const itemsPerPage = 4;

  const items = tab === 'minus' ? minusItems : tab === 'low' ? lowItems : recommendationItems;
  const totalPages = Math.ceil(items.length / itemsPerPage);
  const displayItems = items.slice(page * itemsPerPage, (page + 1) * itemsPerPage) as (LowStockItem | RecommendationItem)[];

  // Reset page when switching tabs
  const handleTabChange = (newTab: 'minus' | 'low' | 'reco') => {
    if (newTab !== tab) {
      setTab(newTab);
      setPage(0);
    }
  };

  // Build a map: variantId -> total queued qty (Print Queue + In Production, not yet completed)
  const queuedMap = useMemo(() => {
    const map: Record<string, number> = {};
    for (const pq of printQueueItems) {
      map[pq.variantId] = (map[pq.variantId] || 0) + pq.qty;
    }
    for (const pi of productionItems) {
      map[pi.variantId] = (map[pi.variantId] || 0) + pi.qty;
    }
    return map;
  }, [printQueueItems, productionItems]);

  const handleSendToPrint = async (variantId: string, qty?: number) => {
    setSendingId(variantId);
    try {
      await onSendToPrintQueue?.(variantId, qty);
    } finally {
      setSendingId(null);
    }
  };

  const isMinus = tab === 'minus';
  const isReco = tab === 'reco';

  return (
    <Card className="rounded-xl shadow-sm border-0">
      <CardHeader className="pb-3 px-4 pt-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <CardTitle className="text-sm font-semibold text-[var(--t-heading)]">
            {isReco ? (
              <span className="flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-[var(--brand)]" />
                Recommendation
              </span>
            ) : isMinus ? (
              <span className="flex items-center gap-1.5">
                <PackageX className="w-4 h-4 text-[var(--danger-dark)]" />
                Stok Minus
              </span>
            ) : (
              <span className="flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-[var(--warning)]" />
                Low Stock
              </span>
            )}
          </CardTitle>
          <div className="flex items-center gap-2">
            {/* Toggle Button */}
            <div className="flex items-center bg-[var(--surface)] rounded-lg p-0.5">
              <button
                onClick={() => handleTabChange('reco')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                  isReco
                    ? 'bg-[var(--card)] text-[var(--brand)] shadow-sm'
                    : 'text-[var(--t-body)] hover:text-[var(--t-heading)]'
                }`}
              >
                <Sparkles className="w-3 h-3" />
                Recommendation
                {recommendationItems.length > 0 && (
                  <span className={`ml-0.5 text-[11px] px-1.5 py-0 rounded-full font-bold ${
                    isReco ? 'bg-[var(--brand)] text-white' : 'bg-[var(--brand)]/10 text-[var(--brand)]'
                  }`}>
                    {recommendationItems.length}
                  </span>
                )}
              </button>
              <button
                onClick={() => handleTabChange('minus')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                  isMinus
                    ? 'bg-[var(--card)] text-[var(--danger-dark)] shadow-sm'
                    : 'text-[var(--t-body)] hover:text-[var(--t-heading)]'
                }`}
              >
                <PackageX className="w-3 h-3" />
                Minus
                {minusItems.length > 0 && (
                  <span className={`ml-0.5 text-[11px] px-1.5 py-0 rounded-full font-bold ${
                    isMinus ? 'bg-[var(--danger-dark)] text-white' : 'bg-[var(--danger-dark)]/10 text-[var(--danger-dark)]'
                  }`}>
                    {minusItems.length}
                  </span>
                )}
              </button>
              <button
                onClick={() => handleTabChange('low')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                  tab === 'low'
                    ? 'bg-[var(--card)] text-[var(--warning)] shadow-sm'
                    : 'text-[var(--t-body)] hover:text-[var(--t-heading)]'
                }`}
              >
                <AlertTriangle className="w-3 h-3" />
                Low Stock
                {lowItems.length > 0 && (
                  <span className={`ml-0.5 text-[11px] px-1.5 py-0 rounded-full font-bold ${
                    tab === 'low' ? 'bg-[var(--warning)] text-white' : 'bg-[var(--warning)]/10 text-[var(--warning)]'
                  }`}>
                    {lowItems.length}
                  </span>
                )}
              </button>
            </div>

            {/* Pagination */}
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage(Math.max(0, page - 1))}
                disabled={page === 0}
                className="p-1 rounded hover:bg-[var(--surface)] disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="w-4 h-4 text-[var(--t-body)]" />
              </button>
              <span className="text-xs text-[var(--t-body)] mx-1">
                {totalPages > 0 ? `${page + 1}/${totalPages}` : '0/0'}
              </span>
              <button
                onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
                disabled={page >= totalPages - 1}
                className="p-1 rounded hover:bg-[var(--surface)] disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight className="w-4 h-4 text-[var(--t-body)]" />
              </button>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-4 pt-0">
        <div className="rounded-lg border border-[var(--bd)] overflow-x-auto -webkit-overflow-scrolling-touch">
          <table className="w-full min-w-[440px]">
            <thead>
              <tr className="bg-[var(--surface)]">
                <th className="text-left text-xs font-medium text-[var(--t-body)] py-2 px-3">SKU</th>
                <th className="text-left text-xs font-medium text-[var(--t-body)] py-2 px-3">Variant</th>
                {isReco ? (
                  <>
                    <th className="text-right text-xs font-medium text-[var(--t-body)] py-2 px-3">Stok</th>
                    <th className="text-right text-xs font-medium text-[var(--t-body)] py-2 px-3">Avg/hari</th>
                    <th className="text-right text-xs font-medium text-[var(--t-body)] py-2 px-3">Saran</th>
                  </>
                ) : (
                  <>
                    <th className="text-right text-xs font-medium text-[var(--t-body)] py-2 px-3">
                      {isMinus ? 'Qty' : 'Stok'}
                    </th>
                    <th className="text-right text-xs font-medium text-[var(--t-body)] py-2 px-3">Queued</th>
                  </>
                )}
                <th className="w-9"></th>
              </tr>
            </thead>
            <tbody>
              {(loading || (isReco && recommendationLoading)) ? (
                <SkeletonRows />
              ) : displayItems.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-8">
                    <div className="flex flex-col items-center gap-2">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                        isReco ? 'bg-[var(--brand)]/10' : isMinus ? 'bg-[var(--danger-dark)]/10' : 'bg-[var(--warning)]/10'
                      }`}>
                        {isReco ? (
                          <Sparkles className="w-5 h-5 text-[var(--brand)]" />
                        ) : isMinus ? (
                          <PackageX className="w-5 h-5 text-[var(--danger-dark)]" />
                        ) : (
                          <AlertTriangle className="w-5 h-5 text-[var(--warning)]" />
                        )}
                      </div>
                      <p className="text-xs text-[var(--t-body)]">
                        {isReco ? 'Belum ada saran reorder' : isMinus ? 'Tidak ada stok minus' : 'Tidak ada low stock'}
                      </p>
                      {isReco ? (
                        <p className="text-[11px] text-[var(--t-muted)]">Muncul kalau ada produk dengan demand rutin & stok mepet</p>
                      ) : isMinus ? (
                        <p className="text-[11px] text-[var(--t-muted)]">Produk dengan stok minus akan muncul di sini</p>
                      ) : (
                        <p className="text-[11px] text-[var(--t-muted)]">Produk dengan stok di bawah minimum akan muncul di sini</p>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                displayItems.map((item, idx) => {
                  const queued = queuedMap[item.variantId] || 0;
                  const reco = item as RecommendationItem;
                  const stock = item as LowStockItem;
                  return (
                    <tr
                      key={item.variantId || item.sku + idx}
                      className={`border-t border-[var(--surface-2)] hover:bg-[var(--surface-hover)] transition-colors ${
                        isMinus ? 'bg-[var(--danger-dark)]/[0.03]' : isReco ? 'bg-[var(--brand)]/[0.02]' : ''
                      }`}
                    >
                      <td className="py-2.5 px-3">
                        <span className="text-sm font-semibold text-[var(--t-heading)] bg-[var(--surface-2)] px-1.5 py-0.5 rounded">
                          {item.sku}
                        </span>
                        <p className="text-[11px] text-[var(--t-muted)] mt-0.5 truncate max-w-[80px]">{item.name}</p>
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-2">
                          <span
                            className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                            style={{ backgroundColor: item.colorHex }}
                          />
                          <div className="min-w-0">
                            <span className="text-sm text-[var(--t-body)]">{item.color}{item.type ? ` - ${item.type}` : ''}</span>
                            {!isReco && stock.note && (
                              <p className="text-[11px] text-[var(--warning)] font-medium truncate max-w-[100px]" title={stock.note}>
                                {stock.note}
                              </p>
                            )}
                          </div>
                        </div>
                      </td>
                      {isReco ? (
                        <>
                          <td className="py-2.5 px-3 text-right">
                            <span className={`text-sm font-semibold ${reco.currentQty < 0 ? 'text-[var(--danger-dark)]' : 'text-[var(--t-heading)]'}`}>
                              {reco.currentQty}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            <span className="text-sm text-[var(--t-body)]">{reco.avgDailyDemand}</span>
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            <span className="text-sm font-bold text-[var(--brand)]">+{reco.suggestedQty}</span>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="py-2.5 px-3 text-right">
                            {isMinus ? (
                              <span className="text-sm font-bold text-[var(--danger-dark)]">{stock.qty}</span>
                            ) : (
                              <div className="text-right">
                                <span className="text-sm font-semibold text-[var(--warning)]">{stock.qty}</span>
                                <p className="text-[11px] text-[var(--t-muted)]">min: {stock.minStock}</p>
                              </div>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            {queued > 0 ? (
                              <span className="text-sm font-semibold text-[var(--info)]">{queued}</span>
                            ) : (
                              <span className="text-sm text-[var(--t-muted)]">0</span>
                            )}
                          </td>
                        </>
                      )}
                      <td className="py-2.5 px-1">
                        <button
                          onClick={() => handleSendToPrint(item.variantId, isReco ? reco.suggestedQty : undefined)}
                          disabled={sendingId === item.variantId}
                          className={`p-1.5 rounded-md transition-colors cursor-pointer disabled:opacity-50 ${
                            isReco
                              ? 'bg-[var(--brand)]/10 hover:bg-[var(--brand)]/20 text-[var(--brand)]'
                              : isMinus
                              ? 'bg-[var(--danger-dark)]/10 hover:bg-[var(--danger-dark)]/20 text-[var(--danger-dark)]'
                              : 'bg-[var(--info)]/10 hover:bg-[var(--info)]/20 text-[var(--info)]'
                          }`}
                          title={isReco ? `Send ${reco.suggestedQty} to Print Queue` : 'Send to Print Queue'}
                        >
                          {sendingId === item.variantId ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Printer className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
