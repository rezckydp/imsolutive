'use client';

import { useState } from 'react';
import { BoothStock } from '@/components/dashboard/booth-stock';
import { BundlePricing } from '@/components/dashboard/bundle-pricing';
import { AddOnManagement } from '@/components/dashboard/addon-management';

// Inventory Booth (ims-feature-split-inventory-booth-page.md) — Booth Stock,
// Promo Harga, and Add-On used to live as sub-tabs inside Stock Management;
// they're pure relocations here, same components, same data/logic, just
// their own top-level page now so they're not buried under Produk.
type InventoryBoothTab = 'booth' | 'promo' | 'addon';

export function InventoryBoothPage() {
  const [tab, setTab] = useState<InventoryBoothTab>('booth');

  return (
    <div>
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[var(--t-heading)]">Inventory Booth</h1>
          <p className="text-sm text-[var(--t-body)] mt-1">Booth Stock, Promo Harga, & Add-On</p>
        </div>
      </div>

      {/* Sub-tab Switcher */}
      <div className="flex items-center bg-[var(--surface)] rounded-lg p-0.5 mb-4 w-fit">
        <button
          onClick={() => setTab('booth')}
          className={`px-4 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer ${
            tab === 'booth' ? 'bg-[var(--card)] text-[var(--brand)] shadow-sm' : 'text-[var(--t-body)] hover:text-[var(--t-heading)]'
          }`}
        >
          Booth Stock
        </button>
        <button
          onClick={() => setTab('promo')}
          className={`px-4 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer ${
            tab === 'promo' ? 'bg-[var(--card)] text-[var(--brand)] shadow-sm' : 'text-[var(--t-body)] hover:text-[var(--t-heading)]'
          }`}
        >
          Promo Harga
        </button>
        <button
          onClick={() => setTab('addon')}
          className={`px-4 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer ${
            tab === 'addon' ? 'bg-[var(--card)] text-[var(--brand)] shadow-sm' : 'text-[var(--t-body)] hover:text-[var(--t-heading)]'
          }`}
        >
          Add-On
        </button>
      </div>

      {tab === 'booth' && <BoothStock />}
      {tab === 'promo' && <BundlePricing />}
      {tab === 'addon' && <AddOnManagement />}
    </div>
  );
}
