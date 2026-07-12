'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Plus,
  Pencil,
  Trash2,
  Printer,
  Search,
  MapPin,
  FileText,
  X,
  Check,
  MonitorDot,
  Wrench,
  AlertTriangle,
  Clock,
  Calendar,
  Loader2,
  ArrowUpDown,
  Wallet,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { toast } from 'sonner';

// ============ TYPES ============

interface PrinterData {
  id: string;
  name: string;
  type: string;
  brand: string;
  model: string;
  status: string;
  location: string;
  notes: string;
  purchaseDate: string | null;
  purchasePrice: number | null;
  createdAt: string;
  updatedAt: string;
}

interface PrinterFormData {
  name: string;
  brand: string;
  model: string;
  status: string;
  location: string;
  notes: string;
  purchaseDate: string;
  purchasePrice: string;
}

interface MaintenanceRecord {
  id: string;
  printerId: string;
  type: string;
  customType: string | null;
  lastDone: string;
  intervalDays: number;
  nextDue: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

interface MaintenanceFormData {
  type: string;
  customType: string;
  lastDone: string;
  intervalDays: number;
  notes: string;
}

const PRINTER_STATUSES = ['Working', 'Need Maintenance', 'Offline'] as const;

const MAINTENANCE_TYPES = [
  { value: 'Nozzle Change', label: 'Nozzle Change', icon: '🔧', defaultDays: 90 },
  { value: 'Lubricant', label: 'Lubricant / Grease', icon: '🛢️', defaultDays: 30 },
  { value: 'Belt Tension', label: 'Belt Tension', icon: '⚙️', defaultDays: 60 },
  { value: 'Full Cleaning', label: 'Full Cleaning', icon: '🧹', defaultDays: 90 },
  { value: 'Custom', label: 'Custom', icon: '📝', defaultDays: 30 },
];

// ============ HELPERS ============

function getStatusBadge(status: string) {
  switch (status) {
    case 'Working':
      return 'bg-[#15803d]/10 text-[#15803d] border-[#15803d]/30';
    case 'Need Maintenance':
      return 'bg-[#d97706]/10 text-[#d97706] border-[#d97706]/30';
    case 'Offline':
      return 'bg-[#4b5563]/10 text-[#4b5563] border-[#4b5563]/30';
    default:
      return 'bg-gray-100 text-gray-700';
  }
}

function getStatusDot(status: string) {
  switch (status) {
    case 'Working': return 'bg-[#15803d]';
    case 'Need Maintenance': return 'bg-[#d97706]';
    case 'Offline': return 'bg-[#4b5563]';
    default: return 'bg-gray-400';
  }
}

function getMaintenanceStatus(nextDue: string): { label: string; className: string; bgColor: string } {
  const now = new Date();
  const due = new Date(nextDue);
  const daysUntilDue = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  if (daysUntilDue < 0) return { label: 'Overdue', className: 'text-[#dc2626] bg-[#dc2626]/10', bgColor: 'border-[#dc2626]/30 bg-[#dc2626]/5' };
  if (daysUntilDue <= 7) return { label: 'Soon', className: 'text-[#d97706] bg-[#d97706]/10', bgColor: 'border-[#d97706]/30 bg-[#d97706]/5' };
  return { label: 'OK', className: 'text-[#15803d] bg-[#15803d]/10', bgColor: 'border-[#15803d]/30 bg-[#15803d]/5' };
}

function emptyForm(): PrinterFormData {
  return { name: '', brand: '', model: '', status: 'Working', location: '', notes: '', purchaseDate: '', purchasePrice: '' };
}

function emptyMaintenanceForm(): MaintenanceFormData {
  return { type: 'Nozzle Change', customType: '', lastDone: '', intervalDays: 90, notes: '' };
}

// Robust fetch with auto-retry on network errors
async function robustFetch(url: string, options?: RequestInit, retries = 3): Promise<Response> {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, { ...options, signal: AbortSignal.timeout(15000) });
      return res;
    } catch (err) {
      if (i < retries - 1) {
        await new Promise(r => setTimeout(r, 1000 * (i + 1)));
        continue;
      }
      throw err;
    }
  }
  throw new Error('Gagal terhubung ke server setelah beberapa percobaan.');
}

// ============ MAIN COMPONENT ============

