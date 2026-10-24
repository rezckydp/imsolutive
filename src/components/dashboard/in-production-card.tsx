'use client';

import { useState, useEffect, useCallback } from 'react';
import { Check, Loader2, RotateCcw, Printer as PrinterIcon, ScanLine, AlertTriangle, Timer } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';

export interface ProductionItem {
  id: string;
  variantId: string;
  sku: string;
  name: string;
  color: string;
  colorHex: string;
  type: string;
  qty: number;
  assignedTo: string;
  status: string; // In Progress, Completed
  scannedQty: number;
  writeOffQty: number;
  scheduledDoneAt: string | null; // countdown auto-complete target, null = manual only
  note: string;
  orderNotesLabel?: string;
  createdAt: string;
}

interface PrinterOption {
  id: string;
  name: string;
  status: string;
}

interface InProductionCardProps {
  items?: ProductionItem[];
  loading?: boolean;
  onComplete?: (id: string) => void;
  onSendBack?: (item: ProductionItem) => void;
  onWriteOff?: (id: string) => void;
  onAdd?: () => void;
  onUpdatePrinter?: (itemId: string, printerName: string) => void;
}

function SkeletonRows() {
  return (
    <>
      {[...Array(5)].map((_, i) => (
        <tr key={i} className="border-t border-[var(--surface-2)]">
          <td className="py-2.5 px-3">
            <Skeleton className="h-4 w-16" />
          </td>
          <td className="py-2.5 px-3">
            <div className="flex items-center gap-2">
              <Skeleton className="h-2.5 w-2.5 rounded-full" />
              <Skeleton className="h-4 w-14" />
            </div>
          </td>
          <td className="py-2.5 px-3 text-right">
            <Skeleton className="h-4 w-6 ml-auto" />
          </td>
          <td className="py-2.5 px-3">
            <Skeleton className="h-4 w-16" />
          </td>
          <td className="py-2.5 px-3">
            <Skeleton className="h-7 w-28" />
          </td>
          <td className="py-2.5 px-1">
            <Skeleton className="h-7 w-7 rounded-md" />
          </td>
        </tr>
      ))}
    </>
  );
}

// e.g. "2:15 pm" — clock time it entered production
function formatClockTime(iso: string): string {
  const d = new Date(iso);
  const hours24 = d.getHours();
  const minutes = d.getMinutes().toString().padStart(2, '0');
  const ampm = hours24 >= 12 ? 'pm' : 'am';
  const hours12 = hours24 % 12 || 12;
  return `${hours12}:${minutes} ${ampm}`;
}

