'use client';

import { useState, useEffect, useRef } from 'react';
import { ScanBarcode, Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { ThemeToggle } from '@/components/dashboard/theme-toggle';

interface HeaderProps {
  title: string;
  onScanBarcode?: () => void;
  rightAction?: React.ReactNode;
  // Click on a low-stock item in the notification panel — jumps to
  // Warehouse Management > Material with that Material selected.
  onNavigateToMaterial?: (materialId: string) => void;
}

interface CurrentUser {
  username: string;
  name: string;
  role: 'ADMIN' | 'STAFF';
}

interface MaterialVariantRow {
  id: string;
  label: string;
  stock: number;
  minStock: number;
}

interface MaterialRow {
  id: string;
  name: string;
  hasVariants: boolean;
  stock: number | null;
  minStock: number | null;
  variants: MaterialVariantRow[];
}

interface LowStockNotifItem {
  materialId: string;
  label: string;
  stock: number;
  minStock: number;
  diff: number;
}

function computeLowStockItems(materials: MaterialRow[]): LowStockNotifItem[] {
  const items: LowStockNotifItem[] = [];
  for (const m of materials) {
    if (m.hasVariants) {
      for (const v of m.variants) {
        if (v.stock < v.minStock) {
          items.push({ materialId: m.id, label: `${m.name} — ${v.label}`, stock: v.stock, minStock: v.minStock, diff: v.minStock - v.stock });
        }
      }
    } else {
      const stock = m.stock ?? 0;
      const minStock = m.minStock ?? 0;
      if (stock < minStock) {
        items.push({ materialId: m.id, label: m.name, stock, minStock, diff: minStock - stock });
      }
    }
  }
  return items.sort((a, b) => b.diff - a.diff);
}

function getInitials(label: string): string {
  const parts = label.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export function Header({ title, onScanBarcode, rightAction, onNavigateToMaterial }: HeaderProps) {
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [lowStockItems, setLowStockItems] = useState<LowStockNotifItem[]>([]);
  const [notifOpen, setNotifOpen] = useState(false);
  const notifWrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => (r.ok ? r.json() : null))
      .then(setCurrentUser)
      .catch(() => {});
  }, []);

  useEffect(() => {
    const loadLowStock = () => {
      fetch('/api/materials')
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => data && setLowStockItems(computeLowStockItems(data.materials || [])))
        .catch(() => {});
    };
    loadLowStock();
    const interval = setInterval(loadLowStock, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!notifOpen) return;
    const handler = (e: MouseEvent) => {
      if (notifWrapRef.current && !notifWrapRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [notifOpen]);

  const displayName = currentUser?.name || currentUser?.username || '';

  return (
    <div className="flex items-center justify-between mb-6">
      <h1 className="text-2xl font-bold text-[var(--t-heading)]">{title}</h1>

      <div className="flex items-center gap-4">
        {/* Theme Toggle */}
        <ThemeToggle />

        {/* Notification Bell — low stock Material alert */}
        <div ref={notifWrapRef} className="relative">
          <button
            onClick={() => setNotifOpen((v) => !v)}
            className="relative p-2 rounded-full hover:bg-[var(--surface-2)] transition-colors cursor-pointer"
          >
            <Bell className="w-5 h-5 text-[var(--t-body)]" />
            {lowStockItems.length > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-5 h-5 bg-[var(--danger)] text-white text-[11px] font-bold rounded-full flex items-center justify-center">
                {lowStockItems.length}
              </span>
            )}
          </button>

          {notifOpen && (
            <div className="absolute right-0 top-full mt-2 w-80 max-h-[360px] overflow-y-auto bg-[var(--card)] border border-[var(--bd)] rounded-xl shadow-lg z-50">
              <div className="px-4 py-2.5 border-b border-[var(--bd)]">
                <p className="text-sm font-semibold text-[var(--t-heading)]">Low Stock Material</p>
              </div>
              {lowStockItems.length === 0 ? (
                <p className="px-4 py-6 text-sm text-[var(--t-body)] text-center">Semua stock aman 👍</p>
              ) : (
                <div className="py-1">
                  {lowStockItems.map((item) => (
                    <button
                      key={`${item.materialId}-${item.label}`}
                      onClick={() => { onNavigateToMaterial?.(item.materialId); setNotifOpen(false); }}
                      className="w-full text-left px-4 py-2.5 hover:bg-[var(--surface-2)] transition-colors cursor-pointer"
                    >
                      <p className="text-sm text-[var(--t-heading)] truncate">{item.label}</p>
                      <p className="text-xs text-[var(--danger)]">{item.stock} / {item.minStock}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Language Flag */}
        <button className="px-2 py-1 rounded-md hover:bg-[var(--surface-2)] transition-colors cursor-pointer text-sm text-[var(--t-body)] font-medium">
          🇬🇧 EN
        </button>

        {/* User Profile */}
        <div className="flex items-center gap-2.5 pl-3 border-l border-[var(--bd)]">
          <Avatar className="w-8 h-8">
            <AvatarFallback className="bg-[var(--brand)] text-white text-xs font-semibold">
              {displayName ? getInitials(displayName) : '?'}
            </AvatarFallback>
          </Avatar>
          <span className="text-sm font-medium text-[var(--t-heading)]">{displayName || '...'}</span>
        </div>

        {/* Right Action (either custom or Scan Barcode button) */}
        {rightAction ||
          (onScanBarcode && (
            <Button
              onClick={onScanBarcode}
              className="bg-[var(--brand)] hover:bg-[var(--brand-dark)] text-white rounded-full px-5 h-10 font-medium shadow-sm transition-colors"
            >
              <ScanBarcode className="w-4 h-4 mr-2" />
              Scan Barcode
            </Button>
          ))}
      </div>
    </div>
  );
}
