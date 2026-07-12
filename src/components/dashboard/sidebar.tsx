'use client';

import { useState } from 'react';
import {
  LayoutDashboard,
  Package,
  Inbox,
  ClipboardList,
  Factory,
  Printer,
  Palette,
  Settings,
  LogOut,
  Search,
  ScanBarcode,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  X,
  Database,
  FileCheck,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface SidebarProps {
  activeItem: string;
  onItemClick: (item: string) => void;
  onScanBarcode: () => void;
  collapsed: boolean;
  onToggle: () => void;
  mobileOpen: boolean;
  onMobileClose: () => void;
}

const menuItems = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'stock-management', label: 'Stock Management', icon: Package },
  { id: 'order-lists', label: 'Order Lists', icon: ClipboardList },
  { id: 'production', label: 'Production', icon: Factory },
  { id: 'stock-opname', label: 'Stock Opname', icon: FileCheck },
];

// Group menu: Database with children
const groupMenus = [
  {
    id: 'database',
    label: 'Database',
    icon: Database,
    children: [
      { id: 'printer-database', label: '3D Printer', icon: Printer },
      { id: 'color-variant', label: 'Color Variant', icon: Palette },
    ],
  },
];

const bottomItems = [
  { id: 'settings', label: 'Settings', icon: Settings },
  { id: 'logout', label: 'Logout', icon: LogOut },
];

