'use client';

import { useState, useEffect } from 'react';
import { StockManagement } from '@/components/dashboard/stock-management';
import { MaterialCatalogTab, RiwayatTab } from '@/components/dashboard/inventory-management';
import { FilamentTab } from '@/components/dashboard/filament-tab';

export type WarehouseSubTab = 'produk' | 'material' | 'filament' | 'riwayat';

interface WarehouseManagementPageProps {
  // Deep-link from the Dashboard low-stock notification bell — jump straight
  // to the Material sub-tab with a specific Material selected.
  initialSubTab?: WarehouseSubTab | null;
  selectMaterialId?: string | null;
  onDeepLinkConsumed?: () => void;
}

export function WarehouseManagementPage({ initialSubTab, selectMaterialId, onDeepLinkConsumed }: WarehouseManagementPageProps) {
  const [tab, setTab] = useState<WarehouseSubTab>('produk');

  useEffect(() => {
    if (initialSubTab) {
      setTab(initialSubTab);
      onDeepLinkConsumed?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSubTab]);

  return (
    <div>
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[var(--t-heading)]">Warehouse Management</h1>
          <p className="text-sm text-[var(--t-body)] mt-1">Produk, Material, & riwayat pergerakan stok</p>
        </div>
      </div>

      {/* Sub-tab Switcher */}
      <div className="flex items-center bg-[var(--surface)] rounded-lg p-0.5 mb-4 w-fit">
        <button
          onClick={() => setTab('produk')}
          className={`px-4 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer ${
            tab === 'produk' ? 'bg-[var(--card)] text-[var(--brand)] shadow-sm' : 'text-[var(--t-body)] hover:text-[var(--t-heading)]'
          }`}
        >
          Produk
        </button>
        <button
          onClick={() => setTab('material')}
          className={`px-4 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer ${
            tab === 'material' ? 'bg-[var(--card)] text-[var(--brand)] shadow-sm' : 'text-[var(--t-body)] hover:text-[var(--t-heading)]'
          }`}
        >
          Material
        </button>
        <button
          onClick={() => setTab('filament')}
          className={`px-4 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer ${
            tab === 'filament' ? 'bg-[var(--card)] text-[var(--brand)] shadow-sm' : 'text-[var(--t-body)] hover:text-[var(--t-heading)]'
          }`}
        >
          Filament
        </button>
        <button
          onClick={() => setTab('riwayat')}
          className={`px-4 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer ${
            tab === 'riwayat' ? 'bg-[var(--card)] text-[var(--brand)] shadow-sm' : 'text-[var(--t-body)] hover:text-[var(--t-heading)]'
          }`}
        >
          Riwayat Ambil Material
        </button>
      </div>

      {tab === 'produk' && <StockManagement />}
      {tab === 'material' && (
        <MaterialCatalogTab selectMaterialId={tab === 'material' ? selectMaterialId : null} onSelectConsumed={onDeepLinkConsumed} />
      )}
      {tab === 'filament' && <FilamentTab />}
      {tab === 'riwayat' && <RiwayatTab />}
    </div>
  );
}
