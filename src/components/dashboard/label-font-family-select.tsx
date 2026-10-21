'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { LABEL_FONT_FAMILIES, DEFAULT_FONT_FAMILY } from '@/lib/label-render';

interface FontFamilySelectProps {
  label: string;
  value: string | undefined;
  onChange: (value: string) => void;
  disabled?: boolean;
}

// Curated Google Fonts dropdown — same list everywhere in Label Studio
// (Editor Template defaults AND Generate Label per-label override), never
// free text so nothing mistyped/unloadable ends up saved.
export function FontFamilySelect({ label, value, onChange, disabled }: FontFamilySelectProps) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-[var(--t-heading)]">{label}</Label>
      <Select value={value || DEFAULT_FONT_FAMILY} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger className="h-8 text-xs bg-[var(--card)] border-[var(--bd)]" style={{ fontFamily: `"${value || DEFAULT_FONT_FAMILY}", sans-serif` }}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {LABEL_FONT_FAMILIES.map((f) => (
            <SelectItem key={f} value={f} style={{ fontFamily: `"${f}", sans-serif` }}>
              {f}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
