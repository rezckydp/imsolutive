'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import {
  Plus,
  ArrowLeft,
  Search,
  ClipboardCheck,
  CheckCircle2,
  XCircle,
  Trash2,
  Loader2,
  PackageSearch,
  FileText,
  AlertTriangle,
  Check,
  ChevronDown,
  ScanBarcode,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';

// ==================== Types ====================

interface OpnameSession {
  id: string;
  sessionNo: string;
  type: string;
  status: string;
  notes: string;
  totalItems: number;
  totalDiff: number;
  startedAt: string;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  _count?: { items: number };
}

interface OpnameItem {
  id: string;
  opnameId: string;
  variantId: string;
  systemQty: number;
  actualQty: number;
  difference: number;
  adjusted: boolean;
  createdAt: string;
  updatedAt: string;
  variant: {
    id: string;
    color: string;
    colorHex: string;
    type: string;
    qty: number;
    productId: string;
    product: {
      id: string;
      sku: string;
      name: string;
      minStock: number;
      parentProductId: string | null;
    };
  };
}

interface ProductWithVariants {
  id: string;
  sku: string;
  name: string;
  minStock: number;
  parentProductId: string | null;
  variants: {
    id: string;
    color: string;
    colorHex: string;
    type: string;
    qty: number;
    barcode: string | null;
  }[];
}

// ==================== Helpers ====================

function formatDate(isoString: string): string {
  const d = new Date(isoString);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const year = d.getFullYear();
  const month = months[d.getMonth()];
  const day = d.getDate().toString().padStart(2, '0');
  const hours = d.getHours().toString().padStart(2, '0');
  const minutes = d.getMinutes().toString().padStart(2, '0');
  return `${month} ${day}, ${year} ${hours}:${minutes}`;
}

function formatDateShort(isoString: string): string {
  const d = new Date(isoString);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

// ==================== Status Badge ====================

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { className: string; label: string }> = {
    'In Progress': {
      className: 'bg-[var(--info)]/10 text-[var(--info)] border-[var(--info)]/20',
      label: 'In Progress',
    },
    'Completed': {
      className: 'bg-[var(--success)]/10 text-[var(--success)] border-[var(--success)]/20',
      label: 'Completed',
    },
    'Cancelled': {
      className: 'bg-[var(--danger)]/10 text-[var(--danger)] border-[var(--danger)]/20',
      label: 'Cancelled',
    },
  };
  const c = config[status] || config['In Progress'];
  return (
    <Badge variant="outline" className={c.className}>
      {c.label}
    </Badge>
  );
}

function TypeBadge({ type }: { type: string }) {
  const config: Record<string, { className: string }> = {
    Full: { className: 'bg-[var(--brand)]/10 text-[var(--brand)] border-[var(--brand)]/20' },
    Partial: { className: 'bg-[var(--warning)]/10 text-[var(--warning)] border-[var(--warning)]/20' },
  };
  const c = config[type] || config['Full'];
  return (
    <Badge variant="outline" className={c.className}>
      {type}
    </Badge>
  );
}

// ==================== Session List Skeleton ====================

function SessionListSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3].map((i) => (
        <Card key={i} className="p-4 md:p-5">
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              <Skeleton className="h-5 w-24" />
              <Skeleton className="h-4 w-40" />
            </div>
            <div className="flex items-center gap-2">
              <Skeleton className="h-6 w-16 rounded-full" />
              <Skeleton className="h-6 w-20 rounded-full" />
            </div>
          </div>
          <div className="flex items-center gap-6 mt-3">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-32" />
          </div>
        </Card>
      ))}
    </div>
  );
}

// ==================== Main Component ====================

