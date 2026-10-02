'use client';

import { useState, useEffect } from 'react';
import { ScanBarcode, Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { ThemeToggle } from '@/components/dashboard/theme-toggle';

interface HeaderProps {
  title: string;
  onScanBarcode?: () => void;
  rightAction?: React.ReactNode;
}

interface CurrentUser {
  username: string;
  name: string;
  role: 'ADMIN' | 'STAFF';
}

function getInitials(label: string): string {
  const parts = label.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export function Header({ title, onScanBarcode, rightAction }: HeaderProps) {
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);

  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => (r.ok ? r.json() : null))
      .then(setCurrentUser)
      .catch(() => {});
  }, []);

  const displayName = currentUser?.name || currentUser?.username || '';

  return (
    <div className="flex items-center justify-between mb-6">
      <h1 className="text-2xl font-bold text-[var(--t-heading)]">{title}</h1>

      <div className="flex items-center gap-4">
        {/* Theme Toggle */}
        <ThemeToggle />

        {/* Notification Bell */}
        <button className="relative p-2 rounded-full hover:bg-[var(--surface-2)] transition-colors cursor-pointer">
          <Bell className="w-5 h-5 text-[var(--t-body)]" />
          <span className="absolute -top-0.5 -right-0.5 w-5 h-5 bg-[var(--danger)] text-white text-[11px] font-bold rounded-full flex items-center justify-center">
            6
          </span>
        </button>

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
