'use client';

import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { FONT_SIZE_MIN, FONT_SIZE_MAX } from '@/lib/label-render';

interface FontSizeSliderProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}

// Shared by Editor Template (template defaults) and Generate Label
// (per-label override) — both MUST use the same 1-50 range
// (ims-feature-label-studio-template-editor.md point 5).
export function FontSizeSlider({ label, value, onChange, disabled }: FontSizeSliderProps) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label className="text-xs font-medium text-[var(--t-heading)]">{label}</Label>
        <span className="text-xs text-[var(--t-muted)] font-mono">{value}pt</span>
      </div>
      <Slider
        value={[value]}
        min={FONT_SIZE_MIN}
        max={FONT_SIZE_MAX}
        step={1}
        disabled={disabled}
        onValueChange={([v]) => onChange(v)}
      />
    </div>
  );
}