export function StockOpname() {
  // View state
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<OpnameSession[]>([]);
  const [sessionDetail, setSessionDetail] = useState<OpnameSession & { items?: OpnameItem[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);

  // New session dialog
  const [newSessionOpen, setNewSessionOpen] = useState(false);
  const [newSessionType, setNewSessionType] = useState<'Full' | 'Partial'>('Full');
  const [newSessionNotes, setNewSessionNotes] = useState('');
  const [creating, setCreating] = useState(false);

  // Count form
  const [products, setProducts] = useState<ProductWithVariants[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<ProductWithVariants | null>(null);
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);
  const [actualQty, setActualQty] = useState('');
  const [counting, setCounting] = useState(false);
  const [variantSearchOpen, setVariantSearchOpen] = useState(false);

  // Action dialogs
  const [adjustDialogOpen, setAdjustDialogOpen] = useState(false);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [deleteItemDialogOpen, setDeleteItemDialogOpen] = useState(false);
  const [deleteItemId, setDeleteItemId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const countInputRef = useRef<HTMLInputElement>(null);
  const barcodeInputRef = useRef<HTMLInputElement>(null);

  // Barcode scan state
  const [barcodeInput, setBarcodeInput] = useState('');
  const [barcodeLookingUp, setBarcodeLookingUp] = useState(false);
  const [barcodeError, setBarcodeError] = useState('');

  // ==================== Fetch sessions ====================
  const fetchSessions = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/stock-opname');
      if (!res.ok) throw new Error('Failed to fetch sessions');
      const data = await res.json();
      setSessions(data);
    } catch {
      toast.error('Failed to load stock opname sessions');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  // ==================== Fetch session detail ====================
  const fetchSessionDetail = useCallback(async (id: string) => {
    try {
      setDetailLoading(true);
      const res = await fetch(`/api/stock-opname/${id}`);
      if (!res.ok) throw new Error('Failed to fetch session');
      const data = await res.json();
      setSessionDetail(data);
    } catch {
      toast.error('Failed to load session details');
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedSessionId) {
      fetchSessionDetail(selectedSessionId);
    }
  }, [selectedSessionId, fetchSessionDetail]);

  // ==================== Fetch products for variant search ====================
  const fetchProducts = useCallback(async () => {
    try {
      setProductsLoading(true);
      const res = await fetch('/api/products?limit=500');
      if (!res.ok) throw new Error('Failed to fetch products');
      const data = await res.json();
      setProducts(data.products || []);
    } catch {
      toast.error('Failed to load products for search');
    } finally {
      setProductsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedSessionId && sessionDetail?.status === 'In Progress') {
      fetchProducts();
    }
  }, [selectedSessionId, sessionDetail?.status, fetchProducts]);

  // ==================== Handle open session ====================
  const handleOpenSession = (id: string) => {
    setSelectedSessionId(id);
    // Reset count form
    setSelectedProduct(null);
    setSelectedVariantId(null);
    setActualQty('');
    setVariantSearchOpen(false);
  };

  // ==================== Handle back ====================
  const handleBack = () => {
    setSelectedSessionId(null);
    setSessionDetail(null);
    setSelectedProduct(null);
    setSelectedVariantId(null);
    setActualQty('');
  };

  // ==================== Create new session ====================
  const handleCreateSession = async () => {
    try {
      setCreating(true);
      const res = await fetch('/api/stock-opname', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: newSessionType, notes: newSessionNotes }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to create session');
      }
      const data = await res.json();
      toast.success(`Session ${data.sessionNo} created`);
      setNewSessionOpen(false);
      setNewSessionType('Full');
      setNewSessionNotes('');
      fetchSessions();
      // Open the new session immediately
      handleOpenSession(data.id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create session');
    } finally {
      setCreating(false);
    }
  };

  // ==================== Count item ====================
  const handleCount = async () => {
    if (!selectedVariantId || !actualQty || !selectedSessionId) {
      toast.error('Please select a variant and enter actual quantity');
      return;
    }

    const qty = parseInt(actualQty, 10);
    if (isNaN(qty) || qty < 0) {
      toast.error('Please enter a valid quantity');
      return;
    }

    try {
      setCounting(true);
      const res = await fetch(`/api/stock-opname/${selectedSessionId}/count`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ variantId: selectedVariantId, actualQty: qty }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to count item');
      }

      toast.success('Item counted successfully');

      // Reset form
      setSelectedProduct(null);
      setSelectedVariantId(null);
      setActualQty('');

      // Refresh detail
      fetchSessionDetail(selectedSessionId);
      fetchSessions();
      // Focus back to barcode input for next scan
      setTimeout(() => barcodeInputRef.current?.focus(), 50);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to count item');
    } finally {
      setCounting(false);
    }
  };

  // ==================== Adjust stock ====================
  const handleAdjustStock = async () => {
    if (!selectedSessionId) return;
    try {
      setActionLoading(true);
      const res = await fetch(`/api/stock-opname/${selectedSessionId}/adjust`, {
        method: 'POST',
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to adjust stock');
      }
      const data = await res.json();
      toast.success(`Stock adjusted for ${data.adjustedCount} item(s). Session completed.`);
      setAdjustDialogOpen(false);
      fetchSessionDetail(selectedSessionId);
      fetchSessions();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to adjust stock');
    } finally {
      setActionLoading(false);
    }
  };

  // ==================== Cancel session ====================
  const handleCancelSession = async () => {
    if (!selectedSessionId) return;
    try {
      setActionLoading(true);
      const res = await fetch(`/api/stock-opname/${selectedSessionId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'Cancelled' }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to cancel session');
      }
      toast.success('Session cancelled');
      setCancelDialogOpen(false);
      fetchSessionDetail(selectedSessionId);
      fetchSessions();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to cancel session');
    } finally {
      setActionLoading(false);
    }
  };

  // ==================== Delete item ====================
  const handleDeleteItem = async () => {
    if (!selectedSessionId || !deleteItemId) return;
    try {
      setActionLoading(true);
      const res = await fetch(`/api/stock-opname/${selectedSessionId}/items/${deleteItemId}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to delete item');
      }
      toast.success('Item removed');
      setDeleteItemDialogOpen(false);
      setDeleteItemId(null);
      fetchSessionDetail(selectedSessionId);
      fetchSessions();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete item');
    } finally {
      setActionLoading(false);
    }
  };

  // ==================== Get selected variant details ====================
  const selectedVariant = selectedProduct?.variants.find((v) => v.id === selectedVariantId) || null;

  // ==================== Barcode scan handler ====================
  const handleBarcodeScan = useCallback(async () => {
    const code = barcodeInput.trim();
    if (!code) return;

    setBarcodeLookingUp(true);
    setBarcodeError('');

    try {
      const res = await fetch(`/api/barcode/lookup?code=${encodeURIComponent(code)}`);
      if (!res.ok) {
        const data = await res.json();
        setBarcodeError(data.error || 'Product not found');
        setBarcodeInput('');
        setTimeout(() => barcodeInputRef.current?.focus(), 10);
        return;
      }
      const data = await res.json();

      if (data.variantId) {
        // Single variant found — auto-select it
        const matchProduct = products.find((p) => p.id === data.productId);
        if (matchProduct) {
          setSelectedProduct(matchProduct);
        } else {
          setSelectedProduct({
            id: data.productId,
            sku: data.sku,
            name: data.name,
            minStock: 0,
            parentProductId: null,
            variants: [{
              id: data.variantId,
              color: data.color,
              colorHex: data.colorHex,
              type: data.type || '',
              qty: data.qty || 0,
              barcode: null,
            }],
          });
        }
        setSelectedVariantId(data.variantId);
        setBarcodeInput('');
        // Focus the qty input so user can type count immediately
        setTimeout(() => countInputRef.current?.focus(), 50);
      } else if (data.variants && data.variants.length === 1) {
        // Product with single variant
        const v = data.variants[0];
        setSelectedProduct({
          id: data.productId,
          sku: data.sku,
          name: data.name,
          minStock: data.minStock || 0,
          parentProductId: data.parentProductId || null,
          variants: [{ id: v.id, color: v.color, colorHex: v.colorHex, type: v.type || '', qty: v.qty, barcode: null }],
        });
        setSelectedVariantId(v.id);
        setBarcodeInput('');
        setTimeout(() => countInputRef.current?.focus(), 50);
      } else if (data.variants && data.variants.length > 1) {
        // Product with multiple variants — select product, show color picker
        setSelectedProduct({
          id: data.productId,
          sku: data.sku,
          name: data.name,
          minStock: data.minStock || 0,
          parentProductId: data.parentProductId || null,
          variants: data.variants.map((v: { id: string; color: string; colorHex: string; type: string; qty: number }) => ({
            id: v.id, color: v.color, colorHex: v.colorHex, type: v.type || '', qty: v.qty, barcode: null,
          })),
        });
        setSelectedVariantId(null);
        setBarcodeInput('');
        toast.info('Multiple colors found. Please select a color variant.');
      } else {
        setBarcodeError('Product not found');
        setBarcodeInput('');
        setTimeout(() => barcodeInputRef.current?.focus(), 10);
      }
    } catch {
      setBarcodeError('Lookup failed');
      setBarcodeInput('');
      setTimeout(() => barcodeInputRef.current?.focus(), 10);
    } finally {
      setBarcodeLookingUp(false);
    }
  }, [barcodeInput, products]);

  // Re-focus barcode input when barcodeLookingUp finishes
  const prevBarcodeLookingUp = useRef(false);
  useEffect(() => {
    if (prevBarcodeLookingUp.current && !barcodeLookingUp && !selectedVariantId && barcodeError) {
      setTimeout(() => barcodeInputRef.current?.focus(), 10);
    }
    prevBarcodeLookingUp.current = barcodeLookingUp;
  }, [barcodeLookingUp, selectedVariantId, barcodeError]);

  // ==================== RENDER: Session List ====================
  if (!selectedSessionId) {
    return (
      <div>
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
          <div>
            <h2 className="text-lg md:text-xl font-bold text-[var(--t-heading)]">Stock Opname</h2>
            <p className="text-xs md:text-sm text-[var(--t-body)] mt-0.5">Track and adjust inventory counts</p>
          </div>
          <Button
            onClick={() => setNewSessionOpen(true)}
            className="bg-[var(--brand)] hover:bg-[var(--brand-dark)] text-white gap-2 self-start sm:self-auto"
          >
            <Plus className="w-4 h-4" />
            New Session
          </Button>
        </div>

        {/* Session List */}
        {loading ? (
          <SessionListSkeleton />
        ) : sessions.length === 0 ? (
          <Card className="p-8 md:p-12 flex flex-col items-center justify-center">
            <div className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-[var(--surface)] flex items-center justify-center mb-4">
              <ClipboardCheck className="w-8 h-8 md:w-10 md:h-10 text-[var(--t-muted)]" />
            </div>
            <h3 className="text-base md:text-lg font-semibold text-[var(--t-heading)] mb-2">No Stock Opname Sessions</h3>
            <p className="text-sm text-[var(--t-body)] text-center max-w-md mb-4">
              Start a new stock opname session to count and adjust your inventory.
            </p>
            <Button
              onClick={() => setNewSessionOpen(true)}
              variant="outline"
              className="border-[var(--brand)] text-[var(--brand)] hover:bg-[var(--brand)]/5 gap-2"
            >
              <Plus className="w-4 h-4" />
              Create First Session
            </Button>
          </Card>
        ) : (
          <div className="space-y-3">
            {sessions.map((session) => (
              <Card
                key={session.id}
                className="p-4 md:p-5 hover:shadow-md transition-shadow cursor-pointer border border-[var(--bd)]"
                onClick={() => handleOpenSession(session.id)}
              >
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-lg bg-[var(--brand)]/10 flex items-center justify-center flex-shrink-0">
                      <ClipboardCheck className="w-5 h-5 text-[var(--brand)]" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-sm md:text-base text-[var(--t-heading)]">{session.sessionNo}</p>
                      <p className="text-xs text-[var(--t-body)] truncate">
                        {session.type} Count {session.notes ? `· ${session.notes}` : ''}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0 sm:ml-4">
                    <TypeBadge type={session.type} />
                    <StatusBadge status={session.status} />
                  </div>
                </div>

                {/* Stats row */}
                <div className="flex items-center gap-4 md:gap-6 mt-3 ml-0 sm:ml-[52px]">
                  <div className="flex items-center gap-1.5">
                    <PackageSearch className="w-3.5 h-3.5 text-[var(--t-muted)]" />
                    <span className="text-xs text-[var(--t-body)]">
                      <span className="font-medium text-[var(--t-heading)]">{session.totalItems}</span> items
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {session.totalDiff > 0 ? (
                      <span className="text-xs font-medium text-[var(--success)]">+{session.totalDiff}</span>
                    ) : session.totalDiff < 0 ? (
                      <span className="text-xs font-medium text-[var(--danger)]">{session.totalDiff}</span>
                    ) : (
                      <span className="text-xs font-medium text-[var(--t-muted)]">0</span>
                    )}
                    <span className="text-xs text-[var(--t-body)]">difference</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-[var(--t-muted)]">{formatDateShort(session.startedAt)}</span>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}

        {/* New Session Dialog */}
        <Dialog open={newSessionOpen} onOpenChange={setNewSessionOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>New Stock Opname Session</DialogTitle>
              <DialogDescription>Create a new session to count your inventory.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              {/* Type selector */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-[var(--t-heading)]">Session Type</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => setNewSessionType('Full')}
                    className={`p-3 rounded-lg border-2 text-center transition-all cursor-pointer ${
                      newSessionType === 'Full'
                        ? 'border-[var(--brand)] bg-[var(--brand)]/5'
                        : 'border-[var(--bd)] hover:border-[var(--brand)]/30'
                    }`}
                  >
                    <FileText className={`w-5 h-5 mx-auto mb-1.5 ${newSessionType === 'Full' ? 'text-[var(--brand)]' : 'text-[var(--t-muted)]'}`} />
                    <span className={`text-sm font-medium ${newSessionType === 'Full' ? 'text-[var(--brand)]' : 'text-[var(--t-body)]'}`}>
                      Full Count
                    </span>
                    <p className="text-[11px] text-[var(--t-muted)] mt-0.5">Count all products</p>
                  </button>
                  <button
                    onClick={() => setNewSessionType('Partial')}
                    className={`p-3 rounded-lg border-2 text-center transition-all cursor-pointer ${
                      newSessionType === 'Partial'
                        ? 'border-[var(--warning)] bg-[var(--warning)]/5'
                        : 'border-[var(--bd)] hover:border-[var(--warning)]/30'
                    }`}
                  >
                    <PackageSearch className={`w-5 h-5 mx-auto mb-1.5 ${newSessionType === 'Partial' ? 'text-[var(--warning)]' : 'text-[var(--t-muted)]'}`} />
                    <span className={`text-sm font-medium ${newSessionType === 'Partial' ? 'text-[var(--warning)]' : 'text-[var(--t-body)]'}`}>
                      Partial Count
                    </span>
                    <p className="text-[11px] text-[var(--t-muted)] mt-0.5">Count selected items</p>
                  </button>
                </div>
              </div>

              {/* Notes */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-[var(--t-heading)]">Notes (optional)</label>
                <Textarea
                  value={newSessionNotes}
                  onChange={(e) => setNewSessionNotes(e.target.value)}
                  placeholder="Add any notes for this session..."
                  className="resize-none min-h-[80px]"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setNewSessionOpen(false)} className="border-[var(--bd)]">
                Cancel
              </Button>
              <Button
                onClick={handleCreateSession}
                disabled={creating}
                className="bg-[var(--brand)] hover:bg-[var(--brand-dark)] text-white"
              >
                {creating ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                    Creating...
                  </>
                ) : (
                  'Create Session'
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // ==================== RENDER: Session Detail ====================
  return (
    <div>
      {/* Back button + Header */}
      <div className="mb-6">
        <button
          onClick={handleBack}
          className="flex items-center gap-2 text-sm text-[var(--t-body)] hover:text-[var(--brand)] transition-colors mb-3 cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Sessions
        </button>

        {detailLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-7 w-48" />
            <div className="flex items-center gap-3">
              <Skeleton className="h-6 w-16 rounded-full" />
              <Skeleton className="h-6 w-20 rounded-full" />
            </div>
          </div>
        ) : sessionDetail ? (
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div>
              <div className="flex items-center gap-3 mb-1.5">
                <h2 className="text-lg md:text-xl font-bold text-[var(--t-heading)]">{sessionDetail.sessionNo}</h2>
                <TypeBadge type={sessionDetail.type} />
                <StatusBadge status={sessionDetail.status} />
              </div>
              {sessionDetail.notes && (
                <p className="text-sm text-[var(--t-body)] mb-1">{sessionDetail.notes}</p>
              )}
              <p className="text-xs text-[var(--t-muted)]">
                Started: {formatDate(sessionDetail.startedAt)}
                {sessionDetail.completedAt && ` · Completed: ${formatDate(sessionDetail.completedAt)}`}
              </p>
            </div>

            {/* Summary stats */}
            <div className="flex items-center gap-4 sm:gap-5 flex-shrink-0">
              <div className="text-center px-3 py-2 bg-[var(--surface)] rounded-lg">
                <p className="text-lg font-bold text-[var(--t-heading)]">{sessionDetail.totalItems}</p>
                <p className="text-[11px] text-[var(--t-body)] font-medium">Items</p>
              </div>
              <div className="text-center px-3 py-2 bg-[var(--surface)] rounded-lg">
                <p className={`text-lg font-bold ${sessionDetail.totalDiff > 0 ? 'text-[var(--success)]' : sessionDetail.totalDiff < 0 ? 'text-[var(--danger)]' : 'text-[var(--t-muted)]'}`}>
                  {sessionDetail.totalDiff > 0 ? '+' : ''}{sessionDetail.totalDiff}
                </p>
                <p className="text-[11px] text-[var(--t-body)] font-medium">Difference</p>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {/* Detail Content */}
      {detailLoading ? (
        <Card className="p-6">
          <div className="space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        </Card>
      ) : !sessionDetail ? (
        <Card className="p-8 text-center">
          <p className="text-[var(--t-body)]">Session not found</p>
        </Card>
      ) : sessionDetail.status === 'Cancelled' ? (
        /* ==================== CANCELLED VIEW ==================== */
        <Card className="p-8 md:p-12 flex flex-col items-center justify-center">
          <div className="w-16 h-16 rounded-full bg-[var(--danger)]/10 flex items-center justify-center mb-4">
            <XCircle className="w-8 h-8 text-[var(--danger)]" />
          </div>
          <h3 className="text-lg font-semibold text-[var(--t-heading)] mb-2">Session Cancelled</h3>
          <p className="text-sm text-[var(--t-body)] text-center max-w-md">
            This stock opname session was cancelled and is no longer active.
          </p>
          {sessionDetail.items && sessionDetail.items.length > 0 && (
            <div className="mt-6 w-full max-w-lg">
              <p className="text-xs text-[var(--t-muted)] text-center mb-3">
                {sessionDetail.items.length} item(s) were counted before cancellation
              </p>
            </div>
          )}
        </Card>
      ) : sessionDetail.status === 'Completed' ? (
        /* ==================== COMPLETED VIEW ==================== */
        <div className="space-y-4">
          <Card className="p-4 md:p-6">
            <div className="flex items-center gap-2 mb-4">
              <CheckCircle2 className="w-5 h-5 text-[var(--success)]" />
              <h3 className="font-semibold text-[var(--t-heading)]">Counted Items</h3>
              <Badge variant="secondary" className="ml-auto text-xs">
                {sessionDetail.items?.length || 0} items
              </Badge>
            </div>

            {sessionDetail.items && sessionDetail.items.length > 0 ? (
              <div className="overflow-x-auto -mx-4 md:-mx-6 px-4 md:px-6">
                <table className="w-full min-w-[500px]">
                  <thead>
                    <tr className="border-b border-[var(--bd)]">
                      <th className="text-left text-[11px] font-medium text-[var(--t-body)] uppercase tracking-wider pb-3 pr-4">SKU</th>
                      <th className="text-left text-[11px] font-medium text-[var(--t-body)] uppercase tracking-wider pb-3 pr-4">Product</th>
                      <th className="text-left text-[11px] font-medium text-[var(--t-body)] uppercase tracking-wider pb-3 pr-4">Variant</th>
                      <th className="text-right text-[11px] font-medium text-[var(--t-body)] uppercase tracking-wider pb-3 pr-4">System</th>
                      <th className="text-right text-[11px] font-medium text-[var(--t-body)] uppercase tracking-wider pb-3 pr-4">Actual</th>
                      <th className="text-right text-[11px] font-medium text-[var(--t-body)] uppercase tracking-wider pb-3 pr-4">Diff</th>
                      <th className="text-center text-[11px] font-medium text-[var(--t-body)] uppercase tracking-wider pb-3">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sessionDetail.items.map((item) => (
                      <tr key={item.id} className="border-b border-[var(--bd)] last:border-0">
                        <td className="py-3 pr-4">
                          <span className="text-sm font-medium text-[var(--t-heading)]">{item.variant.product.sku}</span>
                        </td>
                        <td className="py-3 pr-4">
                          <span className="text-sm text-[var(--t-body)]">{item.variant.product.name}</span>
                        </td>
                        <td className="py-3 pr-4">
                          <div className="flex items-center gap-2">
                            <div
                              className="w-4 h-4 rounded-full border border-[var(--bd)] flex-shrink-0"
                              style={{ backgroundColor: item.variant.colorHex }}
                            />
                            <span className="text-sm text-[var(--t-body)]">{item.variant.color}{item.variant.type ? ` - ${item.variant.type}` : ''}</span>
                          </div>
                        </td>
                        <td className="py-3 pr-4 text-right">
                          <span className="text-sm text-[var(--t-heading)]">{item.systemQty}</span>
                        </td>
                        <td className="py-3 pr-4 text-right">
                          <span className="text-sm font-medium text-[var(--t-heading)]">{item.actualQty}</span>
                        </td>
                        <td className="py-3 pr-4 text-right">
                          <span className={`text-sm font-medium ${item.difference > 0 ? 'text-[var(--success)]' : item.difference < 0 ? 'text-[var(--danger)]' : 'text-[var(--t-muted)]'}`}>
                            {item.difference > 0 ? '+' : ''}{item.difference}
                          </span>
                        </td>
                        <td className="py-3 text-center">
                          {item.adjusted ? (
                            <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[var(--success)]/10 text-[var(--success)]">
                              <Check className="w-3 h-3" />
                              <span className="text-[11px] font-medium">Adjusted</span>
                            </div>
                          ) : (
                            <span className="text-[11px] text-[var(--t-muted)]">Pending</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-[var(--t-muted)] text-center py-6">No items counted in this session.</p>
            )}
          </Card>

          {/* Summary */}
          <Card className="p-4 bg-[var(--surface)]">
            <div className="flex items-center justify-between">
              <span className="text-sm text-[var(--t-body)]">Total Difference</span>
              <span className={`text-lg font-bold ${sessionDetail.totalDiff > 0 ? 'text-[var(--success)]' : sessionDetail.totalDiff < 0 ? 'text-[var(--danger)]' : 'text-[var(--t-muted)]'}`}>
                {sessionDetail.totalDiff > 0 ? '+' : ''}{sessionDetail.totalDiff}
              </span>
            </div>
          </Card>
        </div>
      ) : (
        /* ==================== IN PROGRESS VIEW ==================== */
        <div className="space-y-4">
          {/* Count Form */}
          <Card className="p-4 md:p-6">
            <div className="flex items-center gap-2 mb-4">
              <PackageSearch className="w-5 h-5 text-[var(--brand)]" />
              <h3 className="font-semibold text-[var(--t-heading)]">Count Item</h3>
            </div>

            <div className="space-y-3">
              {/* ========== BARCODE SCAN INPUT (primary method) ========== */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-[var(--t-body)] flex items-center gap-1.5">
                  <ScanBarcode className="w-3.5 h-3.5" />
                  Scan Barcode / SKU
                </label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--t-muted)]" />
                    <Input
                      ref={barcodeInputRef}
                      value={barcodeInput}
                      onChange={(e) => { setBarcodeInput(e.target.value); setBarcodeError(''); }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleBarcodeScan();
                        }
                      }}
                      placeholder="Scan or type barcode / SKU..."
                      disabled={barcodeLookingUp}
                      autoFocus
                      className="pl-9 h-11 text-sm bg-[var(--surface)] border-[var(--bd)] rounded-lg"
                    />
                  </div>
                  <Button
                    onClick={handleBarcodeScan}
                    disabled={barcodeLookingUp || !barcodeInput.trim()}
                    className="bg-[var(--brand)] hover:bg-[var(--brand-dark)] text-white h-11 px-4 rounded-lg flex-shrink-0 disabled:opacity-50"
                  >
                    {barcodeLookingUp ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                  </Button>
                </div>
                {barcodeError && (
                  <p className="text-xs text-[var(--danger)] mt-1">{barcodeError}</p>
                )}
              </div>

              {/* Divider: or search manually */}
              <div className="flex items-center gap-3">
                <div className="flex-1 border-t border-[var(--bd)]" />
                <span className="text-[11px] text-[var(--t-muted)] font-medium">atau cari manual</span>
                <div className="flex-1 border-t border-[var(--bd)]" />
              </div>

              {/* Variant Search (manual fallback) */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-[var(--t-body)]">Search Variant (SKU or Product Name)</label>
                <Popover open={variantSearchOpen} onOpenChange={setVariantSearchOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={variantSearchOpen}
                      className="w-full justify-between h-10 border-[var(--bd)] text-left font-normal"
                      disabled={productsLoading}
                    >
                      {selectedProduct && selectedVariant ? (
                        <div className="flex items-center gap-2 min-w-0 truncate">
                          <div
                            className="w-3.5 h-3.5 rounded-full border border-[var(--bd)] flex-shrink-0"
                            style={{ backgroundColor: selectedVariant.colorHex }}
                          />
                          <span className="truncate">
                            {selectedProduct.sku} — {selectedProduct.name} ({selectedVariant.color}{selectedVariant.type ? ` - ${selectedVariant.type}` : ''})
                          </span>
                        </div>
                      ) : productsLoading ? (
                        <span className="text-[var(--t-muted)]">Loading products...</span>
                      ) : (
                        <span className="text-[var(--t-muted)]">Search SKU or product name...</span>
                      )}
                      <ChevronDown className="w-4 h-4 flex-shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="p-0 w-[var(--radix-popover-trigger-width)]" align="start">
                    <Command shouldFilter={true}>
                      <CommandInput placeholder="Type to search..." />
                      <CommandList className="max-h-[300px]">
                        <CommandEmpty>No products found.</CommandEmpty>
                        <CommandGroup>
                          {products.map((product) => (
                            <CommandItem
                              key={product.id}
                              value={`${product.sku} ${product.name}`}
                              onSelect={() => {
                                if (product.variants.length === 1) {
                                  // Auto-select if only one variant
                                  setSelectedProduct(product);
                                  setSelectedVariantId(product.variants[0].id);
                                  setVariantSearchOpen(false);
                                } else {
                                  setSelectedProduct(product);
                                  setSelectedVariantId(null);
                                  setVariantSearchOpen(false);
                                }
                              }}
                              className="cursor-pointer"
                            >
                              <div className="flex items-center gap-2 min-w-0 w-full">
                                <div className="min-w-0 flex-1">
                                  <span className="text-sm font-medium">{product.sku}</span>
                                  <span className="text-sm text-[var(--t-body)] ml-2">{product.name}</span>
                                </div>
                                <Badge variant="secondary" className="text-[11px] flex-shrink-0">
                                  {product.variants.length} {product.variants.length === 1 ? 'color' : 'colors'}
                                </Badge>
                              </div>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>

              {/* Color variant selector (if product has multiple variants) */}
              {selectedProduct && selectedProduct.variants.length > 1 && (
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-[var(--t-body)]">Select Color Variant</label>
                  <div className="flex flex-wrap gap-2">
                    {selectedProduct.variants.map((v) => (
                      <button
                        key={v.id}
                        onClick={() => setSelectedVariantId(v.id)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium transition-all cursor-pointer ${
                          selectedVariantId === v.id
                            ? 'border-[var(--brand)] bg-[var(--brand)]/5 text-[var(--brand)]'
                            : 'border-[var(--bd)] text-[var(--t-body)] hover:border-[var(--brand)]/30'
                        }`}
                      >
                        <div
                          className="w-3 h-3 rounded-full border border-[var(--bd)] flex-shrink-0"
                          style={{ backgroundColor: v.colorHex }}
                        />
                        {v.color}{v.type ? ` - ${v.type}` : ''}
                        <span className="text-[var(--t-muted)]">({v.qty})</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Single variant info */}
              {selectedProduct && selectedProduct.variants.length === 1 && selectedVariant && (
                <div className="flex items-center gap-2 text-xs text-[var(--t-body)] bg-[var(--surface)] px-3 py-2 rounded-lg">
                  <span className="font-medium">System stock: {selectedVariant.qty}</span>
                  <span className="text-[var(--t-muted)]">·</span>
                  <div className="flex items-center gap-1">
                    <div
                      className="w-3 h-3 rounded-full border border-[var(--bd)]"
                      style={{ backgroundColor: selectedVariant.colorHex }}
                    />
                    {selectedVariant.color}{selectedVariant.type ? ` - ${selectedVariant.type}` : ''}
                  </div>
                </div>
              )}

              {/* Actual Qty Input */}
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="space-y-1.5 flex-1">
                  <label className="text-xs font-medium text-[var(--t-body)]">Actual Quantity</label>
                  <Input
                    ref={countInputRef}
                    type="number"
                    min="0"
                    value={actualQty}
                    onChange={(e) => setActualQty(e.target.value)}
                    placeholder="Enter actual count"
                    className="h-10"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleCount();
                      }
                    }}
                  />
                </div>
                <div className="flex items-end">
                  <Button
                    onClick={handleCount}
                    disabled={counting || !selectedVariantId || !actualQty}
                    className="bg-[var(--brand)] hover:bg-[var(--brand-dark)] text-white gap-2 w-full sm:w-auto h-10"
                  >
                    {counting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Counting...
                      </>
                    ) : (
                      <>
                        <Search className="w-4 h-4" />
                        Count
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </div>
          </Card>

          {/* Counted Items Table */}
          <Card className="p-4 md:p-6">
            <div className="flex items-center gap-2 mb-4">
              <FileText className="w-5 h-5 text-[var(--brand)]" />
              <h3 className="font-semibold text-[var(--t-heading)]">Counted Items</h3>
              {sessionDetail.items && sessionDetail.items.length > 0 && (
                <Badge variant="secondary" className="ml-auto text-xs">
                  {sessionDetail.items.length} items
                </Badge>
              )}
            </div>

            {sessionDetail.items && sessionDetail.items.length > 0 ? (
              <div className="overflow-x-auto -mx-4 md:-mx-6 px-4 md:px-6">
                <table className="w-full min-w-[550px]">
                  <thead>
                    <tr className="border-b border-[var(--bd)]">
                      <th className="text-left text-[11px] font-medium text-[var(--t-body)] uppercase tracking-wider pb-3 pr-4">SKU</th>
                      <th className="text-left text-[11px] font-medium text-[var(--t-body)] uppercase tracking-wider pb-3 pr-4">Product</th>
                      <th className="text-left text-[11px] font-medium text-[var(--t-body)] uppercase tracking-wider pb-3 pr-4">Color</th>
                      <th className="text-right text-[11px] font-medium text-[var(--t-body)] uppercase tracking-wider pb-3 pr-4">System</th>
                      <th className="text-right text-[11px] font-medium text-[var(--t-body)] uppercase tracking-wider pb-3 pr-4">Actual</th>
                      <th className="text-right text-[11px] font-medium text-[var(--t-body)] uppercase tracking-wider pb-3 pr-4">Diff</th>
                      <th className="text-center text-[11px] font-medium text-[var(--t-body)] uppercase tracking-wider pb-3 w-12"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {sessionDetail.items.map((item) => (
                      <tr key={item.id} className="border-b border-[var(--bd)] last:border-0 group">
                        <td className="py-3 pr-4">
                          <span className="text-sm font-medium text-[var(--t-heading)]">{item.variant.product.sku}</span>
                        </td>
                        <td className="py-3 pr-4">
                          <span className="text-sm text-[var(--t-body)]">{item.variant.product.name}</span>
                        </td>
                        <td className="py-3 pr-4">
                          <div className="flex items-center gap-2">
                            <div
                              className="w-4 h-4 rounded-full border border-[var(--bd)] flex-shrink-0"
                              style={{ backgroundColor: item.variant.colorHex }}
                            />
                            <span className="text-sm text-[var(--t-body)]">{item.variant.color}</span>
                          </div>
                        </td>
                        <td className="py-3 pr-4 text-right">
                          <span className="text-sm text-[var(--t-heading)]">{item.systemQty}</span>
                        </td>
                        <td className="py-3 pr-4 text-right">
                          <span className="text-sm font-medium text-[var(--t-heading)]">{item.actualQty}</span>
                        </td>
                        <td className="py-3 pr-4 text-right">
                          <span className={`text-sm font-medium ${item.difference > 0 ? 'text-[var(--success)]' : item.difference < 0 ? 'text-[var(--danger)]' : 'text-[var(--t-muted)]'}`}>
                            {item.difference > 0 ? '+' : ''}{item.difference}
                          </span>
                        </td>
                        <td className="py-3 text-center">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteItemId(item.id);
                              setDeleteItemDialogOpen(true);
                            }}
                            className="p-1.5 rounded-md text-[var(--t-muted)] hover:text-[var(--danger)] hover:bg-[var(--danger)]/5 transition-colors opacity-0 group-hover:opacity-100 cursor-pointer"
                            title="Delete item"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="py-8 text-center">
                <div className="w-12 h-12 rounded-full bg-[var(--surface)] flex items-center justify-center mx-auto mb-3">
                  <Search className="w-5 h-5 text-[var(--t-muted)]" />
                </div>
                <p className="text-sm text-[var(--t-muted)]">No items counted yet.</p>
                <p className="text-xs text-[var(--t-muted)] mt-0.5">Search for a variant above and enter the actual count.</p>
              </div>
            )}
          </Card>

          {/* Action Buttons */}
          {sessionDetail.items && sessionDetail.items.length > 0 && (
            <div className="flex flex-col sm:flex-row gap-3">
              <Button
                onClick={() => setAdjustDialogOpen(true)}
                className="bg-[var(--success)] hover:bg-[var(--success-alt)] text-white gap-2 flex-1 sm:flex-none"
              >
                <CheckCircle2 className="w-4 h-4" />
                Adjust Stock
              </Button>
              <Button
                onClick={() => setCancelDialogOpen(true)}
                variant="outline"
                className="border-[var(--danger)]/30 text-[var(--danger)] hover:bg-[var(--danger)]/5 gap-2 flex-1 sm:flex-none"
              >
                <XCircle className="w-4 h-4" />
                Cancel Session
              </Button>
            </div>
          )}
        </div>
      )}

      {/* ==================== Adjust Stock Confirmation Dialog ==================== */}
      <AlertDialog open={adjustDialogOpen} onOpenChange={setAdjustDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Adjust Stock</AlertDialogTitle>
            <AlertDialogDescription>
              This will update the system stock for all <strong>{sessionDetail?.items?.filter(i => !i.adjusted).length || 0}</strong> unadjusted item(s) to match the actual counted quantities.
              The session will be marked as <strong>Completed</strong> and cannot be edited afterward.
              <br /><br />
              <span className="text-[var(--warning)] font-medium">This action cannot be undone.</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={actionLoading}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleAdjustStock();
              }}
              disabled={actionLoading}
              className="bg-[var(--success)] hover:bg-[var(--success-alt)] text-white"
            >
              {actionLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                  Adjusting...
                </>
              ) : (
                'Confirm Adjust'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ==================== Cancel Session Confirmation Dialog ==================== */}
      <AlertDialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel Session</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to cancel session <strong>{sessionDetail?.sessionNo}</strong>?
              <br /><br />
              This will mark the session as cancelled. All counted items will be kept for record but stock will not be adjusted.
              <br /><br />
              <span className="text-[var(--danger)] font-medium">This action cannot be undone.</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={actionLoading}>Keep Session</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleCancelSession();
              }}
              disabled={actionLoading}
              className="bg-[var(--danger)] hover:bg-[var(--danger-dark)] text-white"
            >
              {actionLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                  Cancelling...
                </>
              ) : (
                'Cancel Session'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ==================== Delete Item Confirmation Dialog ==================== */}
      <AlertDialog open={deleteItemDialogOpen} onOpenChange={setDeleteItemDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Counted Item</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove this counted item from the session? The item can be re-counted later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={actionLoading}>Keep Item</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleDeleteItem();
              }}
              disabled={actionLoading}
              className="bg-[var(--danger)] hover:bg-[var(--danger-dark)] text-white"
            >
              {actionLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                  Deleting...
                </>
              ) : (
                'Delete Item'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
