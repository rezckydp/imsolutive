'use client';

import { useState } from 'react';
import { ChevronLeft, ChevronRight, Printer, Loader2, AlertTriangle, PackageX, Sparkles, CheckCircle2 } from 'lucide-react';
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

export interface PipelineItem {
  variantId: string;
  sku: string;
  name: string;
  color: string;
  colorHex: string;
  type: string;
  required: number;
  real: number;
  pendingScan: number;
  inProgress: number;
  queue: number;
  kurang: number;
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

interface LowStockCardProps {
  minusItems?: LowStockItem[];
  pipelineItems?: PipelineItem[];
  recommendationItems?: RecommendationItem[];
  recommendationLoading?: boolean;
  loading?: boolean;
  onSendToPrintQueue?: (variantId: string, qty?: number) => void;
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

export function LowStockCard({ minusItems = [], pipelineItems = [], recommendationItems = [], recommendationLoading = false, loading = false, onSendToPrintQueue }: LowStockCardProps) {
  const [tab, setTab] = useState<'minus' | 'pipeline' | 'reco'>('minus');
  const [page, setPage] = useState(0);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const itemsPerPage = 4;

  const items = tab === 'minus' ? minusItems : tab === 'pipeline' ? pipelineItems : recommendationItems;
  const totalPages = Math.ceil(items.length / itemsPerPage);
  const displayItems = items.slice(page * itemsPerPage, (page + 1) * itemsPerPage) as (LowStockItem | PipelineItem | RecommendationItem)[];

  // Reset page when switching tabs
  const handleTabChange = (newTab: 'minus' | 'pipeline' | 'reco') => {
    if (newTab !== tab) {
      setTab(newTab);
      setPage(0);
    }
  };

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
  const isPipeline = tab === 'pipeline';

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
                Pipeline
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
                onClick={() => handleTabChange('pipeline')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                  isPipeline
                    ? 'bg-[var(--card)] text-[var(--warning)] shadow-sm'
                    : 'text-[var(--t-body)] hover:text-[var(--t-heading)]'
                }`}
              >
                <AlertTriangle className="w-3 h-3" />
                Pipeline
                {pipelineItems.length > 0 && (
                  <span className={`ml-0.5 text-[11px] px-1.5 py-0 rounded-full font-bold ${
                    isPipeline ? 'bg-[var(--warning)] text-white' : 'bg-[var(--warning)]/10 text-[var(--warning)]'
                  }`}>
                    {pipelineItems.length}
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
                ) : isPipeline ? (
                  <>
                    <th className="text-left text-xs font-medium text-[var(--t-body)] py-2 px-3">Breakdown</th>
                    <th className="text-right text-xs font-medium text-[var(--t-body)] py-2 px-3">Status</th>
                  </>
                ) : (
                  <th className="text-right text-xs font-medium text-[var(--t-body)] py-2 px-3">Qty</th>
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
                        {isReco ? 'Belum ada saran reorder' : isMinus ? 'Tidak ada stok minus' : 'Semua aman — nggak ada yang butuh perhatian'}
                      </p>
                      {isReco ? (
                        <p className="text-[11px] text-[var(--t-muted)]">Muncul kalau ada produk dengan demand rutin & stok mepet</p>
                      ) : isMinus ? (
                        <p className="text-[11px] text-[var(--t-muted)]">Produk dengan stok minus akan muncul di sini</p>
                      ) : (
                        <p className="text-[11px] text-[var(--t-muted)]">Produk yang stoknya di bawah kebutuhan (setelah dikredit produksi) akan muncul di sini</p>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                displayItems.map((item, idx) => {
                  const reco = item as RecommendationItem;
                  const stock = item as LowStockItem;
                  const pipe = item as PipelineItem;
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
                            {isMinus && stock.note && (
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
                      ) : isPipeline ? (
                        <>
                          <td className="py-2.5 px-3">
                            <p className="text-[11px] text-[var(--t-muted)] leading-tight">
                              Butuh {pipe.required} · Real {pipe.real}
                              {pipe.pendingScan > 0 && <> · Scan {pipe.pendingScan}</>}
                              {pipe.inProgress > 0 && <> · Print {pipe.inProgress}</>}
                              {pipe.queue > 0 && <> · Antri {pipe.queue}</>}
                            </p>
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            {pipe.kurang > 0 ? (
                              <Badge className="text-[11px] px-2 py-0.5 rounded-full font-semibold bg-[var(--danger)]/10 text-[var(--danger)] border-[var(--danger)]/30" variant="outline">
                                Kurang {pipe.kurang}
                              </Badge>
                            ) : (
                              <Badge className="text-[11px] px-2 py-0.5 rounded-full font-semibold bg-[var(--success)]/10 text-[var(--success)] border-[var(--success)]/30 gap-1" variant="outline">
                                <CheckCircle2 className="w-2.5 h-2.5" /> Aman
                              </Badge>
                            )}
                          </td>
                        </>
                      ) : (
                        <td className="py-2.5 px-3 text-right">
                          <span className="text-sm font-bold text-[var(--danger-dark)]">{stock.qty}</span>
                        </td>
                      )}
                      <td className="py-2.5 px-1">
                        <button
                          onClick={() => handleSendToPrint(item.variantId, isReco ? reco.suggestedQty : isPipeline ? pipe.kurang : undefined)}
                          disabled={sendingId === item.variantId || (isPipeline && pipe.kurang <= 0)}
                          className={`p-1.5 rounded-md transition-colors cursor-pointer disabled:opacity-50 ${
                            isReco
                              ? 'bg-[var(--brand)]/10 hover:bg-[var(--brand)]/20 text-[var(--brand)]'
                              : isMinus
                              ? 'bg-[var(--danger-dark)]/10 hover:bg-[var(--danger-dark)]/20 text-[var(--danger-dark)]'
                              : 'bg-[var(--info)]/10 hover:bg-[var(--info)]/20 text-[var(--info)]'
                          }`}
                          title={isReco ? `Send ${reco.suggestedQty} to Print Queue` : isPipeline ? `Send ${pipe.kurang} to Print Queue` : 'Send to Print Queue'}
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
