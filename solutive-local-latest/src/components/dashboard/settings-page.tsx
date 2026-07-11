'use client';

import { Settings, Info } from 'lucide-react';

export function SettingsPage() {
  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-[#2d3436]">Settings</h1>
        <p className="text-sm text-[#4b5563] mt-1">Pengaturan dan konfigurasi sistem</p>
      </div>

      {/* Info Card */}
      <div className="bg-white rounded-xl shadow-sm p-6">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-[#4a6741]/10 flex items-center justify-center flex-shrink-0">
            <Settings className="w-6 h-6 text-[#4a6741]" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-[#2d3436] mb-1">Solutive Inventory System</h2>
            <p className="text-sm text-[#4b5563] leading-relaxed">
              Sistem manajemen inventory dan produksi untuk workspace kamu.
              Kelola printer di menu <strong>3D Printer DB</strong> di sidebar.
            </p>
          </div>
        </div>
      </div>

      {/* Quick Info */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-[#e8e8e8]">
          <h3 className="text-sm font-semibold text-[#2d3436] flex items-center gap-2">
            <Info className="w-4 h-4 text-[#4b5563]" />
            Informasi Sistem
          </h3>
        </div>
        <div className="p-5 space-y-3">
          <div className="flex items-center justify-between py-2 border-b border-[#f0f0f0]">
            <span className="text-sm text-[#4b5563]">Versi</span>
            <span className="text-sm font-medium text-[#2d3436]">1.0.0</span>
          </div>
          <div className="flex items-center justify-between py-2 border-b border-[#f0f0f0]">
            <span className="text-sm text-[#4b5563]">Framework</span>
            <span className="text-sm font-medium text-[#2d3436]">Next.js 16 + Prisma</span>
          </div>
          <div className="flex items-center justify-between py-2 border-b border-[#f0f0f0]">
            <span className="text-sm text-[#4b5563]">Database</span>
            <span className="text-sm font-medium text-[#2d3436]">SQLite</span>
          </div>
          <div className="flex items-center justify-between py-2">
            <span className="text-sm text-[#4b5563]">Theme</span>
            <span className="text-sm font-medium text-[#2d3436]">Light (Default)</span>
          </div>
        </div>
      </div>
    </div>
  );
}
