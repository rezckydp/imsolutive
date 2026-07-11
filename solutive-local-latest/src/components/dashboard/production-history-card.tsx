'use client';

import { useState, useEffect } from 'react';
import { CheckCircle2, Clock, Eye, Pencil, Trash2, RotateCcw, X, ChevronDown, ChevronUp } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

export interface ProductionHistoryItem {
  id: string;
  variantId: string;
  sku: string;
  name: string;
  color: string;
  colorHex: string;
  type: string;
  qty: number;
  assignedTo: string;
  status: string;
  completedAt: string | null;
  createdAt: string;
}

interface ProductionHistoryCardProps {
  items?: ProductionHistoryItem[];
  loading?: boolean;
  onDataChange?: () => void;
}

function TableSkeleton() {
  return (
    <tr className="border-t border-[#f0f0f0]">
      <td className="py-3 px-4"><Skeleton className="h-4 w-24" /></td>
      <td className="py-3 px-4"><Skeleton className="h-4 w-20" /></td>
      <td className="py-3 px-4 text-right"><Skeleton className="h-4 w-8 ml-auto" /></td>
      <td className="py-3 px-4"><Skeleton className="h-5 w-24 rounded-full" /></td>
      <td className="py-3 px-4"><Skeleton className="h-4 w-16" /></td>
      <td className="py-3 px-4"><Skeleton className="h-4 w-16" /></td>
      <td className="py-3 px-4"><Skeleton className="h-8 w-20" /></td>
    </tr>
  );
}

