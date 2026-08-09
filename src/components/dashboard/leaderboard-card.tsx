'use client';

import { useEffect, useState } from 'react';
import { Trophy, Package } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { DateRangePicker, type SimpleDateRange } from '@/components/dashboard/date-range-picker';

interface VariantBreakdown {
  color: string;
  colorHex: string;
  type: string;
  qty: number;
}

interface LeaderboardEntry {
  productId: string;
  sku: string;
  name: string;
  totalQty: number;
  variants: VariantBreakdown[];
}

const RANK_STYLES = [
  'bg-[#fbbf24]/15 text-[#b45309] border-[#fbbf24]/40', // 1st gold
  'bg-[#d1d5db]/30 text-[#4b5563] border-[#d1d5db]/60', // 2nd silver
  'bg-[#d97706]/10 text-[#92400e] border-[#d97706]/30', // 3rd bronze
];

export function LeaderboardCard() {
  const [dateRange, setDateRange] = useState<SimpleDateRange>(null);
  const [data, setData] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ limit: '10' });
    if (dateRange) {
      params.set('from', dateRange.from.toISOString());
      params.set('to', dateRange.to.toISOString());
    }
    fetch(`/api/dashboard/leaderboard?${params}`)
      .then((r) => r.json())
      .then((d) => setData(d.leaderboard || []))
      .catch(() => setData([]))
      .finally(() => setLoading(false));
  }, [dateRange]);

  const maxQty = data.length > 0 ? data[0].totalQty : 0;

  return (
    <Card className="rounded-xl shadow-sm border-0">
      <CardHeader className="pb-3 px-4 pt-4">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-sm font-semibold text-[#2d3436] flex items-center gap-1.5">
            <Trophy className="w-4 h-4 text-[#d97706]" />
            Leaderboard
          </CardTitle>
          <DateRangePicker value={dateRange} onChange={setDateRange} />
        </div>
        <p className="text-[11px] text-[#6b7280]">Produk terlaris dari Picking List (Adjustment tidak dihitung)</p>
      </CardHeader>
      <CardContent className="px-4 pb-4 pt-0">
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-14 w-full rounded-lg" />
            ))}
          </div>
        ) : data.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <div className="w-14 h-14 rounded-full bg-[#f5f6fa] flex items-center justify-center mb-3">
              <Package className="w-6 h-6 text-[#6b7280]" />
            </div>
            <p className="text-sm text-[#4b5563] font-medium">Belum ada data penjualan</p>
            <p className="text-xs text-[#6b7280] mt-1">Coba pilih range tanggal lain</p>
          </div>
        ) : (
          <div className="space-y-2 max-h-[420px] overflow-y-auto">
            {data.map((entry, idx) => (
              <div key={entry.productId} className="p-3 rounded-lg border border-[#f0f0f0] hover:bg-[#fafafa] transition-colors">
                <div className="flex items-center gap-2.5">
                  <span
                    className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold border flex-shrink-0 ${
                      RANK_STYLES[idx] || 'bg-[#f5f6fa] text-[#6b7280] border-[#e8e8e8]'
                    }`}
                  >
                    {idx + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-[#2d3436] truncate">{entry.name}</span>
                      <span className="text-sm font-bold text-[#4a6741] flex-shrink-0">{entry.totalQty} pcs</span>
                    </div>
                    <p className="text-[11px] text-[#6b7280]">{entry.sku}</p>
                    {/* Progress bar relative to top seller */}
                    <div className="h-1.5 bg-[#f0f0f0] rounded-full mt-1.5 overflow-hidden">
                      <div
                        className="h-full bg-[#4a6741] rounded-full"
                        style={{ width: `${maxQty > 0 ? (entry.totalQty / maxQty) * 100 : 0}%` }}
                      />
                    </div>
                  </div>
                </div>
                {/* Variant/color breakdown */}
                {entry.variants.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2 pl-8">
                    {entry.variants.slice(0, 5).map((v, vIdx) => (
                      <span
                        key={vIdx}
                        className="flex items-center gap-1 text-[10px] bg-[#f5f6fa] rounded-full px-2 py-0.5 text-[#4b5563]"
                      >
                        <span className="w-2 h-2 rounded-full border border-gray-300 flex-shrink-0" style={{ backgroundColor: v.colorHex }} />
                        {v.color || v.type || 'Default'}
                        {v.color && v.type ? ` - ${v.type}` : ''}
                        <span className="font-semibold text-[#2d3436]">{v.qty}</span>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