export function PrinterDatabase() {
  const [printers, setPrinters] = useState<PrinterData[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');

  // Dialog states
  const [addOpen, setAddOpen] = useState(false);
  const [editPrinter, setEditPrinter] = useState<PrinterData | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [detailPrinter, setDetailPrinter] = useState<PrinterData | null>(null);

  // Maintenance states
  const [maintenancePrinterId, setMaintenancePrinterId] = useState<string | null>(null);
  const [maintenances, setMaintenances] = useState<MaintenanceRecord[]>([]);
  const [maintenanceLoading, setMaintenanceLoading] = useState(false);
  const [showAddMaintenance, setShowAddMaintenance] = useState(false);
  const [editMaintenance, setEditMaintenance] = useState<MaintenanceRecord | null>(null);
  const [deleteMaintenanceId, setDeleteMaintenanceId] = useState<string | null>(null);
  const [maintenanceSearch, setMaintenanceSearch] = useState('');
  const [maintenanceSort, setMaintenanceSort] = useState<'lastDoneDesc' | 'nextDueAsc' | 'az'>('lastDoneDesc');

  const filteredMaintenances = useMemo(() => {
    const q = maintenanceSearch.trim().toLowerCase();
    const withName = maintenances.map((m) => {
      const typeInfo = MAINTENANCE_TYPES.find((t) => t.value === m.type);
      const displayName = m.type === 'Custom' ? (m.customType || 'Custom') : (typeInfo?.label || m.type);
      return { ...m, displayName };
    });
    const filtered = q
      ? withName.filter((m) =>
          m.displayName.toLowerCase().includes(q) ||
          m.notes.toLowerCase().includes(q)
        )
      : withName;

    return [...filtered].sort((a, b) => {
      if (maintenanceSort === 'nextDueAsc') {
        return new Date(a.nextDue).getTime() - new Date(b.nextDue).getTime();
      }
      if (maintenanceSort === 'az') {
        return a.displayName.localeCompare(b.displayName);
      }
      // default: lastDoneDesc
      return new Date(b.lastDone).getTime() - new Date(a.lastDone).getTime();
    });
  }, [maintenances, maintenanceSearch, maintenanceSort]);

  const fetchMaintenances = useCallback(async (printerId: string) => {
    try {
      setMaintenanceLoading(true);
      const res = await robustFetch(`/api/printers/${printerId}/maintenance`);
      if (!res.ok) throw new Error('Failed');
      const data = await res.json();
      setMaintenances(data);
    } catch {
      toast.error('Gagal memuat maintenance records');
    } finally {
      setMaintenanceLoading(false);
    }
  }, []);

  const fetchPrinters = useCallback(async () => {
    try {
      setLoading(true);
      const res = await robustFetch('/api/printers');
      if (!res.ok) throw new Error('Failed');
      const data = await res.json();
      setPrinters(data);
      // Refresh maintenances if a printer detail is open
      if (maintenancePrinterId) {
        fetchMaintenances(maintenancePrinterId);
      }
    } catch {
      toast.error('Gagal memuat data printer');
    } finally {
      setLoading(false);
    }
  }, [maintenancePrinterId, fetchMaintenances]);

  useEffect(() => { fetchPrinters(); }, [fetchPrinters]);

  const openDetail = (printer: PrinterData) => {
    setDetailPrinter(printer);
    setMaintenancePrinterId(printer.id);
    fetchMaintenances(printer.id);
  };

  // Filter
  const filtered = printers.filter((p) => {
    if (search) {
      const s = search.toLowerCase();
      if (!p.name.toLowerCase().includes(s) && !p.brand.toLowerCase().includes(s) && !p.model.toLowerCase().includes(s) && !p.location.toLowerCase().includes(s)) {
        return false;
      }
    }
    if (filterStatus !== 'all' && p.status !== filterStatus) return false;
    return true;
  });

  // Stats
  const stats = {
    total: printers.length,
    working: printers.filter((p) => p.status === 'Working').length,
    maintenance: printers.filter((p) => p.status === 'Need Maintenance').length,
    offline: printers.filter((p) => p.status === 'Offline').length,
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#2d3436]">3D Printer Database</h1>
          <p className="text-sm text-[#4b5563] mt-1">Kelola semua printer di workspace kamu</p>
        </div>
        <Button
          onClick={() => setAddOpen(true)}
          className="bg-[#4a6741] hover:bg-[#3d5535] text-white text-sm font-semibold rounded-lg flex items-center gap-2 h-10 px-4 shadow-sm cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          Add Printer
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl shadow-sm p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-[#4a6741]/10 flex items-center justify-center">
              <Printer className="w-5 h-5 text-[#4a6741]" />
            </div>
            <div>
              <p className="text-[11px] text-[#4b5563] font-medium uppercase tracking-wider">Total Printer</p>
              <p className="text-xl font-bold text-[#2d3436]">{stats.total}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-[#15803d]/10 flex items-center justify-center">
              <Check className="w-5 h-5 text-[#15803d]" />
            </div>
            <div>
              <p className="text-[11px] text-[#4b5563] font-medium uppercase tracking-wider">Working</p>
              <p className="text-xl font-bold text-[#15803d]">{stats.working}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-[#d97706]/10 flex items-center justify-center">
              <MonitorDot className="w-5 h-5 text-[#d97706]" />
            </div>
            <div>
              <p className="text-[11px] text-[#4b5563] font-medium uppercase tracking-wider">Maintenance</p>
              <p className="text-xl font-bold text-[#d97706]">{stats.maintenance}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-[#4b5563]/10 flex items-center justify-center">
              <X className="w-5 h-5 text-[#4b5563]" />
            </div>
            <div>
              <p className="text-[11px] text-[#4b5563] font-medium uppercase tracking-wider">Offline</p>
              <p className="text-xl font-bold text-[#4b5563]">{stats.offline}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white rounded-xl shadow-sm p-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#6b7280]" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari printer, brand, lokasi..."
              className="pl-10 text-sm bg-[#f5f6fa] border-[#e8e8e8] rounded-lg h-10"
            />
          </div>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-[160px] text-sm bg-[#f5f6fa] border-[#e8e8e8] rounded-lg h-10">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua Status</SelectItem>
              {PRINTER_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Printer Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="bg-white rounded-xl shadow-sm p-5">
              <Skeleton className="h-5 w-40 mb-3" />
              <Skeleton className="h-4 w-24 mb-4" />
              <div className="space-y-2">
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-3/4" />
              </div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm py-16 flex flex-col items-center justify-center">
          <div className="w-16 h-16 rounded-full bg-[#f5f6fa] flex items-center justify-center mb-4">
            <Printer className="w-8 h-8 text-[#6b7280]" />
          </div>
          <p className="text-sm font-medium text-[#4b5563] mb-1">
            {search || filterStatus !== 'all' ? 'Printer tidak ditemukan' : 'Belum ada printer'}
          </p>
          <p className="text-xs text-[#6b7280] mb-4">
            {search || filterStatus !== 'all' ? 'Coba ubah filter pencarian' : 'Tambahkan printer pertamamu'}
          </p>
          {!search && filterStatus === 'all' && (
            <Button onClick={() => setAddOpen(true)} size="sm" className="rounded-lg bg-[#4a6741] hover:bg-[#3d5535] text-white">
              <Plus className="w-4 h-4 mr-1" />
              Add Printer
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((printer) => (
            <div
              key={printer.id}
              className="bg-white rounded-xl shadow-sm overflow-hidden hover:shadow-md transition-shadow cursor-pointer group border border-transparent hover:border-[#4a6741]/20"
              onClick={() => openDetail(printer)}
            >
              {/* Card Header */}
              <div className="px-5 pt-5 pb-3">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2.5">
                    <div className="w-10 h-10 rounded-lg bg-[#f5f6fa] flex items-center justify-center text-lg">
                      🖨️
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-[#2d3436] group-hover:text-[#4a6741] transition-colors">
                        {printer.name}
                      </h3>
                      {printer.brand && (
                        <p className="text-[11px] text-[#6b7280]">
                          {printer.brand}{printer.model ? ` · ${printer.model}` : ''}
                        </p>
                      )}
                    </div>
                  </div>
                  <Badge className={`text-[11px] px-2 py-0.5 rounded-full font-semibold gap-1 ${getStatusBadge(printer.status)}`} variant="outline">
                    <span className={`w-1.5 h-1.5 rounded-full ${getStatusDot(printer.status)}`} />
                    {printer.status}
                  </Badge>
                </div>
              </div>

              {/* Card Details */}
              <div className="px-5 pb-3 space-y-1.5">
                {printer.location && (
                  <div className="flex items-center gap-1.5 text-[11px] text-[#4b5563]">
                    <MapPin className="w-3 h-3 text-[#6b7280]" />
                    {printer.location}
                  </div>
                )}
                {printer.notes && (
                  <p className="text-[11px] text-[#6b7280] line-clamp-2 leading-relaxed">
                    {printer.notes}
                  </p>
                )}
              </div>

              {/* Card Footer */}
              <div className="px-5 py-3 bg-[#fafafa] border-t border-[#f0f0f0] flex items-center justify-between">
                <span className="text-[11px] text-[#6b7280]">
                  Added {new Date(printer.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </span>
                <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={() => setEditPrinter(printer)}
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-[#4b5563] hover:bg-[#4a6741]/10 hover:text-[#4a6741] transition-colors cursor-pointer"
                    title="Edit"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setDeleteId(printer.id)}
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-[#4b5563] hover:bg-[#dc2626]/10 hover:text-[#dc2626] transition-colors cursor-pointer"
                    title="Delete"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ============ ADD DIALOG ============ */}
      <PrinterFormDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        title="Add Printer"
        description="Tambahkan printer baru ke workspace."
        initialData={emptyForm()}
        onSubmit={async (data) => {
          // Check for duplicate name locally
          const dup = printers.find(p => p.name.toLowerCase() === data.name.trim().toLowerCase());
          if (dup) throw new Error(`Printer "${data.name}" sudah ada. Gunakan nama lain.`);

          const res = await robustFetch('/api/printers', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
          });
          if (!res.ok) {
            const d = await res.json().catch(() => ({ error: 'Gagal menambah printer' }));
            throw new Error(d.error || `Server error (${res.status})`);
          }
        }}
        onSuccess={() => {
          toast.success('Printer berhasil ditambahkan!');
          fetchPrinters();
        }}
      />

      {/* ============ EDIT DIALOG ============ */}
      <PrinterFormDialog
        open={!!editPrinter}
        onOpenChange={(open) => !open && setEditPrinter(null)}
        title="Edit Printer"
        description="Update informasi printer."
        initialData={editPrinter ? {
          name: editPrinter.name,
          brand: editPrinter.brand,
          model: editPrinter.model,
          status: editPrinter.status,
          location: editPrinter.location,
          notes: editPrinter.notes,
          purchaseDate: editPrinter.purchaseDate ? editPrinter.purchaseDate.slice(0, 10) : '',
          purchasePrice: editPrinter.purchasePrice != null ? String(editPrinter.purchasePrice) : '',
        } : emptyForm()}
        onSubmit={async (data) => {
          if (!editPrinter) throw new Error('No printer selected');
          // Check duplicate name (excluding current printer)
          const dup = printers.find(p => p.id !== editPrinter.id && p.name.toLowerCase() === data.name.trim().toLowerCase());
          if (dup) throw new Error(`Printer "${data.name}" sudah ada. Gunakan nama lain.`);

          const res = await robustFetch(`/api/printers/${editPrinter.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
          });
          if (!res.ok) {
            const d = await res.json().catch(() => ({ error: 'Gagal mengupdate printer' }));
            throw new Error(d.error || `Server error (${res.status})`);
          }
        }}
        onSuccess={() => {
          toast.success('Printer berhasil diupdate!');
          fetchPrinters();
          setEditPrinter(null);
        }}
      />

      {/* ============ DETAIL DIALOG ============ */}
      <Dialog open={!!detailPrinter} onOpenChange={(open) => {
        if (!open) {
          setDetailPrinter(null);
          setMaintenancePrinterId(null);
          setMaintenances([]);
          setMaintenanceSearch('');
          setMaintenanceSort('lastDoneDesc');
        }
      }}>
        <DialogContent className="sm:max-w-lg rounded-xl max-h-[90vh] overflow-y-auto">
          {detailPrinter && (
            <>
              <DialogHeader>
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-[#f5f6fa] flex items-center justify-center text-2xl">
                    🖨️
                  </div>
                  <div>
                    <DialogTitle className="text-[#2d3436]">{detailPrinter.name}</DialogTitle>
                    <p className="text-xs text-[#6b7280]">{detailPrinter.brand}{detailPrinter.model ? ` · ${detailPrinter.model}` : ''}</p>
                  </div>
                </div>
              </DialogHeader>
              <div className="space-y-3 py-2">
                <div className="bg-[#f5f6fa] rounded-lg p-3">
                  <span className="text-[11px] text-[#6b7280] uppercase tracking-wider font-medium">Status</span>
                  <p className="mt-1">
                    <Badge className={`text-[11px] px-2 py-0.5 rounded-full font-semibold gap-1 ${getStatusBadge(detailPrinter.status)}`} variant="outline">
                      <span className={`w-1.5 h-1.5 rounded-full ${getStatusDot(detailPrinter.status)}`} />
                      {detailPrinter.status}
                    </Badge>
                  </p>
                </div>
                {(detailPrinter.purchaseDate || detailPrinter.purchasePrice != null) && (
                  <div className="bg-[#f5f6fa] rounded-lg p-3 space-y-1">
                    <span className="text-[11px] text-[#6b7280] uppercase tracking-wider font-medium flex items-center gap-1.5">
                      <Wallet className="w-3.5 h-3.5" />
                      Info Pembelian
                    </span>
                    <div className="flex items-center justify-between text-sm text-[#2d3436] pt-0.5">
                      <span className="flex items-center gap-1.5 text-[#4b5563]">
                        <Calendar className="w-3.5 h-3.5 text-[#6b7280]" />
                        {detailPrinter.purchaseDate
                          ? new Date(detailPrinter.purchaseDate).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })
                          : '-'}
                      </span>
                      <span className="font-semibold">
                        {detailPrinter.purchasePrice != null
                          ? `Rp ${detailPrinter.purchasePrice.toLocaleString('id-ID')}`
                          : '-'}
                      </span>
                    </div>
                  </div>
                )}
                {detailPrinter.location && (
                  <div className="flex items-center gap-2 text-sm text-[#4b5563]">
                    <MapPin className="w-4 h-4 text-[#6b7280]" />
                    <span>{detailPrinter.location}</span>
                  </div>
                )}
                {detailPrinter.notes && (
                  <div className="flex items-start gap-2">
                    <FileText className="w-4 h-4 text-[#6b7280] mt-0.5 flex-shrink-0" />
                    <p className="text-sm text-[#4b5563] leading-relaxed">{detailPrinter.notes}</p>
                  </div>
                )}
                <div className="text-[11px] text-[#6b7280] pt-2 border-t border-[#f0f0f0]">
                  Added: {new Date(detailPrinter.createdAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}
                  <br />
                  Last updated: {new Date(detailPrinter.updatedAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}
                </div>
              </div>

              {/* Maintenance Section */}
              <div className="border-t border-[#f0f0f0] pt-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Wrench className="w-4 h-4 text-[#4a6741]" />
                    <h4 className="text-sm font-semibold text-[#2d3436]">Maintenance Log</h4>
                    {maintenances.length > 0 && (
                      <span className="text-[11px] text-[#6b7280] bg-[#f5f6fa] px-2 py-0.5 rounded-full">
                        {maintenances.length}
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => { setShowAddMaintenance(true); }}
                    className="text-xs text-[#4a6741] font-medium hover:underline cursor-pointer flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3" /> Add
                  </button>
                </div>

                {maintenances.length > 0 && (
                  <div className="flex items-center gap-2 mb-3">
                    <div className="relative flex-1">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#9ca3af]" />
                      <Input
                        value={maintenanceSearch}
                        onChange={(e) => setMaintenanceSearch(e.target.value)}
                        placeholder="Cari jenis maintenance, mis. nozzle, lubricant..."
                        className="h-8 pl-8 text-xs bg-[#f5f6fa] border-[#e8e8e8] rounded-lg"
                      />
                    </div>
                    <Select value={maintenanceSort} onValueChange={(v) => setMaintenanceSort(v as typeof maintenanceSort)}>
                      <SelectTrigger className="h-8 w-[40px] px-2 text-xs bg-[#f5f6fa] border-[#e8e8e8] rounded-lg [&>svg:last-child]:hidden">
                        <ArrowUpDown className="w-3.5 h-3.5 text-[#6b7280]" />
                      </SelectTrigger>
                      <SelectContent align="end">
                        <SelectItem value="lastDoneDesc">Terbaru diganti</SelectItem>
                        <SelectItem value="nextDueAsc">Jatuh tempo terdekat</SelectItem>
                        <SelectItem value="az">A-Z jenis</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {maintenanceLoading ? (
                  <div className="space-y-2">
                    {[1, 2].map(i => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}
                  </div>
                ) : maintenances.length === 0 ? (
                  <p className="text-xs text-[#6b7280] text-center py-4">No maintenance records yet</p>
                ) : filteredMaintenances.length === 0 ? (
                  <p className="text-xs text-[#6b7280] text-center py-4">Nggak ada hasil untuk &quot;{maintenanceSearch}&quot;</p>
                ) : (
                  <div className="space-y-2 max-h-[300px] overflow-y-auto">
                    {filteredMaintenances.map((m) => {
                      const status = getMaintenanceStatus(m.nextDue);
                      const typeInfo = MAINTENANCE_TYPES.find(t => t.value === m.type);
                      const displayName = m.type === 'Custom' ? (m.customType || 'Custom') : (typeInfo?.label || m.type);
                      const icon = typeInfo?.icon || '📝';
                      const daysUntilDue = Math.ceil((new Date(m.nextDue).getTime() - Date.now()) / (1000 * 60 * 60 * 24));

                      return (
                        <div key={m.id} className={`flex items-center gap-3 p-2.5 rounded-lg border ${status.bgColor} transition-colors group`}>
                          <span className="text-lg flex-shrink-0">{icon}</span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-semibold text-[#2d3436] truncate">{displayName}</span>
                              <span className={`text-[11px] px-1.5 py-0.5 rounded-full font-semibold ${status.className}`}>
                                {status.label}
                              </span>
                            </div>
                            <div className="flex items-center gap-3 mt-0.5">
                              <span className="text-[11px] text-[#6b7280]">Last: {new Date(m.lastDone).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                              <span className="text-[11px] text-[#6b7280]">Next: {new Date(m.nextDue).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                              {daysUntilDue < 0 && (
                                <span className="text-[11px] text-[#dc2626] font-medium">{Math.abs(daysUntilDue)}d overdue</span>
                              )}
                              {daysUntilDue >= 0 && daysUntilDue <= 7 && (
                                <span className="text-[11px] text-[#d97706] font-medium">{daysUntilDue}d left</span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                            <button onClick={() => setEditMaintenance(m)} className="p-1 rounded hover:bg-white/60 text-[#4b5563] hover:text-[#2563eb] cursor-pointer">
                              <Pencil className="w-3 h-3" />
                            </button>
                            <button onClick={() => setDeleteMaintenanceId(m.id)} className="p-1 rounded hover:bg-white/60 text-[#4b5563] hover:text-[#dc2626] cursor-pointer">
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <DialogFooter className="gap-2">
                <Button variant="outline" onClick={() => { setDetailPrinter(null); setMaintenancePrinterId(null); setMaintenances([]); }} className="rounded-full px-5">Close</Button>
                <Button
                  onClick={() => { setDetailPrinter(null); setMaintenancePrinterId(null); setMaintenances([]); setEditPrinter(detailPrinter); }}
                  className="bg-[#4a6741] hover:bg-[#3d5535] text-white rounded-full px-5"
                >
                  <Pencil className="w-3.5 h-3.5 mr-1.5" />
                  Edit
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ============ DELETE PRINTER CONFIRM ============ */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent className="rounded-xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Printer</AlertDialogTitle>
            <AlertDialogDescription>
              Apakah kamu yakin ingin menghapus printer ini? Tindakan ini tidak bisa dibatalkan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-lg">Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (!deleteId) return;
                try {
                  const res = await robustFetch(`/api/printers/${deleteId}`, { method: 'DELETE' });
                  if (!res.ok) throw new Error('Failed');
                  toast.success('Printer berhasil dihapus');
                  fetchPrinters();
                  setDeleteId(null);
                } catch {
                  toast.error('Gagal menghapus printer');
                }
              }}
              className="rounded-lg bg-[#dc2626] hover:bg-[#b91c1c] text-white"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ============ ADD MAINTENANCE DIALOG ============ */}
      <MaintenanceFormDialog
        open={showAddMaintenance}
        onOpenChange={(open) => { if (!open) setShowAddMaintenance(false); }}
        title="Add Maintenance"
        printerId={maintenancePrinterId || ''}
        initialData={emptyMaintenanceForm()}
        isEdit={false}
        onSuccess={() => {
          setShowAddMaintenance(false);
          if (maintenancePrinterId) fetchMaintenances(maintenancePrinterId);
        }}
      />

      {/* ============ EDIT MAINTENANCE DIALOG ============ */}
      <MaintenanceFormDialog
        open={!!editMaintenance}
        onOpenChange={(open) => { if (!open) setEditMaintenance(null); }}
        title="Edit Maintenance"
        printerId={editMaintenance?.printerId || ''}
        initialData={editMaintenance ? {
          type: editMaintenance.type,
          customType: editMaintenance.customType || '',
          lastDone: editMaintenance.lastDone.split('T')[0],
          intervalDays: editMaintenance.intervalDays,
          notes: editMaintenance.notes,
        } : emptyMaintenanceForm()}
        isEdit={true}
        editId={editMaintenance?.id}
        onSuccess={() => {
          setEditMaintenance(null);
          if (maintenancePrinterId) fetchMaintenances(maintenancePrinterId);
        }}
      />

      {/* ============ DELETE MAINTENANCE CONFIRM ============ */}
      <AlertDialog open={!!deleteMaintenanceId} onOpenChange={() => setDeleteMaintenanceId(null)}>
        <AlertDialogContent className="rounded-xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Maintenance Record</AlertDialogTitle>
            <AlertDialogDescription>
              Apakah kamu yakin ingin menghapus maintenance record ini? Tindakan ini tidak bisa dibatalkan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-lg">Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (!deleteMaintenanceId || !maintenancePrinterId) return;
                try {
                  const res = await robustFetch(`/api/printers/${maintenancePrinterId}/maintenance/${deleteMaintenanceId}`, { method: 'DELETE' });
                  if (!res.ok) throw new Error('Failed');
                  toast.success('Maintenance record berhasil dihapus');
                  fetchMaintenances(maintenancePrinterId);
                  setDeleteMaintenanceId(null);
                } catch {
                  toast.error('Gagal menghapus maintenance record');
                }
              }}
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

// ============ PRINTER FORM DIALOG ============

function PrinterFormDialog({
  open,
  onOpenChange,
  title,
  description,
  initialData,
  onSubmit,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  initialData: PrinterFormData;
  onSubmit: (data: PrinterFormData) => Promise<void>;
  onSuccess: () => void;
}) {
  const [form, setForm] = useState<PrinterFormData>(initialData);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) setForm(initialData);
  }, [open, initialData]);

  const update = (field: keyof PrinterFormData, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async () => {
    if (!form.name.trim()) {
      toast.error('Nama printer wajib diisi');
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit(form);
      onOpenChange(false);
      onSuccess();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal menyimpan');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md rounded-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-[#2d3436] flex items-center gap-2">
            <Printer className="w-5 h-5 text-[#4a6741]" />
            {title}
          </DialogTitle>
          <DialogDescription className="text-[#4b5563]">{description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Name */}
          <div className="space-y-1.5">
            <Label className="text-sm font-medium text-[#2d3436]">Nama Printer *</Label>
            <Input
              value={form.name}
              onChange={(e) => update('name', e.target.value)}
              placeholder="e.g. Ender 3 V3 #1"
              className="h-10 text-sm bg-[#f5f6fa] border-[#e8e8e8] rounded-lg"
              autoFocus
            />
          </div>

          {/* Brand + Model */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-[#2d3436]">Brand</Label>
              <Input
                value={form.brand}
                onChange={(e) => update('brand', e.target.value)}
                placeholder="e.g. Creality"
                className="h-10 text-sm bg-[#f5f6fa] border-[#e8e8e8] rounded-lg"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-[#2d3436]">Model</Label>
              <Input
                value={form.model}
                onChange={(e) => update('model', e.target.value)}
                placeholder="e.g. Ender 3 V3"
                className="h-10 text-sm bg-[#f5f6fa] border-[#e8e8e8] rounded-lg"
              />
            </div>
          </div>

          {/* Purchase Date + Price */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-[#2d3436] flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5" />
                Tanggal Beli
              </Label>
              <Input
                type="date"
                value={form.purchaseDate}
                onChange={(e) => update('purchaseDate', e.target.value)}
                className="h-10 text-sm bg-[#f5f6fa] border-[#e8e8e8] rounded-lg"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-[#2d3436]">Harga Beli (Rp)</Label>
              <Input
                type="number"
                value={form.purchasePrice}
                onChange={(e) => update('purchasePrice', e.target.value)}
                placeholder="e.g. 8500000"
                className="h-10 text-sm bg-[#f5f6fa] border-[#e8e8e8] rounded-lg"
              />
            </div>
          </div>

          {/* Status */}
          <div className="space-y-1.5">
            <Label className="text-sm font-medium text-[#2d3436]">Status</Label>
            <Select value={form.status} onValueChange={(v) => update('status', v)}>
              <SelectTrigger className="h-10 text-sm bg-[#f5f6fa] border-[#e8e8e8] rounded-lg">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PRINTER_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    <span className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${getStatusDot(s)}`} />
                      {s}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Location */}
          <div className="space-y-1.5">
            <Label className="text-sm font-medium text-[#2d3436] flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5" />
              Lokasi
            </Label>
            <Input
              value={form.location}
              onChange={(e) => update('location', e.target.value)}
              placeholder="e.g. Workshop A, Ruang 2"
              className="h-10 text-sm bg-[#f5f6fa] border-[#e8e8e8] rounded-lg"
            />
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <Label className="text-sm font-medium text-[#2d3436] flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5" />
              Catatan
            </Label>
            <textarea
              value={form.notes}
              onChange={(e) => update('notes', e.target.value)}
              placeholder="Catatan tambahan tentang printer..."
              rows={3}
              className="w-full text-sm bg-[#f5f6fa] border-[#e8e8e8] rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#4a6741]/20 focus:border-[#4a6741]/30 resize-none"
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting} className="rounded-full px-5">
            Batal
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={submitting || !form.name.trim()}
            className="bg-[#4a6741] hover:bg-[#3d5535] text-white rounded-full px-5 disabled:opacity-50"
          >
            {submitting ? 'Menyimpan...' : title === 'Add Printer' ? 'Add Printer' : 'Save Changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============ MAINTENANCE FORM DIALOG ============

function MaintenanceFormDialog({
  open,
  onOpenChange,
  title,
  printerId,
  initialData,
  isEdit,
  editId,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  printerId: string;
  initialData: MaintenanceFormData;
  isEdit: boolean;
  editId?: string;
  onSuccess: () => void;
}) {
  const [form, setForm] = useState<MaintenanceFormData>(initialData);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) setForm(initialData);
  }, [open, initialData]);

  const handleTypeChange = (value: string) => {
    const typeInfo = MAINTENANCE_TYPES.find(t => t.value === value);
    setForm(prev => ({
      ...prev,
      type: value,
      intervalDays: typeInfo?.defaultDays || 30,
      customType: '',
    }));
  };

  const handleSubmit = async () => {
    if (!form.lastDone) {
      toast.error('Last done date is required');
      return;
    }
    if (form.type === 'Custom' && !form.customType.trim()) {
      toast.error('Custom type name is required');
      return;
    }
    if (!form.intervalDays || form.intervalDays <= 0) {
      toast.error('Interval must be greater than 0');
      return;
    }

    setSubmitting(true);
    try {
      if (isEdit && editId) {
        const res = await robustFetch(`/api/printers/${printerId}/maintenance/${editId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: form.type,
            customType: form.type === 'Custom' ? form.customType.trim() : '',
            lastDone: form.lastDone,
            intervalDays: form.intervalDays,
            notes: form.notes.trim(),
          }),
        });
        if (!res.ok) {
          const d = await res.json().catch(() => ({ error: 'Gagal mengupdate maintenance' }));
          throw new Error(d.error || `Server error (${res.status})`);
        }
        toast.success('Maintenance record berhasil diupdate!');
      } else {
        const res = await robustFetch(`/api/printers/${printerId}/maintenance`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: form.type,
            customType: form.type === 'Custom' ? form.customType.trim() : '',
            lastDone: form.lastDone,
            intervalDays: form.intervalDays,
            notes: form.notes.trim(),
          }),
        });
        if (!res.ok) {
          const d = await res.json().catch(() => ({ error: 'Gagal menambah maintenance' }));
          throw new Error(d.error || `Server error (${res.status})`);
        }
        toast.success('Maintenance record berhasil ditambahkan!');
      }
      onOpenChange(false);
      onSuccess();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal menyimpan');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md rounded-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-[#2d3436] flex items-center gap-2">
            <Wrench className="w-5 h-5 text-[#4a6741]" />
            {title}
          </DialogTitle>
          <DialogDescription className="text-[#4b5563]">
            {isEdit ? 'Update maintenance record.' : 'Add a new maintenance record.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Maintenance Type */}
          <div className="space-y-1.5">
            <Label className="text-sm font-medium text-[#2d3436] flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5" />
              Type *
            </Label>
            <Select value={form.type} onValueChange={handleTypeChange}>
              <SelectTrigger className="h-10 text-sm bg-[#f5f6fa] border-[#e8e8e8] rounded-lg">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MAINTENANCE_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    <span className="flex items-center gap-2">
                      <span>{t.icon}</span>
                      {t.label}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Custom Type Name (only when Custom is selected) */}
          {form.type === 'Custom' && (
            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-[#2d3436]">Custom Type Name *</Label>
              <Input
                value={form.customType}
                onChange={(e) => setForm(prev => ({ ...prev, customType: e.target.value }))}
                placeholder="e.g. Bed Levelling, Hotend Replacement"
                className="h-10 text-sm bg-[#f5f6fa] border-[#e8e8e8] rounded-lg"
                autoFocus
              />
            </div>
          )}

          {/* Last Done Date */}
          <div className="space-y-1.5">
            <Label className="text-sm font-medium text-[#2d3436] flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5" />
              Last Done *
            </Label>
            <Input
              type="date"
              value={form.lastDone}
              onChange={(e) => setForm(prev => ({ ...prev, lastDone: e.target.value }))}
              className="h-10 text-sm bg-[#f5f6fa] border-[#e8e8e8] rounded-lg"
            />
          </div>

          {/* Interval Days */}
          <div className="space-y-1.5">
            <Label className="text-sm font-medium text-[#2d3436] flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" />
              Repeat Every
            </Label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={1}
                value={form.intervalDays}
                onChange={(e) => setForm(prev => ({ ...prev, intervalDays: parseInt(e.target.value) || 1 }))}
                className="h-10 text-sm bg-[#f5f6fa] border-[#e8e8e8] rounded-lg w-24"
              />
              <span className="text-sm text-[#4b5563]">days</span>
              {form.lastDone && form.intervalDays > 0 && (() => {
                const nextDue = new Date(form.lastDone);
                nextDue.setDate(nextDue.getDate() + form.intervalDays);
                return (
                  <span className="text-[11px] text-[#4a6741] bg-[#4a6741]/10 px-2 py-0.5 rounded-full font-medium">
                    Next: {nextDue.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </span>
                );
              })()}
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <Label className="text-sm font-medium text-[#2d3436] flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5" />
              Notes
            </Label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm(prev => ({ ...prev, notes: e.target.value }))}
              placeholder="Additional notes..."
              rows={3}
              className="w-full text-sm bg-[#f5f6fa] border-[#e8e8e8] rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#4a6741]/20 focus:border-[#4a6741]/30 resize-none"
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting} className="rounded-full px-5">
            Batal
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={submitting || !form.lastDone}
            className="bg-[#4a6741] hover:bg-[#3d5535] text-white rounded-full px-5 disabled:opacity-50"
          >
            {submitting && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}
            {submitting ? 'Menyimpan...' : isEdit ? 'Save Changes' : 'Add Record'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
