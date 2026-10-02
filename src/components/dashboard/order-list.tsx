'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';


export interface OrderItem {
  orderNo: string;
  timestamp: string;
  status: string;
}

interface OrderListProps {
  orders?: OrderItem[];
  loading?: boolean;
}

const statusStyles: Record<string, string> = {
  Processing: 'bg-[var(--card)] text-[var(--info)] border-[var(--bd-blue)]',
  Completed: 'bg-[var(--card)] text-[var(--brand)] border-[var(--bd-blue)]',
  Pending: 'bg-[var(--card)] text-[var(--warning)] border-[var(--bd-blue)]',
  Cancelled: 'bg-[var(--card)] text-[var(--danger)] border-[var(--bd-blue)]',
};

const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function SkeletonRows() {
  return (
    <>
      {[...Array(6)].map((_, i) => (
        <tr key={i} className="border-t border-[var(--surface-2)]">
          <td className="py-2.5 px-4">
            <Skeleton className="h-4 w-28" />
          </td>
          <td className="py-2.5 px-4">
            <Skeleton className="h-4 w-32" />
          </td>
          <td className="py-2.5 px-4">
            <Skeleton className="h-5 w-20 rounded-full" />
          </td>
        </tr>
      ))}
    </>
  );
}

export function OrderList({ orders = [], loading = false }: OrderListProps) {
  const [selectedMonth, setSelectedMonth] = useState('October');
  const [showMonthDropdown, setShowMonthDropdown] = useState(false);

  // Filter orders by selected month (match month name in timestamp string)
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const selectedMonthIdx = months.indexOf(selectedMonth);
  const filteredOrders = orders.filter((order) => {
    if (selectedMonthIdx < 0) return true;
    const monthInTimestamp = monthNames.findIndex((m) => order.timestamp.includes(m));
    return monthInTimestamp === selectedMonthIdx;
  });

  return (
    <Card className="rounded-xl shadow-sm border-0">
      <CardHeader className="pb-3 flex flex-row items-center justify-between px-4 pt-4">
        <CardTitle className="text-sm font-semibold text-[var(--t-heading)]">Order List</CardTitle>
        <div className="relative">
          <button
            onClick={() => setShowMonthDropdown(!showMonthDropdown)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[var(--surface-2)] hover:bg-[var(--bd)] text-sm text-[var(--t-body)] font-medium transition-colors cursor-pointer"
          >
            {selectedMonth}
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
          {showMonthDropdown && (
            <div className="absolute right-0 top-full mt-1 bg-[var(--card)] rounded-lg shadow-lg border border-[var(--bd)] py-1 z-50 min-w-[140px]">
              {months.map((month) => (
                <button
                  key={month}
                  onClick={() => {
                    setSelectedMonth(month);
                    setShowMonthDropdown(false);
                  }}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-[var(--surface)] transition-colors cursor-pointer ${
                    month === selectedMonth ? 'text-[var(--brand)] font-medium bg-[var(--surface)]' : 'text-[var(--t-body)]'
                  }`}
                >
                  {month}
                </button>
              ))}
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-4 pt-0">
        <div className="rounded-lg border border-[var(--bd)] overflow-hidden">
          <div className="max-h-64 overflow-y-auto -webkit-overflow-scrolling-touch">
            <table className="w-full">
              <thead>
                <tr className="bg-[var(--surface)]">
                  <th className="text-left text-xs font-medium text-[var(--t-body)] py-2 px-4">Order No.</th>
                  <th className="text-left text-xs font-medium text-[var(--t-body)] py-2 px-4">Timestamp</th>
                  <th className="text-left text-xs font-medium text-[var(--t-body)] py-2 px-4">Status</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <SkeletonRows />
                ) : filteredOrders.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="text-center py-6 text-sm text-[var(--t-body)]">
                      No orders found
                    </td>
                  </tr>
                ) : (
                  filteredOrders.map((order) => (
                    <tr
                      key={order.orderNo}
                      className="border-t border-[var(--surface-2)] hover:bg-[var(--surface-hover)] transition-colors"
                    >
                      <td className="py-2.5 px-4 text-sm font-medium text-[var(--t-heading)]">{order.orderNo}</td>
                      <td className="py-2.5 px-4 text-sm text-[var(--t-body)]">{order.timestamp}</td>
                      <td className="py-2.5 px-4">
                        <Badge
                          variant="outline"
                          className={`text-[11px] px-2.5 py-0.5 rounded-full font-medium ${statusStyles[order.status] || 'bg-[var(--card)] text-[var(--t-body)] border-[var(--bd)]'}`}
                        >
                          {order.status}
                        </Badge>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
