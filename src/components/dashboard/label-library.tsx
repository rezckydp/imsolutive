'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Plus, Settings, Search, Download, Printer, Pencil, Trash2, Tag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  drawLabel,
  printLabelPages,
  DEFAULT_TEMPLATE_ELEMENTS,
  type TemplateElements,
} from '@/lib/label-render';
import { LabelGenerateDialog, type LabelData } from '@/components/dashboard/label-generate-dialog';

interface LabelRow extends LabelData {
  createdAt: string;
}

function LabelThumbnail({ label, template }: { label: LabelRow; template: TemplateElements }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    drawLabel(ctx, template, label).catch(() => {});
  }, [label, template]);

  return <canvas ref={canvasRef} width={600} height={360} className="w-full h-auto rounded border border-[var(--bd)] bg-white" />;
}

async function renderToDataUrl(label: LabelRow, template: TemplateElements): Promise<string> {
  const canvas = document.createElement('canvas');
  canvas.width = 600;
  canvas.height = 360;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  await drawLabel(ctx, template, label);
  return canvas.toDataURL('image/png');
}

interface Props {
  onOpenEditor: () => void;
}

export function LabelLibrary({ onOpenEditor }: Props) {
  const [labels, setLabels] = useState<LabelRow[]>([]);
  const [template, setTemplate] = useState<TemplateElements>(DEFAULT_TEMPLATE_ELEMENTS);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'produk' | 'material'>('all');
  const [generateOpen, setGenerateOpen] = useState(false);
  const [editingLabel, setEditingLabel] = useState<LabelRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<LabelRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchTemplate = useCallback(async () => {
    try {
      const res = await fetch('/api/label-templates');
      const data = await res.json();
      if (data.elements) setTemplate(data.elements);
    } catch {
      // keep default
    }
  }, []);

  const fetchLabels = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set('q', search.trim());
      if (typeFilter !== 'all') params.set('type', typeFilter);
      const res = await fetch(`/api/labels?${params.toString()}`);
      const data = await res.json();
      setLabels(data.labels || []);
    } catch {
      // keep whatever was loaded
    } finally {
      setLoading(false);
    }
  }, [search, typeFilter]);

  useEffect(() => { fetchTemplate(); }, [fetchTemplate]);
  useEffect(() => {
    const timer = setTimeout(fetchLabels, 250);
    return () => clearTimeout(timer);
  }, [fetchLabels]);

  const handleDownload = async (label: LabelRow) => {
    const dataUrl = await renderToDataUrl(label, template);
    if (!dataUrl) return;
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `label-${label.skuName.replace(/\s+/g, '-')}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const handlePrint = async (label: LabelRow) => {
    const dataUrl = await renderToDataUrl(label, template);
    if (!dataUrl) return;
    if (!printLabelPages([dataUrl])) {
      alert('Browser memblokir jendela print — izinkan pop-up buat QR Label dulu.');
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/labels/${deleteTarget.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || 'Gagal menghapus label');
        return;
      }
      setDeleteTarget(null);
      fetchLabels();
    } catch {
      alert('Gagal menghapus label. Coba lagi.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[var(--t-heading)]">QR Label</h1>
          <p className="text-sm text-[var(--t-body)] mt-1">Library Label QR — Produk & Material</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={() => { setEditingLabel(null); setGenerateOpen(true); }}
            className="bg-[var(--brand)] hover:bg-[var(--brand-dark)] text-white rounded-full px-4 h-9 text-sm"
          >
            <Plus className="w-4 h-4 mr-1.5" />
            Generate Label
          </Button>
          <Button onClick={onOpenEditor} variant="outline" className="rounded-full px-4 h-9 text-sm border-[var(--bd)]">
            <Settings className="w-4 h-4 mr-1.5" />
            Editor Template
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-2 mb-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--t-muted)]" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari Nama SKU, Produk, atau Warna..."
            className="pl-9 h-9 text-sm bg-[var(--surface)] border-[var(--bd)] rounded-full"
          />
        </div>
        <div className="flex items-center bg-[var(--surface)] rounded-lg p-0.5">
          {(['all', 'produk', 'material'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                typeFilter === t ? 'bg-[var(--card)] text-[var(--brand)] shadow-sm' : 'text-[var(--t-body)] hover:text-[var(--t-heading)]'
              }`}
            >
              {t === 'all' ? 'Semua' : t === 'produk' ? 'Produk' : 'Material'}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-[var(--t-muted)]">Memuat...</p>
      ) : labels.length === 0 ? (
        <div className="bg-[var(--card)] rounded-xl p-10 border border-[var(--bd)] text-center">
          <Tag className="w-10 h-10 text-[var(--t-muted)] mx-auto mb-2" />
          <p className="text-sm text-[var(--t-body)]">Belum ada label. Klik &quot;Generate Label&quot; buat bikin yang pertama.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {labels.map((label) => (
            <div key={label.id} className="bg-[var(--card)] rounded-xl border border-[var(--bd)] p-3 space-y-2">
              <LabelThumbnail label={label} template={template} />
              <div>
                <p className="text-sm font-semibold text-[var(--t-heading)] truncate">{label.skuName}</p>
                <p className="text-xs text-[var(--t-body)] truncate">{label.productName}{label.color ? ` — ${label.color}` : ''}</p>
                <p className="text-[11px] text-[var(--t-muted)]">{new Date(label.createdAt).toLocaleDateString('id-ID')}</p>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => handleDownload(label)} title="Download PNG" className="flex-1 p-1.5 rounded-lg hover:bg-[var(--surface)] text-[var(--t-body)] cursor-pointer flex items-center justify-center">
                  <Download className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => handlePrint(label)} title="Print" className="flex-1 p-1.5 rounded-lg hover:bg-[var(--surface)] text-[var(--t-body)] cursor-pointer flex items-center justify-center">
                  <Printer className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => { setEditingLabel(label); setGenerateOpen(true); }} title="Edit" className="flex-1 p-1.5 rounded-lg hover:bg-[var(--surface)] text-[var(--t-body)] cursor-pointer flex items-center justify-center">
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => setDeleteTarget(label)} title="Hapus" className="flex-1 p-1.5 rounded-lg hover:bg-[var(--danger)]/10 text-[var(--t-body)] hover:text-[var(--danger)] cursor-pointer flex items-center justify-center">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <LabelGenerateDialog
        open={generateOpen}
        onOpenChange={setGenerateOpen}
        editingLabel={editingLabel}
        template={template}
        onSaved={fetchLabels}
      />

      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-sm rounded-xl">
          <DialogHeader>
            <DialogTitle className="text-[var(--t-heading)]">Hapus Label</DialogTitle>
            <DialogDescription className="text-[var(--t-body)]">
              Hapus label <strong>{deleteTarget?.skuName}</strong>? Tindakan ini nggak bisa dibatalkan.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleting} className="rounded-full px-5">
              Cancel
            </Button>
            <Button
              onClick={handleDeleteConfirm}
              disabled={deleting}
              className="bg-[var(--danger)] hover:bg-[var(--danger-dark)] text-white rounded-full px-5 disabled:opacity-50"
            >
              {deleting ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
