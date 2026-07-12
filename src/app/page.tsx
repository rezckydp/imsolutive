'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Sidebar } from '@/components/dashboard/sidebar';
import { Header } from '@/components/dashboard/header';
import { LowStockCard, type LowStockItem } from '@/components/dashboard/low-stock-card';
import { PrintQueueCard, type PrintQueueItem } from '@/components/dashboard/print-queue-card';
import { InProductionCard, type ProductionItem } from '@/components/dashboard/in-production-card';
import { ProductionHistoryCard, type ProductionHistoryItem } from '@/components/dashboard/production-history-card';
import { OrderList, type OrderItem } from '@/components/dashboard/order-list';
import { RecentOrderCard, type RecentOrderItem } from '@/components/dashboard/recent-order-card';
import { BarcodeScanner } from '@/components/dashboard/barcode-scanner';
import { CombinedEntryDialog } from '@/components/dashboard/combined-entry-dialog';
import { StockManagement } from '@/components/dashboard/stock-management';
import { ProductionManagement } from '@/components/dashboard/production-management';
import { StockOpname } from '@/components/dashboard/stock-opname';
import { SettingsPage } from '@/components/dashboard/settings-page';
import { PrinterDatabase } from '@/components/dashboard/printer-database';
import { ColorManagement } from '@/components/dashboard/color-management';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Menu, ScanBarcode, Package } from 'lucide-react';

interface StockProduct {
  id: string;
  productId: string;
  color: string;
  colorHex: string;
  type: string;
  qty: number;
  product: {
    id: string;
    sku: string;
    name: string;
    minStock: number;
    parentProductId: string | null;
  };
}

interface DashboardData {
  minusStockProducts: StockProduct[];
  lowStockProducts: StockProduct[];
  printQueueItems: Array<{
    id: string;
    variantId: string;
    qty: number;
    status: string;
    note: string;
    variant: {
      id: string;
      color: string;
      colorHex: string;
      type: string;
      product: {
        sku: string;
        name: string;
      };
    };
  }>;
  productionItems: Array<{
    id: string;
    variantId: string;
    qty: number;
    assignedTo: string;
    note: string;
    variant: {
      id: string;
      color: string;
      colorHex: string;
      type: string;
      product: {
        sku: string;
        name: string;
      };
    };
  }>;
  allProductionItems: Array<{
    id: string;
    variantId: string;
    qty: number;
    assignedTo: string;
    status: string;
    note: string;
    completedAt: string | null;
    createdAt: string;
    variant: {
      id: string;
      color: string;
      colorHex: string;
      type: string;
      product: {
        sku: string;
        name: string;
      };
    };
  }>;
  recentOrders: Array<{
    id: string;
    orderNo: string;
    status: string;
    createdAt: string;
    orderItems: Array<{
      id: string;
      qty: number;
      status: string;
      variant: {
        id: string;
        color: string;
        colorHex: string;
        type: string;
        qty: number;
        product: {
          sku: string;
          name: string;
        };
      };
    }>;
  }>;
  summary: {
    totalProducts: number;
    totalVariants: number;
    minusStockCount: number;
    lowStockCount: number;
    printQueueCount: number;
    productionCount: number;
    totalOrders: number;
  };
}

function SummaryCardSkeleton() {
  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-3">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-8 w-8 rounded-full" />
      </div>
      <Skeleton className="h-7 w-16 mb-1" />
      <Skeleton className="h-3 w-20" />
    </div>
  );
}

function formatDate(isoString: string): string {
  const d = new Date(isoString);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const year = d.getFullYear();
  const month = months[d.getMonth()];
  const day = d.getDate().toString().padStart(2, '0');
  const hours = d.getHours().toString().padStart(2, '0');
  const minutes = d.getMinutes().toString().padStart(2, '0');
  return `${month} ${day}, ${year} ${hours}:${minutes}`;
}

