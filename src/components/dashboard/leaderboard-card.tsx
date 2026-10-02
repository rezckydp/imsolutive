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
  'bg-[var(--warning-light)]/15 text-[var(--warning-dark)] border-[var(--warning-light)]/40', // 1st gold
  'bg-[var(--bd-2)]/30 text-[var(--t-body)] border-[var(--bd-2)]/60', // 2nd silver
  'bg-[var(--warning)]/10 text-[var(--warning-darker)] border-[var(--warning)]/30', // 3rd bronze
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
          <CardTitle className="text-sm font-semibold text-[var(--t-heading)] flex items-center gap-1.5">
            <Trophy className="w-4 h-4 text-[var(--warning)]" />
            Leaderboard
          </CardTitle>
          <DateRangePicker value={dateRange} onChange={setDateRange} />
        </div>
        <p className="text-[11px] text-[var(--t-muted)]">Produk terlaris dari Picking List (Adjustment tidak dihitung)</p>
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
            <div className="w-14 h-14 rounded-full bg-[var(--surface)] flex items-center justify-center mb-3">
              <Package className="w-6 h-6 text-[var(--t-muted)]" />
            </div>
            <p className="text-sm text-[var(--t-body)] font-medium">Belum ada data penjualan</p>
            <p className="text-xs text-[var(--t-muted)] mt-1">Coba pilih range tanggal lain</p>
          </div>
        ) : (
          <div className="space-y-2 max-h-[420px] overflow-y-auto">
            {data.map((entry, idx) => (
              <div key={entry.productId} className="p-3 rounded-lg border border-[var(--surface-2)] hover:bg-[var(--surface-hover)] transition-colors">
                <div className="flex items-center gap-2.5">
                  <span
                    className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold border flex-shrink-0 ${
                      RANK_STYLES[idx] || 'bg-[var(--surface)] text-[var(--t-muted)] border-[var(--bd)]'
                    }`}
                  >
                    {idx + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-[var(--t-heading)] truncate">{entry.name}</span>
                      <span className="text-sm font-bold text-[var(--brand)] flex-shrink-0">{entry.totalQty} pcs</span>
                    </div>
                    <p className="text-[11px] text-[var(--t-muted)]">{entry.sku}</p>
                    {/* Progress bar relative to top seller */}
                    <div className="h-1.5 bg-[var(--surface-2)] rounded-full mt-1.5 overflow-hidden">
                      <div
                        className="h-full bg-[var(--brand)] rounded-full"
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
                        className="flex items-center gap-1 text-[10px] bg-[var(--surface)] rounded-full px-2 py-0.5 text-[var(--t-body)]"
                      >
                        <span className="w-2 h-2 rounded-full border border-gray-300 flex-shrink-0" style={{ backgroundColor: v.colorHex }} />
                        {v.color || v.type || 'Default'}
                        {v.color && v.type ? ` - ${v.type}` : ''}
                        <span className="font-semibold text-[var(--t-heading)]">{v.qty}</span>
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