// e.g. "8 Sep 2026, 2:15 pm" — full date, shown on hover (in case it started a previous day)
function formatExactTime(iso: string): string {
  const d = new Date(iso);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}, ${formatClockTime(iso)}`;
}

// Countdown display only — the server-side check in
// src/lib/production-autocomplete.ts is the actual source of truth for the
// auto-complete transition (ims-feature-production-countdown-autocomplete.md).
// "1:28:45" once past an hour left, "28:45" under that.
function formatCountdown(targetIso: string, nowMs: number): string {
  const remainingMs = Math.max(0, new Date(targetIso).getTime() - nowMs);
  const totalSeconds = Math.floor(remainingMs / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

export function InProductionCard({ items = [], loading = false, onComplete, onSendBack, onWriteOff, onAdd, onUpdatePrinter }: InProductionCardProps) {
  const [completingId, setCompletingId] = useState<string | null>(null);
  const [sendingBackId, setSendingBackId] = useState<string | null>(null);
  const [printers, setPrinters] = useState<PrinterOption[]>([]);
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);
  const [updatingPrinterId, setUpdatingPrinterId] = useState<string | null>(null);
  const [writeOffConfirmId, setWriteOffConfirmId] = useState<string | null>(null);
  const [writingOffId, setWritingOffId] = useState<string | null>(null);
  // Ticks once a second so any live countdowns re-render — display only, the
  // actual auto-complete transition happens server-side regardless of
  // whether this card is even open (see lib/production-autocomplete.ts).
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const fetchPrinters = useCallback(async () => {
    try {
      const res = await fetch('/api/printers');
      if (res.ok) {
        const data = await res.json();
        setPrinters(data);
      }
    } catch {
      // silent - printers are optional
    }
  }, []);

  useEffect(() => {
    fetchPrinters();
  }, [fetchPrinters]);

  const handleComplete = async (id: string) => {
    setCompletingId(id);
    try {
      await onComplete?.(id);
    } finally {
      setCompletingId(null);
    }
  };

  const handleSendBack = async (item: ProductionItem) => {
    setSendingBackId(item.id);
    try {
      await onSendBack?.(item);
    } finally {
      setSendingBackId(null);
    }
  };

  const handleWriteOff = async (id: string) => {
    setWritingOffId(id);
    try {
      await onWriteOff?.(id);
      toast.success('Sisa ditandai reject/hilang — dicatat ke Activity Log.');
    } catch {
      toast.error('Gagal menandai write-off. Coba lagi.');
    } finally {
      setWritingOffId(null);
      setWriteOffConfirmId(null);
    }
  };

  const handlePrinterChange = async (itemId: string, printerName: string) => {
    setUpdatingPrinterId(itemId);
    setOpenDropdownId(null);
    try {
      // Try to update via the production API
      let success = false;
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          const res = await fetch(`/api/production/${itemId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ assignedTo: printerName }),
          });
          if (res.ok) {
            success = true;
            break;
          }
        } catch {
          // retry
        }
        if (attempt < 2) await new Promise(r => setTimeout(r, 1500));
      }
      if (success) {
        toast.success(`Printer diubah ke ${printerName}`);
        onUpdatePrinter?.(itemId, printerName);
      } else {
        throw new Error('Gagal update printer');
      }
    } catch {
      toast.error('Gagal mengubah printer. Coba lagi.');
    } finally {
      setUpdatingPrinterId(null);
    }
  };

  const workingPrinters = printers.filter(p => p.status === 'Working');
  const allPrintersAvailable = workingPrinters.length > 0;

  return (
    <Card className="rounded-xl shadow-sm border-0">
      <CardHeader className="pb-3 px-4 pt-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold text-[var(--t-heading)]">In Production</CardTitle>
          {printers.length > 0 && (
            <div className="flex items-center gap-1 text-[11px] text-[var(--t-muted)]">
              <PrinterIcon className="w-3 h-3" />
              {workingPrinters.length} printer aktif
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-4 pt-0">
        <div className="rounded-lg border border-[var(--bd)] overflow-x-auto -webkit-overflow-scrolling-touch">
          <table className="w-full min-w-[660px]">
            <thead>
              <tr className="bg-[var(--surface)]">
                <th className="text-left text-xs font-medium text-[var(--t-body)] py-2 px-3">Product</th>
                <th className="text-left text-xs font-medium text-[var(--t-body)] py-2 px-3">Color</th>
                <th className="text-right text-xs font-medium text-[var(--t-body)] py-2 px-3">Qty</th>
                <th className="text-left text-xs font-medium text-[var(--t-body)] py-2 px-3">Status</th>
                <th className="text-left text-xs font-medium text-[var(--t-body)] py-2 px-3">Mulai</th>
                <th className="text-left text-xs font-medium text-[var(--t-body)] py-2 px-3">Printer</th>
                <th className="w-[90px] text-center text-xs font-medium text-[var(--t-body)] py-2 px-1">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <SkeletonRows />
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-6 text-sm text-[var(--t-body)]">
                    No items in production
                  </td>
                </tr>
              ) : (
                items.map((item) => {
                  const isCompleted = item.status === 'Completed';
                  const outstanding = item.qty - item.scannedQty - item.writeOffQty;
                  return (
                  <tr
                    key={item.id}
                    className="border-t border-[var(--surface-2)] hover:bg-[var(--surface-hover)] transition-colors"
                  >
                    <td className="py-2.5 px-3">
                      <span className="text-sm font-semibold text-[var(--t-heading)] bg-[var(--surface-2)] px-1.5 py-0.5 rounded">
                        {item.sku}
                      </span>
                      <p className="text-[11px] text-[var(--t-muted)] mt-0.5 truncate max-w-[80px]">{item.name}</p>
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="flex items-center gap-2">
                        <span
                          className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                          style={{ backgroundColor: item.colorHex }}
                        />
                        <div className="min-w-0">
                          <span className="text-sm text-[var(--t-body)]">{item.color}{item.type ? ` - ${item.type}` : ''}</span>
                          {item.note && (
                            <p className="text-[11px] text-[var(--warning)] font-medium truncate max-w-[100px]" title={item.orderNotesLabel ? `${item.orderNotesLabel}: ${item.note}` : item.note}>
                              {item.orderNotesLabel && <span className="font-semibold">{item.orderNotesLabel}: </span>}
                              {item.note}
                            </p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-right text-sm text-[var(--t-heading)] font-medium">
                      {item.qty}
                    </td>
                    <td className="py-2.5 px-3">
                      {isCompleted ? (
                        <Badge
                          variant="outline"
                          className="text-[11px] px-2 py-0.5 rounded-full font-semibold bg-[var(--info)]/10 text-[var(--info)] border-[var(--info)]/30 gap-1"
                        >
                          <ScanLine className="w-2.5 h-2.5" />
                          {item.scannedQty > 0 ? `Nunggu Scan (${item.scannedQty}/${item.qty})` : 'Nunggu Scan'}
                        </Badge>
                      ) : (
                        <div>
                          <Badge
                            variant="outline"
                            className="text-[11px] px-2 py-0.5 rounded-full font-semibold bg-[var(--accent-purple)]/10 text-[var(--accent-purple)] border-[var(--accent-purple)]/30 gap-1"
                          >
                            Lagi Diprint
                          </Badge>
                          {item.scheduledDoneAt && (
                            <p className="text-[11px] text-[var(--t-muted)] mt-0.5 flex items-center gap-1 whitespace-nowrap">
                              <Timer className="w-3 h-3 flex-shrink-0" />
                              {formatCountdown(item.scheduledDoneAt, nowMs)} tersisa
                            </p>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="py-2.5 px-3" title={formatExactTime(item.createdAt)}>
                      <span className="text-xs text-[var(--t-body)] whitespace-nowrap">{formatClockTime(item.createdAt)}</span>
                    </td>
                    <td className="py-2.5 px-3">
                      {isCompleted ? (
                        <Badge
                          variant="outline"
                          className="text-[11px] px-2 py-0.5 rounded-full font-semibold bg-[var(--highlight)]/10 text-[var(--t-heading)] border-[var(--highlight)]/30 gap-1"
                        >
                          {item.assignedTo || <span className="text-[var(--t-muted)]">—</span>}
                        </Badge>
                      ) : updatingPrinterId === item.id ? (
                        <div className="flex items-center gap-1">
                          <Loader2 className="w-3 h-3 animate-spin text-[var(--warning)]" />
                          <span className="text-[11px] text-[var(--t-muted)]">Updating...</span>
                        </div>
                      ) : allPrintersAvailable ? (
                        <Select
                          value={item.assignedTo || '__none__'}
                          onValueChange={(val) => {
                            if (val === '__none__') {
                              handlePrinterChange(item.id, '');
                            } else {
                              handlePrinterChange(item.id, val);
                            }
                          }}
                        >
                          <SelectTrigger className="h-7 text-[11px] bg-[var(--highlight)]/10 border-[var(--highlight)]/30 rounded-full px-2 py-0 w-auto min-w-[90px] max-w-[120px] focus:ring-1 focus:ring-[var(--highlight)]/40 hover:bg-[var(--highlight)]/20 transition-colors">
                            <SelectValue placeholder="Pilih Printer">
                              {item.assignedTo ? (
                                <span className="flex items-center gap-1 truncate">
                                  <Check className="w-2.5 h-2.5 text-[var(--brand)] flex-shrink-0" />
                                  <span className="truncate">{item.assignedTo}</span>
                                </span>
                              ) : (
                                <span className="text-[var(--t-muted)] truncate">Pilih Printer</span>
                              )}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">
                              <span className="text-[var(--t-muted)] italic">— Tanpa Printer —</span>
                            </SelectItem>
                            {workingPrinters.map((printer) => (
                              <SelectItem key={printer.id} value={printer.name}>
                                <span className="flex items-center gap-2">
                                  <span className="w-2 h-2 rounded-full flex-shrink-0 bg-[var(--success)]" />
                                  <span className="truncate">{printer.name}</span>
                                </span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Badge
                          variant="outline"
                          className="text-[11px] px-2 py-0.5 rounded-full font-semibold bg-[var(--highlight)]/10 text-[var(--t-heading)] border-[var(--highlight)]/30 gap-1"
                        >
                          {item.assignedTo || (
                            <span className="text-[var(--t-muted)]">—</span>
                          )}
                        </Badge>
                      )}
                    </td>
                    <td className="py-2.5 px-1">
                      {isCompleted ? (
                        writeOffConfirmId === item.id ? (
                          <div className="flex flex-col items-end gap-1">
                            <span className="text-[10px] text-[var(--t-muted)] text-right leading-tight">
                              Yakin {outstanding} pcs reject/hilang?
                            </span>
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => setWriteOffConfirmId(null)}
                                className="px-1.5 py-1 rounded-md text-[11px] text-[var(--t-body)] hover:bg-[var(--surface)] cursor-pointer"
                              >
                                Batal
                              </button>
                              <button
                                onClick={() => handleWriteOff(item.id)}
                                disabled={writingOffId === item.id}
                                className="px-1.5 py-1 rounded-md text-[11px] font-medium bg-[var(--danger)] hover:bg-[var(--danger-dark)] text-white cursor-pointer disabled:opacity-60 flex items-center gap-1"
                              >
                                {writingOffId === item.id ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                                Ya
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center justify-center">
                            <button
                              onClick={() => setWriteOffConfirmId(item.id)}
                              className="p-1.5 rounded-md bg-[var(--danger)]/10 hover:bg-[var(--danger)]/20 text-[var(--danger)] transition-colors cursor-pointer"
                              title={`Tandai Sisa Reject/Hilang (${outstanding})`}
                            >
                              <AlertTriangle className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )
                      ) : (
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => handleSendBack(item)}
                            disabled={sendingBackId === item.id}
                            className="p-1.5 rounded-md bg-[var(--accent-orange)]/10 hover:bg-[var(--accent-orange)]/20 text-[var(--accent-orange)] transition-colors cursor-pointer disabled:opacity-60"
                            title="Send back to Print Queue"
                          >
                            {sendingBackId === item.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <RotateCcw className="w-3.5 h-3.5" />
                            )}
                          </button>
                          <button
                            onClick={() => handleComplete(item.id)}
                            disabled={completingId === item.id || sendingBackId === item.id}
                            className="p-1.5 rounded-md bg-[var(--brand)] hover:bg-[var(--brand-dark)] text-white transition-colors cursor-pointer disabled:opacity-60"
                            title={item.scheduledDoneAt ? "Check — tandai selesai sebelum countdown habis" : "Mark as completed"}
                          >
                            {completingId === item.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Check className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