// Mobile header component
function MobileHeader({
  title,
  onMenuClick,
  onScanClick,
}: {
  title: string;
  onMenuClick: () => void;
  onScanClick: () => void;
}) {
  return (
    <div className="md:hidden sticky top-0 z-30 bg-white border-b border-[#e8e8e8] px-4 py-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={onMenuClick}
            className="p-2 -ml-2 rounded-lg hover:bg-[#f5f6fa] transition-colors cursor-pointer"
          >
            <Menu className="w-5 h-5 text-[#2d3436]" />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-[#4a6741] flex items-center justify-center">
              <Package className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-[#4a6741] text-sm">Solutive</span>
          </div>
        </div>
        <button
          onClick={onScanClick}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-[#4a6741] hover:bg-[#3d5535] text-white text-xs font-medium rounded-full transition-colors cursor-pointer"
        >
          <ScanBarcode className="w-3.5 h-3.5" />
          <span>Scan</span>
        </button>
      </div>
      {/* Mobile page title */}
      <h1 className="text-lg font-bold text-[#2d3436] mt-2">{title}</h1>
    </div>
  );
}

export default function Home() {
  const [activeNavItem, setActiveNavItem] = useState('dashboard');
  const [barcodeOpen, setBarcodeOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [addNewOpen, setAddNewOpen] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  // Dashboard data
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDashboardData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch('/api/dashboard');
      if (!res.ok) {
        throw new Error('Failed to fetch dashboard data');
      }
      const data = await res.json();
      setDashboardData(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeNavItem === 'dashboard') {
      fetchDashboardData();
    }
  }, [activeNavItem, fetchDashboardData]);

  // Close mobile sidebar when switching to desktop size
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 768) {
        setMobileSidebarOpen(false);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleRemovePrintItem = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/print-queue/${id}`, { method: 'DELETE' });
      if (res.ok) {
        fetchDashboardData();
      }
    } catch {
      // silent
    }
  }, [fetchDashboardData]);

  const handleUpdatePrintItem = useCallback(async (id: string, data: { qty?: number; status?: string }) => {
    try {
      const res = await fetch(`/api/print-queue/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        fetchDashboardData();
      }
    } catch {
      // silent
    }
  }, [fetchDashboardData]);

  const handleSendToProduction = useCallback(async (printQueueItem: PrintQueueItem) => {
    try {
      // 1. Create production item (pass note from PrintQueueItem)
      const prodRes = await fetch('/api/production', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ variantId: printQueueItem.variantId, qty: printQueueItem.qty, note: printQueueItem.note || '' }),
      });
      if (prodRes.ok) {
        // 2. Remove from print queue
        await fetch(`/api/print-queue/${printQueueItem.id}`, { method: 'DELETE' });
        fetchDashboardData();
      }
    } catch {
      // silent
    }
  }, [fetchDashboardData]);

  const handleDataChanged = useCallback(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  // Build a map: variantId → latest note from active (non-cancelled) orders
  // Must be defined before callbacks that use it
  const variantNoteMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const order of dashboardData?.recentOrders ?? []) {
      if (order.status === 'Cancelled') continue;
      for (const item of order.orderItems) {
        if (item.note && !map[item.variantId]) {
          map[item.variantId] = item.note;
        }
      }
    }
    return map;
  }, [dashboardData?.recentOrders]);

  const handleSendToPrintQueue = useCallback(async (variantId: string) => {
    try {
      const res = await fetch('/api/print-queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ variantId, qty: 1, status: 'Normal', note: variantNoteMap[variantId] || '' }),
      });
      if (res.ok) {
        fetchDashboardData();
      }
    } catch {
      // silent
    }
  }, [fetchDashboardData, variantNoteMap]);

  const handleCompleteProduction = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/production/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'Completed' }),
      });
      if (res.ok) {
        fetchDashboardData();
      }
    } catch {
      // silent
    }
  }, [fetchDashboardData]);

  const handleSendBackToPrintQueue = useCallback(async (productionItem: ProductionItem) => {
    try {
      // 1. Create print queue item
      const pqRes = await fetch('/api/print-queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ variantId: productionItem.variantId, qty: productionItem.qty, status: 'Normal', note: variantNoteMap[productionItem.variantId] || '' }),
      });
      if (pqRes.ok) {
        // 2. Remove from production
        await fetch(`/api/production/${productionItem.id}`, { method: 'DELETE' });
        fetchDashboardData();
      }
    } catch {
      // silent
    }
  }, [fetchDashboardData]);

  const handleNavChange = (item: string) => {
    if (item === 'logout') {
      handleLogout();
      return;
    }
    setActiveNavItem(item);
    setMobileSidebarOpen(false);
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'logout' }),
      });
      window.location.href = '/login';
    } catch {
      // force redirect even if API fails
      window.location.href = '/login';
    }
  };

  // Dashboard view data transforms
  const mapStockItem = (v: StockProduct): LowStockItem => ({
    sku: v.product.sku,
    name: v.product.name,
    variantId: v.id,
    color: v.color,
    colorHex: v.colorHex,
    type: v.type || '',
    qty: v.qty,
    minStock: v.product.minStock,
    note: variantNoteMap[v.id] || '',
  });

  const minusStockItems = (dashboardData?.minusStockProducts ?? []).map(mapStockItem);
  const lowStockItems = (dashboardData?.lowStockProducts ?? []).map(mapStockItem);

  const printQueueItems: PrintQueueItem[] = (dashboardData?.printQueueItems ?? []).map((item) => ({
    id: item.id,
    variantId: item.variantId,
    sku: item.variant.product.sku,
    name: item.variant.product.name,
    color: item.variant.color,
    colorHex: item.variant.colorHex,
    type: item.variant.type || '',
    qty: item.qty,
    status: item.status,
    note: item.note || '',
  }));

  const productionItems: ProductionItem[] = (dashboardData?.productionItems ?? []).map((item) => ({
    id: item.id,
    variantId: item.variantId,
    sku: item.variant.product.sku,
    name: item.variant.product.name,
    color: item.variant.color,
    colorHex: item.variant.colorHex,
    type: item.variant.type || '',
    qty: item.qty,
    assignedTo: item.assignedTo,
    note: item.note || variantNoteMap[item.variantId] || '',
  }));

  const allProductionItems: ProductionHistoryItem[] = (dashboardData?.allProductionItems ?? []).map((item) => ({
    id: item.id,
    variantId: item.variantId,
    sku: item.variant.product.sku,
    name: item.variant.product.name,
    color: item.variant.color,
    colorHex: item.variant.colorHex,
    type: item.variant.type || '',
    qty: item.qty,
    assignedTo: item.assignedTo,
    status: item.status,
    completedAt: item.completedAt,
    createdAt: item.createdAt,
  }));

  const orderItems: OrderItem[] = (dashboardData?.recentOrders ?? []).map((order) => ({
    orderNo: order.orderNo,
    timestamp: formatDate(order.createdAt),
    status: order.status,
  }));

  // Flatten orders into individual order items for RecentOrderCard (FIFO sorted)
  const recentOrderItems: RecentOrderItem[] = (dashboardData?.recentOrders ?? []).flatMap((order) =>
    order.orderItems.map((item) => ({
      id: item.id,
      orderId: order.id,
      orderNo: order.orderNo,
      sku: item.variant.product.sku,
      name: item.variant.product.name,
      color: item.variant.color,
      colorHex: item.variant.colorHex,
      type: item.variant.type || '',
      orderedQty: item.qty,
      currentStock: item.variant.qty,
      itemStatus: item.status,       // Ready, Not Ready, In Queue (from DB)
      orderStatus: order.status,      // Pending, Processing, Completed, Cancelled
      note: item.note || '',
      createdAt: order.createdAt,
    }))
  );

  const summary = dashboardData?.summary;

  // Determine what to show in the main area
  const showDashboard = activeNavItem === 'dashboard';
  const showStockManagement = activeNavItem === 'stock-management';
  const showPrinterDatabase = activeNavItem === 'printer-database';
  const showColorVariant = activeNavItem === 'color-variant';
  const showProduction = activeNavItem === 'production';
  const showStockOpname = activeNavItem === 'stock-opname';
  const showSettings = activeNavItem === 'settings';

  // Header title
  const headerTitle = showDashboard
    ? 'Dashboard'
    : showStockManagement
    ? 'Stock Management'
    : showPrinterDatabase
    ? '3D Printer'
    : showColorVariant
    ? 'Color Variant'
    : showProduction
    ? 'Production Management'
    : showStockOpname
    ? 'Stock Opname'
    : activeNavItem.charAt(0).toUpperCase() + activeNavItem.slice(1).replace(/-/g, ' ');

  return (
    <div className="min-h-screen bg-[#f5f6fa]">
      {/* Sidebar — hidden on mobile, shown on md+ */}
      <Sidebar
        activeItem={activeNavItem}
        onItemClick={handleNavChange}
        onScanBarcode={() => setBarcodeOpen(true)}
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
        mobileOpen={mobileSidebarOpen}
        onMobileClose={() => setMobileSidebarOpen(false)}
      />

      {/* Main Content */}
      <div className={`
        min-h-screen transition-all duration-300 ease-in-out
        ${sidebarCollapsed ? 'md:ml-[68px]' : 'md:ml-[240px]'}
      `}>
        {/* Mobile Header */}
        <MobileHeader
          title={headerTitle}
          onMenuClick={() => setMobileSidebarOpen(true)}
          onScanClick={() => setBarcodeOpen(true)}
        />

        {/* Desktop: use ScrollArea | Mobile: native scroll for better touch support */}
        <div className="md:hidden overflow-y-auto min-h-[calc(100vh-60px)]">
          <div className="p-4 pb-8">
            {renderContent()}
          </div>
        </div>
        <div className="hidden md:block">
          <ScrollArea className="h-screen">
            <div className="p-6 lg:p-8">
              {renderContent()}
            </div>
          </ScrollArea>
        </div>
      </div>

      {/* Dialogs */}
      <BarcodeScanner open={barcodeOpen} onOpenChange={setBarcodeOpen} onOrderCreated={handleDataChanged} onProductionAdded={handleDataChanged} />
      <CombinedEntryDialog
        open={addNewOpen}
        onOpenChange={setAddNewOpen}
        onOrderCreated={handleDataChanged}
        onProductionAdded={handleDataChanged}
      />
    </div>
  );

  function renderContent() {
    return (
      <>
        {/* ========== DASHBOARD VIEW ========== */}
        {showDashboard && (
          <>
            {/* Desktop Header */}
            <div className="hidden md:block">
              <Header
                title="Dashboard"
                onScanBarcode={() => setBarcodeOpen(true)}
              />
            </div>

            {/* Summary Cards Row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-4 md:mb-6">
              <div className="bg-white rounded-xl shadow-sm p-3 md:p-4">
                <div className="flex items-center justify-between mb-2 md:mb-3">
                  <span className="text-[11px] md:text-xs text-[#4b5563] font-medium">Total Products</span>
                  <div className="w-7 h-7 md:w-8 md:h-8 rounded-full bg-[#4a6741]/10 flex items-center justify-center">
                    <svg className="w-3.5 h-3.5 md:w-4 md:h-4 text-[#4a6741]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                    </svg>
                  </div>
                </div>
                {loading ? (
                  <SummaryCardSkeleton />
                ) : (
                  <>
                    <p className="text-xl md:text-2xl font-bold text-[#2d3436]">{summary?.totalProducts ?? 0}</p>
                    <p className="text-[11px] md:text-xs text-[#4b5563]">{summary?.totalVariants ?? 0} variants</p>
                  </>
                )}
              </div>

              <div className="bg-white rounded-xl shadow-sm p-3 md:p-4">
                <div className="flex items-center justify-between mb-2 md:mb-3">
                  <span className="text-[11px] md:text-xs text-[#4b5563] font-medium">Stock Alert</span>
                  <div className="w-7 h-7 md:w-8 md:h-8 rounded-full bg-[#dc2626]/10 flex items-center justify-center">
                    <svg className="w-3.5 h-3.5 md:w-4 md:h-4 text-[#dc2626]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                    </svg>
                  </div>
                </div>
                {loading ? (
                  <SummaryCardSkeleton />
                ) : (
                  <>
                    <div className="flex items-baseline gap-1.5">
                      <p className="text-xl md:text-2xl font-bold text-[#b91c1c]">{summary?.minusStockCount ?? 0}</p>
                      <span className="text-[11px] text-[#6b7280]">/</span>
                      <p className="text-lg md:text-xl font-bold text-[#d97706]">{summary?.lowStockCount ?? 0}</p>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[11px] md:text-[11px] text-[#b91c1c]">minus</span>
                      <span className="text-[11px] text-[#6b7280]">·</span>
                      <span className="text-[11px] md:text-[11px] text-[#d97706]">low stock</span>
                    </div>
                  </>
                )}
              </div>

              <div className="bg-white rounded-xl shadow-sm p-3 md:p-4">
                <div className="flex items-center justify-between mb-2 md:mb-3">
                  <span className="text-[11px] md:text-xs text-[#4b5563] font-medium">Print Queue</span>
                  <div className="w-7 h-7 md:w-8 md:h-8 rounded-full bg-[#2563eb]/10 flex items-center justify-center">
                    <svg className="w-3.5 h-3.5 md:w-4 md:h-4 text-[#2563eb]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                    </svg>
                  </div>
                </div>
                {loading ? (
                  <SummaryCardSkeleton />
                ) : (
                  <>
                    <p className="text-xl md:text-2xl font-bold text-[#2563eb]">{summary?.printQueueCount ?? 0}</p>
                    <p className="text-[11px] md:text-xs text-[#4b5563]">in queue</p>
                  </>
                )}
              </div>

              <div className="bg-white rounded-xl shadow-sm p-3 md:p-4">
                <div className="flex items-center justify-between mb-2 md:mb-3">
                  <span className="text-[11px] md:text-xs text-[#4b5563] font-medium">Total Orders</span>
                  <div className="w-7 h-7 md:w-8 md:h-8 rounded-full bg-[#d97706]/10 flex items-center justify-center">
                    <svg className="w-3.5 h-3.5 md:w-4 md:h-4 text-[#d97706]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                    </svg>
                  </div>
                </div>
                {loading ? (
                  <SummaryCardSkeleton />
                ) : (
                  <>
                    <p className="text-xl md:text-2xl font-bold text-[#d97706]">{summary?.totalOrders ?? 0}</p>
                    <p className="text-[11px] md:text-xs text-[#4b5563]">total orders</p>
                  </>
                )}
              </div>
            </div>

            {/* Error State */}
            {error && (
              <div className="bg-white rounded-xl shadow-sm p-4 md:p-6 mb-4 md:mb-6 border-l-4 border-[#dc2626]">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-[#dc2626]/10 flex items-center justify-center flex-shrink-0">
                    <svg className="w-4 h-4 text-[#dc2626]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-[#2d3436]">Failed to load dashboard data</p>
                    <p className="text-xs text-[#4b5563] mt-0.5 truncate">{error}</p>
                  </div>
                  <button
                    onClick={fetchDashboardData}
                    className="text-xs text-[#4a6741] font-medium hover:underline cursor-pointer flex-shrink-0"
                  >
                    Retry
                  </button>
                </div>
              </div>
            )}

            {/* Top Row: Three Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 md:gap-4 mb-3 md:mb-4">
              <LowStockCard minusItems={minusStockItems} lowItems={lowStockItems} loading={loading} onSendToPrintQueue={handleSendToPrintQueue} printQueueItems={printQueueItems} productionItems={productionItems} />
              <PrintQueueCard
                items={printQueueItems}
                loading={loading}
                onRemoveItem={handleRemovePrintItem}
                onUpdateItem={handleUpdatePrintItem}
                onSendToProduction={handleSendToProduction}
              />
              <InProductionCard
                items={productionItems}
                loading={loading}
                onComplete={handleCompleteProduction}
                onSendBack={handleSendBackToPrintQueue}
                onAdd={() => setAddNewOpen(true)}
                onUpdatePrinter={() => fetchDashboardData()}
              />
            </div>

            {/* Bottom Row: Recent Order + Production History */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 md:gap-4 mb-4">
              <RecentOrderCard
                items={recentOrderItems}
                loading={loading}
                onDataChange={fetchDashboardData}
              />
              <ProductionHistoryCard
                items={allProductionItems}
                loading={loading}
                onDataChange={fetchDashboardData}
              />
            </div>
          </>
        )}

        {/* ========== STOCK MANAGEMENT VIEW ========== */}
        {showStockManagement && (
          <StockManagement />
        )}

        {/* ========== PRINTER DATABASE VIEW ========== */}
        {showPrinterDatabase && (
          <PrinterDatabase />
        )}

        {/* ========== COLOR VARIANT VIEW ========== */}
        {showColorVariant && (
          <ColorManagement />
        )}

        {/* ========== PRODUCTION VIEW ========== */}
        {showProduction && (
          <ProductionManagement />
        )}

        {/* ========== STOCK OPNAME VIEW ========== */}
        {showStockOpname && (
          <StockOpname />
        )}

        {/* ========== SETTINGS VIEW ========== */}
        {showSettings && (
          <SettingsPage />
        )}

        {/* ========== PLACEHOLDER FOR OTHER NAV ITEMS ========== */}
        {!showDashboard && !showStockManagement && !showPrinterDatabase && !showColorVariant && !showProduction && !showStockOpname && !showSettings && (
          <>
            <div className="hidden md:block">
              <Header title={headerTitle} />
            </div>
            <div className="bg-white rounded-xl shadow-sm p-8 md:p-12 flex flex-col items-center justify-center">
              <div className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-[#f5f6fa] flex items-center justify-center mb-4">
                <svg className="w-8 h-8 md:w-10 md:h-10 text-[#6b7280]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
              </div>
              <h2 className="text-lg font-semibold text-[#2d3436] mb-2">
                {headerTitle}
              </h2>
              <p className="text-sm text-[#4b5563] text-center max-w-md">
                This section is coming soon. It will be available in a future update.
              </p>
            </div>
          </>
        )}
      </>
    );
  }
}
