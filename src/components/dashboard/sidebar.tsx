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
          fixed left-0 top-0 h-screen bg-[var(--card)] border-r border-[var(--bd)] flex flex-col z-50 transition-all duration-300 ease-in-out
          ${collapsed ? 'w-[68px]' : 'w-[240px]'}
          ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}
          md:translate-x-0 md:z-50
        `}
      >
        {/* Brand */}
        <div className="flex items-center gap-3 px-4 py-5 h-[68px]">
          <div className="w-9 h-9 rounded-full bg-[var(--brand)] flex items-center justify-center flex-shrink-0">
            <Package className="w-5 h-5 text-white" />
          </div>
          {!collapsed && (
            <span className="text-xl font-bold text-[var(--brand)] tracking-tight whitespace-nowrap">
              Solutive
            </span>
          )}
          {/* Mobile close button */}
          {mobileOpen && (
            <button
              onClick={onMobileClose}
              className="ml-auto p-1.5 rounded-lg hover:bg-[var(--surface)] transition-colors cursor-pointer md:hidden"
            >
              <X className="w-5 h-5 text-[var(--t-body)]" />
            </button>
          )}
        </div>

        {/* Search - only show when expanded */}
        {!collapsed && (
          <div className="px-4 pb-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--t-body)]" />
              <Input
                placeholder="Search..."
                className="pl-9 bg-[var(--surface-2)] border-none rounded-full h-9 text-sm focus-visible:ring-1 focus-visible:ring-[var(--brand)]/30"
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
                      ? `justify-center px-0 py-2.5 ${isActive ? 'bg-[var(--brand)] text-white shadow-sm' : 'text-[var(--t-body)] hover:bg-[var(--surface)] hover:text-[var(--t-heading)]'}`
                      : `px-3 py-2.5 ${isActive ? 'bg-[var(--brand)] text-white shadow-sm' : 'text-[var(--t-body)] hover:bg-[var(--surface)] hover:text-[var(--t-heading)]'}`
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
                  <div key={group.id} className="space-y-1 mt-2 pt-2 border-t border-[var(--bd)]">
                    {/* Group label when collapsed */}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          onClick={() => toggleGroup(group.id)}
                          className={`w-full flex items-center justify-center px-0 py-2.5 rounded-lg text-[11px] font-medium text-[var(--t-muted)] transition-colors cursor-pointer`}
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
                                  ? 'bg-[var(--brand)] text-white shadow-sm'
                                  : 'text-[var(--t-body)] hover:bg-[var(--surface)] hover:text-[var(--t-heading)]'
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
                        ? 'text-[var(--brand)]'
                        : 'text-[var(--t-body)] hover:bg-[var(--surface)] hover:text-[var(--t-heading)]'
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
                    <div className="ml-4 pl-3 border-l-2 border-[var(--bd)] space-y-0.5">
                      {group.children.map((child) => {
                        const ChildIcon = child.icon;
                        const childActive = activeItem === child.id;

                        return (
                          <button
                            key={child.id}
                            onClick={() => handleItemClick(child.id)}
                            className={`w-full flex items-center gap-2.5 rounded-lg text-[13px] font-medium transition-all duration-200 cursor-pointer px-3 py-2 ${
                              childActive
                                ? 'bg-[var(--brand)] text-white shadow-sm'
                                : 'text-[var(--t-body)] hover:bg-[var(--surface)] hover:text-[var(--t-heading)]'
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
                    className="w-full flex items-center justify-center py-2.5 rounded-lg text-[var(--t-body)] hover:bg-[var(--surface)] hover:text-[var(--brand)] transition-colors cursor-pointer"
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
                className="w-full justify-start gap-3 rounded-lg border-[var(--bd)] text-[var(--t-body)] hover:bg-[var(--surface)] hover:text-[var(--brand)] hover:border-[var(--brand)]/30 text-sm font-medium h-10"
              >
                <ScanBarcode className="w-[18px] h-[18px]" />
                Scan Barcode
              </Button>
            )}
          </div>

          {/* Bottom items */}
          <div className="space-y-1 pt-2 pb-4 border-t border-[var(--bd)] mt-2">
            {bottomItems.map((item) => {
              const Icon = item.icon;

              const btn = (
                <button
                  key={item.id}
                  onClick={() => handleItemClick(item.id)}
                  className={`w-full flex items-center gap-3 rounded-lg text-sm font-medium text-[var(--t-body)] hover:bg-[var(--surface)] hover:text-[var(--t-heading)] transition-all duration-200 cursor-pointer ${
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
          className="absolute -right-3 top-[78px] w-6 h-6 bg-[var(--card)] border border-[var(--bd)] rounded-full flex items-center justify-center shadow-sm hover:bg-[var(--surface)] hover:border-[var(--brand)]/30 transition-colors cursor-pointer z-[60] hidden md:flex"
        >
          {collapsed ? (
            <ChevronRight className="w-3.5 h-3.5 text-[var(--t-body)]" />
          ) : (
            <ChevronLeft className="w-3.5 h-3.5 text-[var(--t-body)]" />
          )}
        </button>
      </div>
    </TooltipProvider>
  );
}