export function Sidebar({ activeItem, onItemClick, onScanBarcode, collapsed, onToggle, mobileOpen, onMobileClose }: SidebarProps) {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(['database']));

  const handleItemClick = (item: string) => {
    onItemClick(item);
    onMobileClose();
  };

  const handleScan = () => {
    onScanBarcode();
    onMobileClose();
  };

  const toggleGroup = (groupId: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  };

  // Check if a group has any active child
  const isGroupActive = (group: typeof groupMenus[0]) =>
    group.children.some(child => activeItem === child.id);

  return (
    <TooltipProvider delayDuration={0}>
      {/* Mobile overlay backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-40 md:hidden"
          onClick={onMobileClose}
        />
      )}

      <div
        className={`
          fixed left-0 top-0 h-screen bg-white border-r border-[#e8e8e8] flex flex-col z-50 transition-all duration-300 ease-in-out
          ${collapsed ? 'w-[68px]' : 'w-[240px]'}
          ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}
          md:translate-x-0 md:z-50
        `}
      >
        {/* Brand */}
        <div className="flex items-center gap-3 px-4 py-5 h-[68px]">
          <div className="w-9 h-9 rounded-full bg-[#4a6741] flex items-center justify-center flex-shrink-0">
            <Package className="w-5 h-5 text-white" />
          </div>
          {!collapsed && (
            <span className="text-xl font-bold text-[#4a6741] tracking-tight whitespace-nowrap">
              Solutive
            </span>
          )}
          {/* Mobile close button */}
          {mobileOpen && (
            <button
              onClick={onMobileClose}
              className="ml-auto p-1.5 rounded-lg hover:bg-[#f5f6fa] transition-colors cursor-pointer md:hidden"
            >
              <X className="w-5 h-5 text-[#4b5563]" />
            </button>
          )}
        </div>

        {/* Search - only show when expanded */}
        {!collapsed && (
          <div className="px-4 pb-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#4b5563]" />
              <Input
                placeholder="Search..."
                className="pl-9 bg-[#f0f0f0] border-none rounded-full h-9 text-sm focus-visible:ring-1 focus-visible:ring-[#4a6741]/30"
              />
            </div>
          </div>
        )}

        {/* Navigation */}
        <ScrollArea className="flex-1 px-3">
          <div className="space-y-1 py-2">
            {/* Regular menu items */}
            {menuItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeItem === item.id;

              const btn = (
                <button
                  key={item.id}
                  onClick={() => handleItemClick(item.id)}
                  className={`w-full flex items-center gap-3 rounded-lg text-sm font-medium transition-all duration-200 cursor-pointer ${
                    collapsed
                      ? `justify-center px-0 py-2.5 ${isActive ? 'bg-[#4a6741] text-white shadow-sm' : 'text-[#4b5563] hover:bg-[#f5f6fa] hover:text-[#2d3436]'}`
                      : `px-3 py-2.5 ${isActive ? 'bg-[#4a6741] text-white shadow-sm' : 'text-[#4b5563] hover:bg-[#f5f6fa] hover:text-[#2d3436]'}`
                  }`}
                >
                  <Icon className="w-[18px] h-[18px] flex-shrink-0" />
                  {!collapsed && <span>{item.label}</span>}
                </button>
              );

              if (collapsed) {
                return (
                  <Tooltip key={item.id}>
                    <TooltipTrigger asChild>{btn}</TooltipTrigger>
                    <TooltipContent side="right" className="text-xs font-medium">
                      {item.label}
                    </TooltipContent>
                  </Tooltip>
                );
              }
              return btn;
            })}

            {/* Group menus (expandable) */}
            {groupMenus.map((group) => {
              const GroupIcon = group.icon;
              const groupActive = isGroupActive(group);
              const isExpanded = expandedGroups.has(group.id);

              if (collapsed) {
                // When sidebar collapsed, show children directly as flat items
                return (
                  <div key={group.id} className="space-y-1 mt-2 pt-2 border-t border-[#e8e8e8]">
                    {/* Group label when collapsed */}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          onClick={() => toggleGroup(group.id)}
                          className={`w-full flex items-center justify-center px-0 py-2.5 rounded-lg text-[11px] font-medium text-[#6b7280] transition-colors cursor-pointer`}
                        >
                          <GroupIcon className="w-3.5 h-3.5" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="right" className="text-xs font-medium">
                        {group.label}
                      </TooltipContent>
                    </Tooltip>
                    {group.children.map((child) => {
                      const ChildIcon = child.icon;
                      const childActive = activeItem === child.id;

                      return (
                        <Tooltip key={child.id}>
                          <TooltipTrigger asChild>
                            <button
                              onClick={() => handleItemClick(child.id)}
                              className={`w-full flex items-center justify-center px-0 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 cursor-pointer ${
                                childActive
                                  ? 'bg-[#4a6741] text-white shadow-sm'
                                  : 'text-[#4b5563] hover:bg-[#f5f6fa] hover:text-[#2d3436]'
                              }`}
                            >
                              <ChildIcon className="w-[18px] h-[18px] flex-shrink-0" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent side="right" className="text-xs font-medium">
                            {child.label}
                          </TooltipContent>
                        </Tooltip>
                      );
                    })}
                  </div>
                );
              }

              // When sidebar expanded, show group with expandable children
              return (
                <div key={group.id} className="space-y-0.5">
                  {/* Group header */}
                  <button
                    onClick={() => toggleGroup(group.id)}
                    className={`w-full flex items-center gap-3 rounded-lg text-sm font-medium transition-all duration-200 cursor-pointer px-3 py-2.5 ${
                      groupActive
                        ? 'text-[#4a6741]'
                        : 'text-[#4b5563] hover:bg-[#f5f6fa] hover:text-[#2d3436]'
                    }`}
                  >
                    <GroupIcon className="w-[18px] h-[18px] flex-shrink-0" />
                    <span>{group.label}</span>
                    <ChevronDown
                      className={`w-4 h-4 ml-auto transition-transform duration-200 flex-shrink-0 ${
                        isExpanded ? 'rotate-180' : ''
                      }`}
                    />
                  </button>

                  {/* Children */}
                  {isExpanded && (
                    <div className="ml-4 pl-3 border-l-2 border-[#e8e8e8] space-y-0.5">
                      {group.children.map((child) => {
                        const ChildIcon = child.icon;
                        const childActive = activeItem === child.id;

                        return (
                          <button
                            key={child.id}
                            onClick={() => handleItemClick(child.id)}
                            className={`w-full flex items-center gap-2.5 rounded-lg text-[13px] font-medium transition-all duration-200 cursor-pointer px-3 py-2 ${
                              childActive
                                ? 'bg-[#4a6741] text-white shadow-sm'
                                : 'text-[#4b5563] hover:bg-[#f5f6fa] hover:text-[#2d3436]'
                            }`}
                          >
                            <ChildIcon className="w-4 h-4 flex-shrink-0" />
                            <span>{child.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Scan Barcode Button */}
          <div className={collapsed ? 'px-1 py-3' : 'px-1 py-3'}>
            {collapsed ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={handleScan}
                    className="w-full flex items-center justify-center py-2.5 rounded-lg text-[#4b5563] hover:bg-[#f5f6fa] hover:text-[#4a6741] transition-colors cursor-pointer"
                  >
                    <ScanBarcode className="w-[18px] h-[18px]" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right" className="text-xs font-medium">
                  Scan Barcode
                </TooltipContent>
              </Tooltip>
            ) : (
              <Button
                onClick={handleScan}
                variant="outline"
                className="w-full justify-start gap-3 rounded-lg border-[#e8e8e8] text-[#4b5563] hover:bg-[#f5f6fa] hover:text-[#4a6741] hover:border-[#4a6741]/30 text-sm font-medium h-10"
              >
                <ScanBarcode className="w-[18px] h-[18px]" />
                Scan Barcode
              </Button>
            )}
          </div>

          {/* Bottom items */}
          <div className="space-y-1 pt-2 pb-4 border-t border-[#e8e8e8] mt-2">
            {bottomItems.map((item) => {
              const Icon = item.icon;

              const btn = (
                <button
                  key={item.id}
                  onClick={() => handleItemClick(item.id)}
                  className={`w-full flex items-center gap-3 rounded-lg text-sm font-medium text-[#4b5563] hover:bg-[#f5f6fa] hover:text-[#2d3436] transition-all duration-200 cursor-pointer ${
                    collapsed ? 'justify-center px-0 py-2.5' : 'px-3 py-2.5'
                  }`}
                >
                  <Icon className="w-[18px] h-[18px] flex-shrink-0" />
                  {!collapsed && <span>{item.label}</span>}
                </button>
              );

              if (collapsed) {
                return (
                  <Tooltip key={item.id}>
                    <TooltipTrigger asChild>{btn}</TooltipTrigger>
                    <TooltipContent side="right" className="text-xs font-medium">
                      {item.label}
                    </TooltipContent>
                  </Tooltip>
                );
              }
              return btn;
            })}
          </div>
        </ScrollArea>

        {/* Collapse Toggle Button — hidden on mobile */}
        <button
          onClick={onToggle}
          className="absolute -right-3 top-[78px] w-6 h-6 bg-white border border-[#e8e8e8] rounded-full flex items-center justify-center shadow-sm hover:bg-[#f5f6fa] hover:border-[#4a6741]/30 transition-colors cursor-pointer z-[60] hidden md:flex"
        >
          {collapsed ? (
            <ChevronRight className="w-3.5 h-3.5 text-[#4b5563]" />
          ) : (
            <ChevronLeft className="w-3.5 h-3.5 text-[#4b5563]" />
          )}
        </button>
      </div>
    </TooltipProvider>
  );
}