function formatDate(isoString: string) {
  const d = new Date(isoString);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[d.getMonth()]} ${d.getDate().toString().padStart(2, '0')}, ${d.getFullYear()}`;
}

export function ProductionHistoryCard({ items = [], loading = false, onDataChange }: ProductionHistoryCardProps) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [expanded, setExpanded] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editingItem, setEditingItem] = useState<ProductionHistoryItem | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [printers, setPrinters] = useState<Array<{ id: string; name: string; status: string }>>([]);

  useEffect(() => {
    fetch('/api/printers')
      .then((res) => res.ok ? res.json() : [])
      .then(setPrinters)
      .catch(() => {});
  }, []);

  const filteredItems = items.filter((item) => {
    const matchSearch =
      search === '' ||
      item.sku.toLowerCase().includes(search.toLowerCase()) ||
      item.name.toLowerCase().includes(search.toLowerCase()) ||
      item.color.toLowerCase().includes(search.toLowerCase()) ||
      item.type.toLowerCase().includes(search.toLowerCase()) ||
      item.assignedTo.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === 'all' || item.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const displayItems = expanded ? filteredItems : filteredItems.slice(0, 5);
  const hasMore = filteredItems.length > 5;

  const handleComplete = async (id: string) => {
    setActionLoading(id);
    try {
      const res = await fetch(`/api/production/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'Completed' }),
      });
      if (!res.ok) throw new Error('Failed');
      toast.success('Production completed! Stock updated.');
      onDataChange?.();
    } catch {
      toast.error('Failed to complete production');
    } finally {
      setActionLoading(null);
    }
  };

  const handleRevert = async (id: string) => {
    setActionLoading(id);
    try {
      const res = await fetch(`/api/production/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'In Progress' }),
      });
      if (!res.ok) throw new Error('Failed');
      toast.success('Reverted to In Progress.');
      onDataChange?.();
    } catch {
      toast.error('Failed to revert');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    setActionLoading(deleteId);
    try {
      const res = await fetch(`/api/production/${deleteId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed');
      toast.success('Production item deleted.');
      setDeleteId(null);
      onDataChange?.();
    } catch {
      toast.error('Failed to delete');
    } finally {
      setActionLoading(null);
    }
  };

  const handleEditSave = async () => {
    if (!editingItem) return;
    setActionLoading(editingItem.id);
    try {
      const res = await fetch(`/api/production/${editingItem.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          qty: editingItem.qty,
          assignedTo: editingItem.assignedTo,
        }),
      });
      if (!res.ok) throw new Error('Failed');
      toast.success('Production item updated.');
      setEditingItem(null);
      onDataChange?.();
    } catch {
      toast.error('Failed to update');
    } finally {
      setActionLoading(null);
    }
  };

  // Stats
  const inProgressCount = items.filter((i) => i.status === 'In Progress').length;
  const completedCount = items.filter((i) => i.status === 'Completed').length;

  return (
    <>
      <Card className="rounded-xl shadow-sm border-0">
        <CardHeader className="pb-3 px-4 pt-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-3">
              <CardTitle className="text-sm font-semibold text-[#2d3436]">Production History</CardTitle>
              <div className="flex items-center gap-2">
                <Badge className="text-[11px] px-2 py-0 rounded-full bg-[#d97706]/10 text-[#d97706] border-[#d97706]/30 gap-1" variant="outline">
                  <Clock className="w-2.5 h-2.5" />
                  {inProgressCount} Active
                </Badge>
                <Badge className="text-[11px] px-2 py-0 rounded-full bg-[#15803d]/10 text-[#15803d] border-[#15803d]/30 gap-1" variant="outline">
                  <CheckCircle2 className="w-2.5 h-2.5" />
                  {completedCount} Done
                </Badge>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#6b7280]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <Input
                  placeholder="Search..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-8 h-8 text-xs rounded-lg bg-[#f5f6fa] border-[#e8e8e8] w-[160px]"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="h-8 text-xs rounded-lg w-[120px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="In Progress">In Progress</SelectItem>
                  <SelectItem value="Completed">Completed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="px-4 pb-4 pt-0">
          <div className="rounded-xl border border-[#e8e8e8] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-[#f5f6fa]">
                    <th className="text-left text-xs font-medium text-[#4b5563] py-3 px-4">Product</th>
                    <th className="text-left text-xs font-medium text-[#4b5563] py-3 px-4">Color</th>
                    <th className="text-right text-xs font-medium text-[#4b5563] py-3 px-4">Qty</th>
                    <th className="text-left text-xs font-medium text-[#4b5563] py-3 px-4">Status</th>
                    <th className="text-left text-xs font-medium text-[#4b5563] py-3 px-4">Printer</th>
                    <th className="text-left text-xs font-medium text-[#4b5563] py-3 px-4">Date</th>
                    <th className="text-right text-xs font-medium text-[#4b5563] py-3 px-4">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <>
                      <TableSkeleton />
                      <TableSkeleton />
                      <TableSkeleton />
                      <TableSkeleton />
                      <TableSkeleton />
                    </>
                  ) : filteredItems.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center py-10">
                        <div className="flex flex-col items-center gap-3">
                          <div className="w-12 h-12 rounded-full bg-[#f5f6fa] flex items-center justify-center">
                            <svg className="w-6 h-6 text-[#6b7280]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h6a2 2 0 012 2m-6 9l2 2 4-4" />
                            </svg>
                          </div>
                          <p className="text-sm text-[#4b5563]">No production history yet</p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    <>
                      {displayItems.map((item) => (
                        <tr
                          key={item.id}
                          className="border-t border-[#f0f0f0] hover:bg-[#fafafa] transition-colors"
                        >
                          <td className="py-3 px-4">
                            <span className="text-sm font-semibold text-[#4a6741] bg-[#f0f0f0] px-1.5 py-0.5 rounded">
                              {item.sku}
                            </span>
                            <p className="text-[11px] text-[#6b7280] mt-0.5 truncate max-w-[120px]">{item.name}</p>
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2">
                              <span
                                className="w-3 h-3 rounded-full flex-shrink-0 border border-gray-300"
                                style={{ backgroundColor: item.colorHex }}
                              />
                              <span className="text-sm text-[#4b5563]">{item.color}{item.type ? ` - ${item.type}` : ''}</span>
                            </div>
                          </td>
                          <td className="py-3 px-4 text-right text-sm text-[#2d3436] font-medium">
                            {item.qty}
                          </td>
                          <td className="py-3 px-4">
                            <Badge
                              className={`text-[11px] px-2 py-0.5 rounded-full font-semibold gap-1 ${
                                item.status === 'Completed'
                                  ? 'bg-[#15803d]/10 text-[#15803d] border-[#15803d]/30'
                                  : 'bg-[#d97706]/10 text-[#d97706] border-[#d97706]/30'
                              }`}
                              variant="outline"
                            >
                              {item.status === 'Completed' ? (
                                <CheckCircle2 className="w-2.5 h-2.5" />
                              ) : (
                                <Clock className="w-2.5 h-2.5" />
                              )}
                              {item.status}
                            </Badge>
                          </td>
                          <td className="py-3 px-4">
                            {item.assignedTo ? (
                              <span className="text-xs text-[#2d3436] bg-[#f5f6fa] px-2 py-1 rounded-full">
                                {item.assignedTo}
                              </span>
                            ) : (
                              <span className="text-xs text-[#6b7280]">—</span>
                            )}
                          </td>
                          <td className="py-3 px-4">
                            <span className="text-xs text-[#6b7280]">
                              {formatDate(item.createdAt)}
                            </span>
                            {item.completedAt && (
                              <p className="text-[11px] text-[#15803d] mt-0.5">
                                ✓ {formatDate(item.completedAt)}
                              </p>
                            )}
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex items-center justify-end gap-1">
                              {item.status === 'In Progress' ? (
                                <>
                                  <button
                                    onClick={() => handleComplete(item.id)}
                                    disabled={!!actionLoading}
                                    title="Mark as Completed"
                                    className="w-7 h-7 rounded-lg flex items-center justify-center text-[#15803d] hover:bg-[#15803d]/10 transition-colors cursor-pointer disabled:opacity-50"
                                  >
                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={() => setEditingItem(item)}
                                    title="Edit"
                                    className="w-7 h-7 rounded-lg flex items-center justify-center text-[#4b5563] hover:bg-[#f5f6fa] transition-colors cursor-pointer"
                                  >
                                    <Pencil className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={() => setDeleteId(item.id)}
                                    title="Delete"
                                    className="w-7 h-7 rounded-lg flex items-center justify-center text-[#dc2626] hover:bg-[#dc2626]/10 transition-colors cursor-pointer"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </>
                              ) : (
                                <>
                                  <button
                                    onClick={() => handleRevert(item.id)}
                                    disabled={!!actionLoading}
                                    title="Revert to In Progress"
                                    className="w-7 h-7 rounded-lg flex items-center justify-center text-[#d97706] hover:bg-[#d97706]/10 transition-colors cursor-pointer disabled:opacity-50"
                                  >
                                    <RotateCcw className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={() => setDeleteId(item.id)}
                                    title="Delete"
                                    className="w-7 h-7 rounded-lg flex items-center justify-center text-[#dc2626] hover:bg-[#dc2626]/10 transition-colors cursor-pointer"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}

                      {/* Show More / Less Row */}
                      {hasMore && (
                        <tr>
                          <td colSpan={7} className="py-2">
                            <button
                              onClick={() => setExpanded(!expanded)}
                              className="w-full text-center text-xs text-[#4a6741] font-medium hover:text-[#3d5535] py-1 transition-colors cursor-pointer flex items-center justify-center gap-1"
                            >
                              {expanded ? (
                                <>
                                  Show Less <ChevronUp className="w-3 h-3" />
                                </>
                              ) : (
                                <>
                                  Show More ({filteredItems.length - 5} more) <ChevronDown className="w-3 h-3" />
                                </>
                              )}
                            </button>
                          </td>
                        </tr>
                      )}
                    </>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={!!editingItem} onOpenChange={() => setEditingItem(null)}>
        <DialogContent className="sm:max-w-[400px] rounded-xl">
          <DialogHeader>
            <DialogTitle className="text-[#2d3436]">Edit Production Item</DialogTitle>
            <DialogDescription>
              <span className="font-semibold text-[#4a6741]">{editingItem?.sku}</span>
              {' — '}
              {editingItem?.color}{editingItem?.type ? ` - ${editingItem?.type}` : ''}
            </DialogDescription>
          </DialogHeader>
          {editingItem && (
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label className="text-sm font-medium text-[#2d3436]">Quantity</Label>
                <Input
                  type="number"
                  min={1}
                  value={editingItem.qty}
                  onChange={(e) => setEditingItem({ ...editingItem, qty: Number(e.target.value) || 1 })}
                  className="rounded-lg"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium text-[#2d3436]">Printer</Label>
                {printers.length > 0 ? (
                  <Select value={editingItem.assignedTo} onValueChange={(val) =>
                    setEditingItem({ ...editingItem, assignedTo: val })
                  }>
                    <SelectTrigger className="rounded-lg">
                      <SelectValue placeholder="Select printer..." />
                    </SelectTrigger>
                    <SelectContent>
                      {printers.map((p) => (
                        <SelectItem key={p.id} value={p.name}>
                          <div className="flex items-center gap-2">
                            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${p.status === 'Working' ? 'bg-[#15803d]' : 'bg-[#d97706]'}`} />
                            {p.name}
                            <span className="text-[11px] text-[#6b7280]">({p.status})</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    value={editingItem.assignedTo}
                    onChange={(e) => setEditingItem({ ...editingItem, assignedTo: e.target.value })}
                    className="rounded-lg"
                    placeholder="No printers configured yet"
                  />
                )}
              </div>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setEditingItem(null)} className="rounded-lg border-[#e8e8e8] text-[#4b5563]">
              Cancel
            </Button>
            <Button onClick={handleEditSave} className="rounded-lg bg-[#4a6741] hover:bg-[#3d5535] text-white">
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent className="rounded-xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Production Item</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure? If this production was already completed, the stock that was added will be removed from inventory.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-lg">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="rounded-lg bg-[#dc2626] hover:bg-[#b91c1c] text-white"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
