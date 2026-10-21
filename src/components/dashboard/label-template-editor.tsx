'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { ArrowLeft, Magnet, RotateCcw, Save, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  LABEL_WIDTH_PX,
  LABEL_HEIGHT_PX,
  DEFAULT_TEMPLATE_ELEMENTS,
  DEFAULT_GUIDES,
  type TemplateElements,
  type Guides,
  type Box,
  type TextBox,
} from '@/lib/label-render';
import { FontSizeSlider } from '@/components/dashboard/label-font-slider';
import { FontFamilySelect } from '@/components/dashboard/label-font-family-select';

type ElementKey = 'qr' | 'sku' | 'name' | 'keterangan' | 'swatch';
const ELEMENT_LABELS: Record<ElementKey, string> = {
  qr: 'QR',
  sku: 'Kolom SKU',
  name: 'Kolom Nama Produk',
  keterangan: 'Keterangan',
  swatch: 'Warna',
};
const FONT_ELEMENTS: Array<'sku' | 'name' | 'keterangan' | 'swatch'> = ['sku', 'name', 'keterangan', 'swatch'];
const TOGGLE_ELEMENTS: Array<'keterangan' | 'swatch'> = ['keterangan', 'swatch'];

const RULER_W = 28;
const RULER_H = 24;
const PX_PER_MM = 12;
const SNAP_THRESHOLD = 6;
const MIN_SIZE = 20;

function clamp(v: number, min: number, max: number) {
  return Math.min(Math.max(v, min), max);
}

function applySnap(pos: number, size: number, guides: number[]): number {
  let best: { delta: number; dist: number } | null = null;
  for (const g of guides) {
    for (const edge of [pos, pos + size / 2, pos + size]) {
      const dist = Math.abs(edge - g);
      if (dist <= SNAP_THRESHOLD && (!best || dist < best.dist)) {
        best = { delta: g - edge, dist };
      }
    }
  }
  return best ? pos + best.delta : pos;
}

interface Props {
  onBack: () => void;
}

