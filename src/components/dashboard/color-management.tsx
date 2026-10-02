'use client';

import { useState, useEffect, useCallback } from 'react';
import { Plus, Pencil, Trash2, Search, Loader2, Eye, EyeOff, GripVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

interface ColorData {
  id: string;
  name: string;
  hexCode: string;
  status: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export function ColorManagement() {
  const [colors, setColors] = useState<ColorData[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editColor, setEditColor] = useState<ColorData | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ColorData | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Form state
  const [formName, setFormName] = useState('');
  const [formHexCode, setFormHexCode] = useState('#636e72');
  const [formStatus, setFormStatus] = useState('Active');
  const [formSortOrder, setFormSortOrder] = useState(0);

  const fetchColors = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/colors');
      if (res.ok) {
        const data = await res.json();
        setColors(data);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchColors();
  }, [fetchColors]);

  // Filter colors
  const filteredColors = colors.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.hexCode.toLowerCase().includes(search.toLowerCase())
  );

  const resetForm = () => {
    setFormName('');
    setFormHexCode('#636e72');
    setFormStatus('Active');
    setFormSortOrder(colors.length > 0 ? Math.max(...colors.map(c => c.sortOrder)) + 1 : 1);
  };

  const openAddDialog = () => {
    resetForm();
    setShowAddDialog(true);
  };

  const openEditDialog = (color: ColorData) => {
    setFormName(color.name);
    setFormHexCode(color.hexCode);
    setFormStatus(color.status);
    setFormSortOrder(color.sortOrder);
    setEditColor(color);
  };

  const handleCreate = async () => {
    if (!formName.trim()) return;
    setSaving(true);
    try {
      const res = await fetch('/api/colors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formName.trim(),
          hexCode: formHexCode,
          status: formStatus,
          sortOrder: formSortOrder,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || 'Failed to create color');
        return;
      }
      setShowAddDialog(false);
      fetchColors();
    } catch {
      alert('Failed to create color');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async () => {
    if (!editColor || !formName.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/colors/${editColor.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formName.trim(),
          hexCode: formHexCode,
          status: formStatus,
          sortOrder: formSortOrder,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || 'Failed to update color');
        return;
      }
      setEditColor(null);
      fetchColors();
    } catch {
      alert('Failed to update color');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/colors/${deleteTarget.id}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || 'Failed to delete color');
        return;
      }
      setDeleteTarget(null);
      fetchColors();
    } catch {
      alert('Failed to delete color');
    } finally {
      setDeleting(false);
    }
  };

  const handleToggleStatus = async (color: ColorData) => {
    const newStatus = color.status === 'Active' ? 'Inactive' : 'Active';
    try {
      const res = await fetch(`/api/colors/${color.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) fetchColors();
    } catch {
      // silent
    }
  };

  const activeCount = colors.filter(c => c.status === 'Active').length;
  const inactiveCount = colors.filter(c => c.status === 'Inactive').length;

  return (
    <div>
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[var(--t-heading)]">Color Variant</h1>
          <p className="text-sm text-[var(--t-body)] mt-1">
            Manage colors for product variants
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={openAddDialog}
            className="bg-[var(--brand)] hover:bg-[var(--brand-dark)] text-white text-sm font-semibold rounded-lg flex items-center gap-2 h-10 px-4 shadow-sm cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Add Color
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
        <div className="bg-[var(--card)] rounded-xl shadow-sm p-4">
          <p className="text-xs text-[var(--t-body)] font-medium">Total Colors</p>
          <p className="text-xl font-bold text-[var(--t-heading)] mt-1">{colors.length}</p>
        </div>
        <div className="bg-[var(--card)] rounded-xl shadow-sm p-4">
          <p className="text-xs text-[var(--brand)] font-medium">Active</p>
          <p className="text-xl font-bold text-[var(--brand)] mt-1">{activeCount}</p>
        </div>
        <div className="bg-[var(--card)] rounded-xl shadow-sm p-4 col-span-2 sm:col-span-1">
          <p className="text-xs text-[var(--t-muted)] font-medium">Inactive</p>
          <p className="text-xl font-bold text-[var(--t-muted)] mt-1">{inactiveCount}</p>
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--t-body)]" />
        <Input
          placeholder="Search colors..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 h-10 text-sm bg-[var(--card)] border-[var(--bd)] rounded-lg"
        />
      </div>

      {/* Color Grid */}
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {[...Array(10)].map((_, i) => (
            <div key={i} className="bg-[var(--card)] rounded-xl shadow-sm p-4">
              <Skeleton className="h-16 w-full rounded-lg mb-3" />
              <Skeleton className="h-4 w-20 mb-1" />
              <Skeleton className="h-3 w-14" />
            </div>
          ))}
        </div>
      ) : filteredColors.length === 0 ? (
        <div className="bg-[var(--card)] rounded-xl shadow-sm p-12 flex flex-col items-center justify-center">
          <div className="w-16 h-16 rounded-full bg-[var(--surface)] flex items-center justify-center mb-4">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[var(--danger)] via-[var(--highlight)] to-[var(--info)]" />
          </div>
          <h2 className="text-lg font-semibold text-[var(--t-heading)] mb-1">No colors found</h2>
          <p className="text-sm text-[var(--t-body)]">
            {search ? 'Try a different search' : 'Add your first color variant'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {filteredColors.map((color) => (
            <div
              key={color.id}
              className={`bg-[var(--card)] rounded-xl shadow-sm border border-[var(--bd)] overflow-hidden transition-all hover:shadow-md group ${
                color.status === 'Inactive' ? 'opacity-50' : ''
              }`}
            >
              {/* Color swatch */}
              <div
                className="h-20 w-full relative"
                style={{ backgroundColor: color.hexCode }}
              >
                {/* Status badge */}
                <div className="absolute top-2 left-2">
                  <Badge
                    className={`text-[11px] px-1.5 py-0 rounded-full ${
                      color.status === 'Active'
                        ? 'bg-green-500/20 text-green-700 border-green-500/30'
                        : 'bg-[var(--t-muted)]/20 text-[var(--t-muted)] border-[var(--t-muted)]/30'
                    }`}
                    variant="outline"
                  >
                    {color.status}
                  </Badge>
                </div>

                {/* Sort order */}
                <div className="absolute top-2 right-2">
                  <span className="text-[11px] bg-black/30 text-white px-1.5 py-0.5 rounded-full">
                    #{color.sortOrder}
                  </span>
                </div>

                {/* Action buttons on hover */}
                <div className="absolute bottom-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => handleToggleStatus(color)}
                    className="p-1.5 rounded-md bg-[var(--card)]/90 hover:bg-[var(--card)] text-[var(--t-body)] hover:text-[var(--t-heading)] transition-colors cursor-pointer"
                    title={color.status === 'Active' ? 'Deactivate' : 'Activate'}
                  >
                    {color.status === 'Active' ? (
                      <Eye className="w-3 h-3" />
                    ) : (
                      <EyeOff className="w-3 h-3" />
                    )}
                  </button>
                  <button
                    onClick={() => openEditDialog(color)}
                    className="p-1.5 rounded-md bg-[var(--card)]/90 hover:bg-[var(--card)] text-[var(--info)] transition-colors cursor-pointer"
                    title="Edit"
                  >
                    <Pencil className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => setDeleteTarget(color)}
                    className="p-1.5 rounded-md bg-[var(--card)]/90 hover:bg-[var(--card)] text-[var(--danger)] transition-colors cursor-pointer"
                    title="Delete"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>

              {/* Info */}
              <div className="p-3">
                <p className="text-sm font-semibold text-[var(--t-heading)] truncate">{color.name}</p>
                <p className="text-[11px] text-[var(--t-muted)] font-mono mt-0.5">{color.hexCode}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ============ ADD DIALOG ============ */}
      <Dialog open={showAddDialog} onOpenChange={(open) => !open && setShowAddDialog(false)}>
        <DialogContent className="sm:max-w-md rounded-xl">
          <DialogHeader>
            <DialogTitle className="text-[var(--t-heading)]">Add New Color</DialogTitle>
            <DialogDescription className="text-[var(--t-body)]">
              Add a new color variant option for products
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Color preview */}
            <div className="flex items-center gap-3">
              <div
                className="w-12 h-12 rounded-xl border border-[var(--bd)] shadow-inner"
                style={{ backgroundColor: formHexCode }}
              />
              <div>
                <p className="text-sm font-medium text-[var(--t-heading)]">{formName || 'Color Name'}</p>
                <p className="text-xs text-[var(--t-muted)] font-mono">{formHexCode}</p>
              </div>
            </div>

            {/* Name */}
            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-[var(--t-heading)]">Color Name *</Label>
              <Input
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="e.g. Dusty Pink"
                className="h-10 text-sm bg-[var(--surface)] border-[var(--bd)] rounded-lg"
              />
            </div>

            {/* Hex Code */}
            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-[var(--t-heading)]">Hex Code</Label>
              <div className="flex items-center gap-2">
                <Input
                  value={formHexCode}
                  onChange={(e) => setFormHexCode(e.target.value)}
                  placeholder="#636e72"
                  className="h-10 text-sm bg-[var(--surface)] border-[var(--bd)] rounded-lg font-mono flex-1"
                />
                <input
                  type="color"
                  value={formHexCode}
                  onChange={(e) => setFormHexCode(e.target.value)}
                  className="w-10 h-10 rounded-lg border border-[var(--bd)] cursor-pointer p-0.5"
                />
              </div>
            </div>

            {/* Sort Order */}
            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-[var(--t-heading)]">Sort Order</Label>
              <Input
                type="number"
                min={1}
                value={formSortOrder}
                onChange={(e) => setFormSortOrder(parseInt(e.target.value) || 0)}
                className="h-10 text-sm bg-[var(--surface)] border-[var(--bd)] rounded-lg w-24"
              />
              <p className="text-[11px] text-[var(--t-muted)]">Lower number = shown first in dropdown</p>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => setShowAddDialog(false)}
              className="text-sm rounded-lg px-4 h-10 border-[var(--bd)] cursor-pointer"
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={saving || !formName.trim()}
              className="bg-[var(--brand)] hover:bg-[var(--brand-dark)] text-white text-sm font-semibold rounded-lg px-5 h-10 disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Add Color'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ============ EDIT DIALOG ============ */}
      <Dialog open={!!editColor} onOpenChange={(open) => !open && setEditColor(null)}>
        <DialogContent className="sm:max-w-md rounded-xl">
          <DialogHeader>
            <DialogTitle className="text-[var(--t-heading)]">Edit Color</DialogTitle>
            <DialogDescription className="text-[var(--t-body)]">
              Update color details
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Color preview */}
            <div className="flex items-center gap-3">
              <div
                className="w-12 h-12 rounded-xl border border-[var(--bd)] shadow-inner"
                style={{ backgroundColor: formHexCode }}
              />
              <div>
                <p className="text-sm font-medium text-[var(--t-heading)]">{formName || 'Color Name'}</p>
                <p className="text-xs text-[var(--t-muted)] font-mono">{formHexCode}</p>
              </div>
            </div>

            {/* Name */}
            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-[var(--t-heading)]">Color Name *</Label>
              <Input
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                className="h-10 text-sm bg-[var(--surface)] border-[var(--bd)] rounded-lg"
              />
            </div>

            {/* Hex Code */}
            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-[var(--t-heading)]">Hex Code</Label>
              <div className="flex items-center gap-2">
                <Input
                  value={formHexCode}
                  onChange={(e) => setFormHexCode(e.target.value)}
                  className="h-10 text-sm bg-[var(--surface)] border-[var(--bd)] rounded-lg font-mono flex-1"
                />
                <input
                  type="color"
                  value={formHexCode}
                  onChange={(e) => setFormHexCode(e.target.value)}
                  className="w-10 h-10 rounded-lg border border-[var(--bd)] cursor-pointer p-0.5"
                />
              </div>
            </div>

            {/* Status */}
            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-[var(--t-heading)]">Status</Label>
              <div className="flex items-center gap-2">
                {['Active', 'Inactive'].map((s) => (
                  <button
                    key={s}
                    onClick={() => setFormStatus(s)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
                      formStatus === s
                        ? s === 'Active'
                          ? 'bg-[var(--brand)]/10 border-[var(--brand)]/30 text-[var(--brand)]'
                          : 'bg-[var(--surface-2)] border-[var(--bd-2)] text-[var(--t-muted)]'
                        : 'bg-[var(--card)] border-[var(--bd)] text-[var(--t-body)] hover:bg-[var(--surface)]'
                    }`}
                  >
                    {s === 'Active' ? '✓ Active' : '○ Inactive'}
                  </button>
                ))}
              </div>
            </div>

            {/* Sort Order */}
            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-[var(--t-heading)]">Sort Order</Label>
              <Input
                type="number"
                min={1}
                value={formSortOrder}
                onChange={(e) => setFormSortOrder(parseInt(e.target.value) || 0)}
                className="h-10 text-sm bg-[var(--surface)] border-[var(--bd)] rounded-lg w-24"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => setEditColor(null)}
              className="text-sm rounded-lg px-4 h-10 border-[var(--bd)] cursor-pointer"
            >
              Cancel
            </Button>
            <Button
              onClick={handleUpdate}
              disabled={saving || !formName.trim()}
              className="bg-[var(--brand)] hover:bg-[var(--brand-dark)] text-white text-sm font-semibold rounded-lg px-5 h-10 disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save Changes'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ============ DELETE DIALOG ============ */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-sm rounded-xl">
          <DialogHeader>
            <DialogTitle className="text-[var(--t-heading)]">Delete Color</DialogTitle>
            <DialogDescription className="text-[var(--t-body)]">
              Are you sure you want to delete this color?
            </DialogDescription>
          </DialogHeader>

          {deleteTarget && (
            <div className="flex items-center gap-3 p-3 bg-[var(--surface)] rounded-lg">
              <div
                className="w-10 h-10 rounded-lg border border-[var(--bd)]"
                style={{ backgroundColor: deleteTarget.hexCode }}
              />
              <div>
                <p className="text-sm font-medium text-[var(--t-heading)]">{deleteTarget.name}</p>
                <p className="text-[11px] text-[var(--t-muted)] font-mono">{deleteTarget.hexCode}</p>
              </div>
            </div>
          )}

          <p className="text-xs text-[var(--danger)]">
            Products that use this color won&apos;t be affected — only the color option will be removed from the dropdown.
          </p>

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => setDeleteTarget(null)}
              className="text-sm rounded-lg px-4 h-10 border-[var(--bd)] cursor-pointer"
            >
              Cancel
            </Button>
            <Button
              onClick={handleDelete}
              disabled={deleting}
              className="bg-[var(--danger)] hover:bg-[var(--danger-dark)] text-white text-sm font-semibold rounded-lg px-5 h-10 disabled:opacity-50"
            >
              {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Delete'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
