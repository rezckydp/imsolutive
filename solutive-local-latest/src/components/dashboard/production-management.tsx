'use client';

import { useState, useEffect, useCallback } from 'react';
import { Plus, Search, Factory, CheckCircle2, Clock, Pencil, Trash2, RotateCcw, X } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
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

interface Variant {
  id: string;
  color: string;
  colorHex: string;
  type: string;
  qty: number;
  product: {
    id: string;
    sku: string;
    name: string;
  };
}

interface Product {
  id: string;
  sku: string;
  name: string;
  variants: Variant[];
}

interface ProductionItemFull {
  id: string;
  variantId: string;
  qty: number;
  assignedTo: string;
  status: string;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  variant: Variant;
}

interface PrinterOption {
  id: string;
  name: string;
  status: string;
}

interface AddProductionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  products: Product[];
  printers: PrinterOption[];
  onCreated: () => void;
}

function AddProductionDialog({ open, onOpenChange, products, printers, onCreated }: AddProductionDialogProps) {
  const [selectedProductId, setSelectedProductId] = useState<string>('');
  const [selectedVariantId, setSelectedVariantId] = useState<string>('');
  const [qty, setQty] = useState<number>(1);
  const [assignedTo, setAssignedTo] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);

  const selectedProduct = products.find((p) => p.id === selectedProductId);

  useEffect(() => {
    if (!open) {
      setSelectedProductId('');
      setSelectedVariantId('');
      setQty(1);
      setAssignedTo('');
    }
  }, [open]);

  useEffect(() => {
    if (selectedProduct && selectedProduct.variants.length > 0) {
      setSelectedVariantId(selectedProduct.variants[0].id);
    } else {
      setSelectedVariantId('');
    }
  }, [selectedProduct]);

  const handleSubmit = async () => {
    if (!selectedVariantId) {
      toast.error('Please select a product variant');
      return;
    }
    if (!qty || qty <= 0) {
      toast.error('Quantity must be greater than 0');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/production', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          variantId: selectedVariantId,
          qty: Number(qty),
          assignedTo,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to create');
      }
      toast.success('Production item added successfully!');
      onOpenChange(false);
      onCreated();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create production item');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px] rounded-xl">
        <DialogHeader>
          <DialogTitle className="text-[#2d3436]">Add Production Item</DialogTitle>
          <DialogDescription>
            Record a new production task. Stock will increase when marked as completed.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Product Select */}
          <div className="space-y-2">
            <Label className="text-sm font-medium text-[#2d3436]">Product</Label>
            <Select value={selectedProductId} onValueChange={setSelectedProductId}>
              <SelectTrigger className="rounded-lg">
                <SelectValue placeholder="Select product..." />
              </SelectTrigger>
              <SelectContent>
                {products.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    <span className="font-semibold text-[#4a6741]">{p.sku}</span> — {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Variant Select */}
          {selectedProduct && selectedProduct.variants.length > 0 && (
            <div className="space-y-2">
              <Label className="text-sm font-medium text-[#2d3436]">Color Variant</Label>
              <Select value={selectedVariantId} onValueChange={setSelectedVariantId}>
                <SelectTrigger className="rounded-lg">
                  <SelectValue placeholder="Select variant..." />
                </SelectTrigger>
                <SelectContent>
                  {selectedProduct.variants.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      <div className="flex items-center gap-2">
                        <span
                          className="w-3 h-3 rounded-full flex-shrink-0 border border-gray-300"
                          style={{ backgroundColor: v.colorHex }}
                        />
                        <span>{v.color}{v.type ? ` - ${v.type}` : ''}</span>
                        <span className="text-xs text-[#6b7280]">(stock: {v.qty})</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Quantity */}
          <div className="space-y-2">
            <Label className="text-sm font-medium text-[#2d3436]">Quantity</Label>
            <Input
              type="number"
              min={1}
              value={qty}
              onChange={(e) => setQty(Number(e.target.value) || 1)}
              className="rounded-lg"
              placeholder="Enter quantity"
            />
          </div>

          {/* Assigned To (Printer) */}
          <div className="space-y-2">
            <Label className="text-sm font-medium text-[#2d3436]">Printer</Label>
            {printers.length > 0 ? (
              <Select value={assignedTo} onValueChange={setAssignedTo}>
                <SelectTrigger className="rounded-lg">
                  <SelectValue placeholder="Select printer..." />
                </SelectTrigger>
                <SelectContent>
                  {printers
                    .filter((p) => p.status === 'Working')
                    .map((p) => (
                      <SelectItem key={p.id} value={p.name}>
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-[#15803d] flex-shrink-0" />
                          {p.name}
                        </div>
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            ) : (
              <Input
                value={assignedTo}
                onChange={(e) => setAssignedTo(e.target.value)}
                className="rounded-lg"
                placeholder="No printers configured yet"
              />
            )}
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="rounded-lg border-[#e8e8e8] text-[#4b5563]"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={submitting || !selectedVariantId}
            className="rounded-lg bg-[#4a6741] hover:bg-[#3d5535] text-white"
          >
            {submitting ? 'Adding...' : 'Add Production'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
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

export function ProductionManagement() {
  const [items, setItems] = useState<ProductionItemFull[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [printers, setPrinters] = useState<PrinterOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [addOpen, setAddOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editingItem, setEditingItem] = useState<ProductionItemFull | null>(null);

  const fetchItems = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [itemsRes, productsRes, printersRes] = await Promise.all([
        fetch('/api/production'),
        fetch('/api/products?limit=200'),
        fetch('/api/printers'),
      ]);
      if (!itemsRes.ok || !productsRes.ok || !printersRes.ok) throw new Error('Failed to fetch');
      const itemsData = await itemsRes.json();
      const productsData = await productsRes.json();
      const printersData = await printersRes.json();
      setItems(itemsData);
      // Products API returns { products: [...], total, page, limit }
      setProducts(productsData.products || productsData);
      setPrinters(printersData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  // Filter items
  const filteredItems = items.filter((item) => {
    const matchSearch =
      search === '' ||
      item.variant.product.sku.toLowerCase().includes(search.toLowerCase()) ||
      item.variant.product.name.toLowerCase().includes(search.toLowerCase()) ||
      item.variant.color.toLowerCase().includes(search.toLowerCase()) ||
      item.variant.type.toLowerCase().includes(search.toLowerCase()) ||
      item.assignedTo.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === 'all' || item.status === statusFilter;
    return matchSearch && matchStatus;
  });

  // Stats
  const inProgressCount = items.filter((i) => i.status === 'In Progress').length;
  const completedCount = items.filter((i) => i.status === 'Completed').length;

  // Complete production item
  const handleComplete = async (id: string) => {
    try {
      const res = await fetch(`/api/production/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'Completed' }),
      });
      if (!res.ok) throw new Error('Failed to update');
      toast.success('Production completed! Stock has been updated.');
      fetchItems();
    } catch (err) {
      toast.error('Failed to complete production');
    }
  };

  // Revert to In Progress
  const handleRevert = async (id: string) => {
    try {
      const res = await fetch(`/api/production/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'In Progress' }),
      });
      if (!res.ok) throw new Error('Failed to update');
      toast.success('Production reverted to In Progress. Stock has been adjusted.');
      fetchItems();
    } catch (err) {
      toast.error('Failed to revert production');
    }
  };

  // Delete
  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      const res = await fetch(`/api/production/${deleteId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete');
      toast.success('Production item deleted.');
      fetchItems();
    } catch (err) {
      toast.error('Failed to delete production item');
    } finally {
      setDeleteId(null);
    }
  };

  // Edit
  const handleEditSave = async () => {
    if (!editingItem) return;
    try {
      const res = await fetch(`/api/production/${editingItem.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          qty: editingItem.qty,
          assignedTo: editingItem.assignedTo,
        }),
      });
      if (!res.ok) throw new Error('Failed to update');
      toast.success('Production item updated.');
      setEditingItem(null);
      fetchItems();
    } catch (err) {
      toast.error('Failed to update production item');
    }
  };

  const formatDate = (isoString: string) => {
    const d = new Date(isoString);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${months[d.getMonth()]} ${d.getDate().toString().padStart(2, '0')}, ${d.getFullYear()}`;
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#2d3436]">Production Management</h1>
          <p className="text-sm text-[#4b5563] mt-1">
            Track production tasks and add stock when completed
          </p>
        </div>
        <Button
          onClick={() => setAddOpen(true)}
          className="rounded-lg bg-[#4a6741] hover:bg-[#3d5535] text-white gap-2"
        >
          <Plus className="w-4 h-4" />
          Add Production
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="rounded-xl shadow-sm border-0">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-[#4a6741]/10 flex items-center justify-center flex-shrink-0">
              <Factory className="w-5 h-5 text-[#4a6741]" />
            </div>
            <div>
              <p className="text-xs text-[#4b5563] font-medium">Total Items</p>
              <p className="text-xl font-bold text-[#2d3436]">{items.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="rounded-xl shadow-sm border-0">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-[#d97706]/10 flex items-center justify-center flex-shrink-0">
              <Clock className="w-5 h-5 text-[#d97706]" />
            </div>
            <div>
              <p className="text-xs text-[#4b5563] font-medium">In Progress</p>
              <p className="text-xl font-bold text-[#d97706]">{inProgressCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="rounded-xl shadow-sm border-0">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-[#15803d]/10 flex items-center justify-center flex-shrink-0">
              <CheckCircle2 className="w-5 h-5 text-[#15803d]" />
            </div>
            <div>
              <p className="text-xs text-[#4b5563] font-medium">Completed</p>
              <p className="text-xl font-bold text-[#15803d]">{completedCount}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search & Filters */}
      <Card className="rounded-xl shadow-sm border-0">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#4b5563]" />
              <Input
                placeholder="Search by SKU, name, color, assigned to..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 rounded-lg bg-[#f5f6fa] border-[#e8e8e8] text-sm"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-[180px] rounded-lg">
                <SelectValue placeholder="Filter status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="In Progress">In Progress</SelectItem>
                <SelectItem value="Completed">Completed</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Main Table */}
      <Card className="rounded-xl shadow-sm border-0">
        <CardContent className="p-0">
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
                  ) : error ? (
                    <tr>
                      <td colSpan={7} className="text-center py-10">
                        <div className="flex flex-col items-center gap-3">
                          <div className="w-12 h-12 rounded-full bg-[#dc2626]/10 flex items-center justify-center">
                            <X className="w-6 h-6 text-[#dc2626]" />
                          </div>
                          <p className="text-sm text-[#4b5563]">{error}</p>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={fetchItems}
                            className="rounded-lg border-[#e8e8e8] text-[#4b5563]"
                          >
                            Retry
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ) : filteredItems.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center py-10">
                        <div className="flex flex-col items-center gap-3">
                          <div className="w-12 h-12 rounded-full bg-[#f5f6fa] flex items-center justify-center">
                            <Factory className="w-6 h-6 text-[#6b7280]" />
                          </div>
                          <p className="text-sm text-[#4b5563]">
                            {items.length === 0
                              ? 'No production items yet. Click "Add Production" to start.'
                              : 'No items match your search.'}
                          </p>
                          {items.length === 0 && (
                            <Button
                              onClick={() => setAddOpen(true)}
                              size="sm"
                              className="rounded-lg bg-[#4a6741] hover:bg-[#3d5535] text-white"
                            >
                              <Plus className="w-4 h-4 mr-1" />
                              Add Production
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filteredItems.map((item) => (
                      <tr
                        key={item.id}
                        className="border-t border-[#f0f0f0] hover:bg-[#fafafa] transition-colors"
                      >
                        <td className="py-3 px-4">
                          <span className="text-sm font-semibold text-[#4a6741] bg-[#f0f0f0] px-1.5 py-0.5 rounded">
                            {item.variant.product.sku}
                          </span>
                          <p className="text-[11px] text-[#6b7280] mt-0.5 truncate max-w-[120px]">
                            {item.variant.product.name}
                          </p>
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            <span
                              className="w-3 h-3 rounded-full flex-shrink-0 border border-gray-300"
                              style={{ backgroundColor: item.variant.colorHex }}
                            />
                            <span className="text-sm text-[#4b5563]">{item.variant.color}{item.variant.type ? ` - ${item.variant.type}` : ''}</span>
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
                                  title="Mark as Completed"
                                  className="w-8 h-8 rounded-lg flex items-center justify-center text-[#15803d] hover:bg-[#15803d]/10 transition-colors cursor-pointer"
                                >
                                  <CheckCircle2 className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => setEditingItem(item)}
                                  title="Edit"
                                  className="w-8 h-8 rounded-lg flex items-center justify-center text-[#4b5563] hover:bg-[#f5f6fa] transition-colors cursor-pointer"
                                >
                                  <Pencil className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => setDeleteId(item.id)}
                                  title="Delete"
                                  className="w-8 h-8 rounded-lg flex items-center justify-center text-[#dc2626] hover:bg-[#dc2626]/10 transition-colors cursor-pointer"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  onClick={() => handleRevert(item.id)}
                                  title="Revert to In Progress"
                                  className="w-8 h-8 rounded-lg flex items-center justify-center text-[#d97706] hover:bg-[#d97706]/10 transition-colors cursor-pointer"
                                >
                                  <RotateCcw className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => setDeleteId(item.id)}
                                  title="Delete"
                                  className="w-8 h-8 rounded-lg flex items-center justify-center text-[#dc2626] hover:bg-[#dc2626]/10 transition-colors cursor-pointer"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Add Dialog */}
      <AddProductionDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        products={products}
        printers={printers}
        onCreated={fetchItems}
      />

      {/* Edit Dialog */}
      <Dialog open={!!editingItem} onOpenChange={() => setEditingItem(null)}>
        <DialogContent className="sm:max-w-[400px] rounded-xl">
          <DialogHeader>
            <DialogTitle className="text-[#2d3436]">Edit Production Item</DialogTitle>
            <DialogDescription>
              <span className="font-semibold text-[#4a6741]">
                {editingItem?.variant.product.sku}
              </span>
              {' — '}
              {editingItem?.variant.color}{editingItem?.variant.type ? ` - ${editingItem?.variant.type}` : ''}
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
                  onChange={(e) =>
                    setEditingItem({ ...editingItem, qty: Number(e.target.value) || 1 })
                  }
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
                    onChange={(e) =>
                      setEditingItem({ ...editingItem, assignedTo: e.target.value })
                    }
                    className="rounded-lg"
                    placeholder="No printers configured yet"
                  />
                )}
              </div>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setEditingItem(null)}
              className="rounded-lg border-[#e8e8e8] text-[#4b5563]"
            >
              Cancel
            </Button>
            <Button
              onClick={handleEditSave}
              className="rounded-lg bg-[#4a6741] hover:bg-[#3d5535] text-white"
            >
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
              Are you sure? If this production was already completed, the stock that was added will
              be removed from inventory.
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
    </div>
  );
}
