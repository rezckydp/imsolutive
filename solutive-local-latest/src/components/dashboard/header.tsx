'use client';

import { ScanBarcode, Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';

interface HeaderProps {
  title: string;
  onScanBarcode?: () => void;
  rightAction?: React.ReactNode;
}

export function Header({ title, onScanBarcode, rightAction }: HeaderProps) {
  return (
    <div className="flex items-center justify-between mb-6">
      <h1 className="text-2xl font-bold text-[#2d3436]">{title}</h1>

      <div className="flex items-center gap-4">
        {/* Notification Bell */}
        <button className="relative p-2 rounded-full hover:bg-[#f0f0f0] transition-colors cursor-pointer">
          <Bell className="w-5 h-5 text-[#4b5563]" />
          <span className="absolute -top-0.5 -right-0.5 w-5 h-5 bg-[#dc2626] text-white text-[11px] font-bold rounded-full flex items-center justify-center">
            6
          </span>
        </button>

        {/* Language Flag */}
        <button className="px-2 py-1 rounded-md hover:bg-[#f0f0f0] transition-colors cursor-pointer text-sm text-[#4b5563] font-medium">
          🇬🇧 EN
        </button>

        {/* User Profile */}
        <div className="flex items-center gap-2.5 pl-3 border-l border-[#e8e8e8]">
          <Avatar className="w-8 h-8">
            <AvatarFallback className="bg-[#4a6741] text-white text-xs font-semibold">
              SA
            </AvatarFallback>
          </Avatar>
          <span className="text-sm font-medium text-[#2d3436]">Solutive Admin</span>
        </div>

        {/* Right Action (either custom or Scan Barcode button) */}
        {rightAction ||
          (onScanBarcode && (
            <Button
              onClick={onScanBarcode}
              className="bg-[#4a6741] hover:bg-[#3d5535] text-white rounded-full px-5 h-10 font-medium shadow-sm transition-colors"
            >
              <ScanBarcode className="w-4 h-4 mr-2" />
              Scan Barcode
            </Button>
          ))}
      </div>
    </div>
  );
}
