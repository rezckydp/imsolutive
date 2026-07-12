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
  Processing: 'bg-white text-[#2563eb] border-[#dfe6e9]',
  Completed: 'bg-white text-[#4a6741] border-[#dfe6e9]',
  Pending: 'bg-white text-[#d97706] border-[#dfe6e9]',
  Cancelled: 'bg-white text-[#dc2626] border-[#dfe6e9]',
};

const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function SkeletonRows() {
  return (
    <>
      {[...Array(6)].map((_, i) => (
        <tr key={i} className="border-t border-[#f0f0f0]">
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
        <CardTitle className="text-sm font-semibold text-[#2d3436]">Order List</CardTitle>
        <div className="relative">
          <button
            onClick={() => setShowMonthDropdown(!showMonthDropdown)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#f0f0f0] hover:bg-[#e8e8e8] text-sm text-[#4b5563] font-medium transition-colors cursor-pointer"
          >
            {selectedMonth}
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
          {showMonthDropdown && (
            <div className="absolute right-0 top-full mt-1 bg-white rounded-lg shadow-lg border border-[#e8e8e8] py-1 z-50 min-w-[140px]">
              {months.map((month) => (
                <button
                  key={month}
                  onClick={() => {
                    setSelectedMonth(month);
                    setShowMonthDropdown(false);
                  }}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-[#f5f6fa] transition-colors cursor-pointer ${
                    month === selectedMonth ? 'text-[#4a6741] font-medium bg-[#f5f6fa]' : 'text-[#4b5563]'
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
        <div className="rounded-lg border border-[#e8e8e8] overflow-hidden">
          <div className="max-h-64 overflow-y-auto -webkit-overflow-scrolling-touch">
            <table className="w-full">
              <thead>
                <tr className="bg-[#f5f6fa]">
                  <th className="text-left text-xs font-medium text-[#4b5563] py-2 px-4">Order No.</th>
                  <th className="text-left text-xs font-medium text-[#4b5563] py-2 px-4">Timestamp</th>
                  <th className="text-left text-xs font-medium text-[#4b5563] py-2 px-4">Status</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <SkeletonRows />
                ) : filteredOrders.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="text-center py-6 text-sm text-[#4b5563]">
                      No orders found
                    </td>
                  </tr>
                ) : (
                  filteredOrders.map((order) => (
                    <tr
                      key={order.orderNo}
                      className="border-t border-[#f0f0f0] hover:bg-[#fafafa] transition-colors"
                    >
                      <td className="py-2.5 px-4 text-sm font-medium text-[#2d3436]">{order.orderNo}</td>
                      <td className="py-2.5 px-4 text-sm text-[#4b5563]">{order.timestamp}</td>
                      <td className="py-2.5 px-4">
                        <Badge
                          variant="outline"
                          className={`text-[11px] px-2.5 py-0.5 rounded-full font-medium ${statusStyles[order.status] || 'bg-white text-gray-600 border-gray-200'}`}
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