export function LabelTemplateEditor({ onBack }: Props) {
  const [elements, setElements] = useState<TemplateElements>(DEFAULT_TEMPLATE_ELEMENTS);
  const [guides, setGuides] = useState<Guides>(DEFAULT_GUIDES);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [snapOn, setSnapOn] = useState(true);

  const elementsRef = useRef(elements);
  const guidesRef = useRef(guides);
  const snapRef = useRef(snapOn);
  const canvasRef = useRef<HTMLDivElement>(null);
  useEffect(() => { elementsRef.current = elements; }, [elements]);
  useEffect(() => { guidesRef.current = guides; }, [guides]);
  useEffect(() => { snapRef.current = snapOn; }, [snapOn]);

  useEffect(() => {
    fetch('/api/label-templates')
      .then((res) => res.json())
      .then((data) => {
        if (data.elements) setElements(data.elements);
        if (data.guides) setGuides(data.guides);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/label-templates', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: 'default', elements, guides }),
      });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || 'Gagal menyimpan template');
        return;
      }
      alert('Template tersimpan.');
    } catch {
      alert('Gagal menyimpan template. Coba lagi.');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setElements(DEFAULT_TEMPLATE_ELEMENTS);
    setGuides(DEFAULT_GUIDES);
  };

  // ============ DRAG: move element ============
  const startMove = useCallback((e: React.PointerEvent, key: ElementKey) => {
    e.preventDefault();
    e.stopPropagation();
    const startClientX = e.clientX;
    const startClientY = e.clientY;
    const origin = elementsRef.current[key];
    const origX = origin.x;
    const origY = origin.y;
    const w = origin.w;
    const h = origin.h;

    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - startClientX;
      const dy = ev.clientY - startClientY;
      let nx = clamp(origX + dx, 0, LABEL_WIDTH_PX - w);
      let ny = clamp(origY + dy, 0, LABEL_HEIGHT_PX - h);
      if (snapRef.current) {
        nx = applySnap(nx, w, guidesRef.current.v);
        ny = applySnap(ny, h, guidesRef.current.h);
      }
      setElements((prev) => ({ ...prev, [key]: { ...prev[key], x: nx, y: ny } }));
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }, []);

  // ============ DRAG: resize element (qr keeps 1:1) ============
  const startResize = useCallback((e: React.PointerEvent, key: ElementKey) => {
    e.preventDefault();
    e.stopPropagation();
    const startClientX = e.clientX;
    const startClientY = e.clientY;
    const origin = elementsRef.current[key];
    const origW = origin.w;
    const origH = origin.h;
    const x = origin.x;
    const y = origin.y;
    const locked = key === 'qr';

    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - startClientX;
      const dy = ev.clientY - startClientY;
      let nw = clamp(origW + dx, MIN_SIZE, LABEL_WIDTH_PX - x);
      let nh = clamp(origH + dy, MIN_SIZE, LABEL_HEIGHT_PX - y);
      if (locked) {
        const side = Math.max(nw, nh);
        nw = Math.min(side, LABEL_WIDTH_PX - x, LABEL_HEIGHT_PX - y);
        nh = nw;
      }
      setElements((prev) => ({ ...prev, [key]: { ...prev[key], w: nw, h: nh } }));
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }, []);

  // ============ DRAG: guide line (existing) ============
  const startGuideDrag = useCallback((e: React.PointerEvent | PointerEvent, axis: 'v' | 'h', index: number) => {
    const onMove = (ev: PointerEvent) => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const pos = axis === 'v' ? ev.clientX - rect.left : ev.clientY - rect.top;
      setGuides((prev) => {
        const next = { ...prev, [axis]: [...prev[axis]] };
        next[axis][index] = pos;
        return next;
      });
    };
    const onUp = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      const rect = canvasRef.current?.getBoundingClientRect();
      const pos = rect ? (axis === 'v' ? ev.clientX - rect.left : ev.clientY - rect.top) : 0;
      if (!rect || pos < 0 || pos > (axis === 'v' ? LABEL_WIDTH_PX : LABEL_HEIGHT_PX)) {
        setGuides((prev) => ({ ...prev, [axis]: prev[axis].filter((_, i) => i !== index) }));
      }
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }, []);

  const removeGuide = (axis: 'v' | 'h', index: number) => {
    setGuides((prev) => ({ ...prev, [axis]: prev[axis].filter((_, i) => i !== index) }));
  };

  // ============ Create a new guide by dragging from the ruler ============
  const startNewGuideFromRuler = (e: React.PointerEvent, axis: 'v' | 'h') => {
    e.preventDefault();
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const pos = clamp(axis === 'v' ? e.clientX - rect.left : e.clientY - rect.top, 0, axis === 'v' ? LABEL_WIDTH_PX : LABEL_HEIGHT_PX);
    const index = guidesRef.current[axis].length;
    setGuides((prev) => ({ ...prev, [axis]: [...prev[axis], pos] }));
    startGuideDrag(e, axis, index);
  };

  const addCenterGuides = () => {
    setGuides((prev) => ({
      v: prev.v.includes(LABEL_WIDTH_PX / 2) ? prev.v : [...prev.v, LABEL_WIDTH_PX / 2],
      h: prev.h.includes(LABEL_HEIGHT_PX / 2) ? prev.h : [...prev.h, LABEL_HEIGHT_PX / 2],
    }));
  };

  const updateFontSize = (key: 'sku' | 'name' | 'keterangan' | 'swatch', value: number) => {
    setElements((prev) => ({ ...prev, [key]: { ...prev[key], fontSize: value } }));
  };

  const updateFontFamily = (key: 'sku' | 'name' | 'keterangan' | 'swatch', family: string) => {
    setElements((prev) => ({ ...prev, [key]: { ...prev[key], fontFamily: family } }));
  };

  const toggleShow = (key: 'keterangan' | 'swatch') => {
    setElements((prev) => ({ ...prev, [key]: { ...prev[key], show: !(prev[key].show ?? true) } }));
  };

  const hMarks = Array.from({ length: 11 }, (_, i) => i * 5); // 0..50mm
  const vMarks = Array.from({ length: 7 }, (_, i) => i * 5); // 0..30mm

  if (loading) {
    return <p className="text-sm text-[var(--t-muted)]">Memuat template...</p>;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={onBack} className="rounded-full h-8 px-3 text-xs">
            <ArrowLeft className="w-3.5 h-3.5 mr-1" />
            Kembali ke Library
          </Button>
          <h2 className="text-lg font-bold text-[var(--t-heading)]">Editor Template</h2>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSnapOn((s) => !s)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors cursor-pointer ${
              snapOn ? 'bg-[var(--brand)] text-white' : 'bg-[var(--surface)] text-[var(--t-body)]'
            }`}
          >
            <Magnet className="w-3.5 h-3.5" />
            Snap: {snapOn ? 'ON' : 'OFF'}
          </button>
          <Button variant="outline" size="sm" onClick={handleReset} className="rounded-full h-8 px-3 text-xs">
            <RotateCcw className="w-3.5 h-3.5 mr-1" />
            Reset ke Default
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={saving}
            className="bg-[var(--brand)] hover:bg-[var(--brand-dark)] text-white rounded-full h-8 px-4 text-xs disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Save className="w-3.5 h-3.5 mr-1" />}
            Simpan Template
          </Button>
        </div>
      </div>

      <div className="flex gap-6 flex-wrap items-start">
        {/* Canvas + rulers */}
        <div style={{ paddingLeft: RULER_W, paddingTop: RULER_H, position: 'relative' }}>
          {/* Top ruler */}
          <div
            onPointerDown={(e) => startNewGuideFromRuler(e, 'v')}
            className="absolute bg-[var(--surface)] border border-[var(--bd)] cursor-col-resize"
            style={{ left: RULER_W, top: 0, width: LABEL_WIDTH_PX, height: RULER_H }}
          >
            {hMarks.map((mm) => (
              <div key={mm} className="absolute bottom-0 flex flex-col items-center" style={{ left: mm * PX_PER_MM }}>
                {mm % 10 === 0 && <span className="text-[9px] text-[var(--t-muted)] leading-none mb-0.5">{mm}</span>}
                <div className={mm % 10 === 0 ? 'w-px bg-[var(--t-muted)] h-2.5' : 'w-px bg-[var(--t-muted)] h-1.5'} />
              </div>
            ))}
          </div>
          {/* Left ruler */}
          <div
            onPointerDown={(e) => startNewGuideFromRuler(e, 'h')}
            className="absolute bg-[var(--surface)] border border-[var(--bd)] cursor-row-resize"
            style={{ left: 0, top: RULER_H, width: RULER_W, height: LABEL_HEIGHT_PX }}
          >
            {vMarks.map((mm) => (
              <div key={mm} className="absolute right-0 flex items-center justify-end" style={{ top: mm * PX_PER_MM }}>
                {mm % 10 === 0 && <span className="text-[9px] text-[var(--t-muted)] leading-none mr-0.5">{mm}</span>}
                <div className={mm % 10 === 0 ? 'h-px bg-[var(--t-muted)] w-2.5' : 'h-px bg-[var(--t-muted)] w-1.5'} />
              </div>
            ))}
          </div>

          {/* Label canvas */}
          <div
            ref={canvasRef}
            className="relative bg-white border border-[var(--bd)] shadow-sm overflow-hidden"
            style={{ width: LABEL_WIDTH_PX, height: LABEL_HEIGHT_PX, marginLeft: RULER_W, marginTop: RULER_H }}
          >
            {(Object.keys(elements) as ElementKey[]).map((key) => {
              const box: Box = elements[key];
              const hidden = (key === 'keterangan' || key === 'swatch') && !((elements[key] as TextBox).show ?? true);
              return (
                <div
                  key={key}
                  onPointerDown={(e) => startMove(e, key)}
                  style={{ left: box.x, top: box.y, width: box.w, height: box.h, opacity: hidden ? 0.35 : 1 }}
                  className="absolute border-2 border-dashed border-[var(--brand)] bg-[var(--brand)]/5 flex items-center justify-center text-[11px] font-medium text-[var(--brand)] cursor-move select-none"
                >
                  {ELEMENT_LABELS[key]}
                  <div
                    onPointerDown={(e) => startResize(e, key)}
                    className="absolute -right-1.5 -bottom-1.5 w-3.5 h-3.5 bg-[var(--brand)] rounded-sm cursor-se-resize"
                  />
                </div>
              );
            })}

            {guides.v.map((x, i) => (
              <div
                key={`v-${i}`}
                onPointerDown={(e) => { e.stopPropagation(); startGuideDrag(e, 'v', i); }}
                onDoubleClick={() => removeGuide('v', i)}
                className="absolute top-0 bottom-0 w-px bg-[var(--danger)] cursor-ew-resize z-10 hover:w-0.5"
                style={{ left: x }}
              />
            ))}
            {guides.h.map((y, i) => (
              <div
                key={`h-${i}`}
                onPointerDown={(e) => { e.stopPropagation(); startGuideDrag(e, 'h', i); }}
                onDoubleClick={() => removeGuide('h', i)}
                className="absolute left-0 right-0 h-px bg-[var(--danger)] cursor-ns-resize z-10 hover:h-0.5"
                style={{ top: y }}
              />
            ))}
          </div>
        </div>

        {/* Side panel */}
        <div className="w-64 space-y-4 flex-shrink-0">
          <Button variant="outline" size="sm" onClick={addCenterGuides} className="w-full rounded-lg text-xs h-8">
            + Tambah Guide Tengah
          </Button>

          <div className="space-y-3 p-3 rounded-lg bg-[var(--surface-tint-3)] border border-[var(--bd)]">
            <p className="text-xs font-semibold text-[var(--t-heading)]">Font</p>
            {FONT_ELEMENTS.map((key) => (
              <div key={key} className="space-y-2 pb-2 border-b border-[var(--bd)] last:border-b-0 last:pb-0">
                <FontSizeSlider
                  label={ELEMENT_LABELS[key]}
                  value={elements[key].fontSize}
                  onChange={(v) => updateFontSize(key, v)}
                />
                <FontFamilySelect
                  label="Font Family"
                  value={elements[key].fontFamily}
                  onChange={(v) => updateFontFamily(key, v)}
                />
              </div>
            ))}
          </div>

          <div className="space-y-2 p-3 rounded-lg bg-[var(--surface-tint-3)] border border-[var(--bd)]">
            <p className="text-xs font-semibold text-[var(--t-heading)]">Tampilkan Elemen</p>
            {TOGGLE_ELEMENTS.map((key) => (
              <label key={key} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={elements[key].show ?? true}
                  onChange={() => toggleShow(key)}
                  className="w-4 h-4 rounded border-[var(--bd)] accent-[var(--brand)] cursor-pointer"
                />
                <span className="text-xs text-[var(--t-body)]">{ELEMENT_LABELS[key]}</span>
              </label>
            ))}
          </div>

          <p className="text-[11px] text-[var(--t-muted)]">
            Drag box buat atur posisi, drag handle pojok kanan-bawah buat resize. Tarik dari ruler buat bikin garis bantu baru; double-click garis buat hapus.
          </p>
        </div>
      </div>
    </div>
  );
}
