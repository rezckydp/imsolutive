'use client';

import { useState } from 'react';
import { Calendar as CalendarIcon, ChevronDown } from 'lucide-react';
import { DateRange } from 'react-day-picker';
import {
  startOfToday,
  subDays,
  startOfWeek,
  startOfMonth,
  endOfMonth,
  subMonths,
  format,
  differenceInCalendarDays,
} from 'date-fns';
import { id as idLocale } from 'date-fns/locale';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Button } from '@/components/ui/button';

export type SimpleDateRange = { from: Date; to: Date } | null;

interface DateRangePickerProps {
  value: SimpleDateRange;
  onChange: (range: SimpleDateRange) => void;
  maxDays?: number;
  allTimeLabel?: string;
}

const PRESETS = (): { label: string; range: () => { from: Date; to: Date } }[] => {
  const today = startOfToday();
  return [
    { label: 'Hari ini', range: () => ({ from: today, to: today }) },
    { label: 'Kemarin', range: () => ({ from: subDays(today, 1), to: subDays(today, 1) }) },
    { label: 'Minggu ini', range: () => ({ from: startOfWeek(today, { weekStartsOn: 1 }), to: today }) },
    { label: 'Bulan ini', range: () => ({ from: startOfMonth(today), to: today }) },
    { label: '7 hari terakhir', range: () => ({ from: subDays(today, 6), to: today }) },
    { label: '14 hari terakhir', range: () => ({ from: subDays(today, 13), to: today }) },
    { label: '30 hari terakhir', range: () => ({ from: subDays(today, 29), to: today }) },
    {
      label: 'Bulan lalu',
      range: () => ({ from: startOfMonth(subMonths(today, 1)), to: endOfMonth(subMonths(today, 1)) }),
    },
  ];
};

export function DateRangePicker({ value, onChange, maxDays = 366, allTimeLabel = 'Semua Waktu' }: DateRangePickerProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<DateRange | undefined>(value ?? undefined);

  const label = value
    ? value.from.getTime() === value.to.getTime()
      ? format(value.from, 'd MMM yyyy', { locale: idLocale })
      : `${format(value.from, 'd MMM yyyy', { locale: idLocale })} – ${format(value.to, 'd MMM yyyy', { locale: idLocale })}`
    : allTimeLabel;

  const dayCount = value ? differenceInCalendarDays(value.to, value.from) + 1 : 0;

  const applyPreset = (range: { from: Date; to: Date }) => {
    setDraft(range);
    onChange(range);
    setOpen(false);
  };

  const handleCalendarSelect = (range: DateRange | undefined) => {
    if (range?.from && range?.to && differenceInCalendarDays(range.to, range.from) + 1 > maxDays) {
      // Clamp to the max allowed window from the selected start date
      range = { from: range.from, to: subDays(range.from, -(maxDays - 1)) };
    }
    setDraft(range);
    if (range?.from && range?.to) {
      onChange({ from: range.from, to: range.to });
    }
  };

  const handleReset = () => {
    setDraft(undefined);
    onChange(null);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (o) setDraft(value ?? undefined); }}>
      <PopoverTrigger asChild>
        <button className="flex items-center gap-1.5 h-8 px-2.5 text-xs rounded-lg bg-[var(--card)] border border-[var(--bd)] text-[var(--t-body)] hover:border-[var(--brand)]/40 transition-colors cursor-pointer">
          <CalendarIcon className="w-3.5 h-3.5 text-[var(--t-muted)]" />
          <span className="max-w-[160px] truncate">{label}</span>
          <ChevronDown className="w-3 h-3 text-[var(--t-subtle)]" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-auto p-0 rounded-xl overflow-hidden">
        <div className="flex flex-col sm:flex-row">
          {/* Presets */}
          <div className="flex sm:flex-col gap-0.5 p-2 border-b sm:border-b-0 sm:border-r border-[var(--surface-2)] overflow-x-auto sm:w-[150px] flex-shrink-0">
            {PRESETS().map((p) => (
              <button
                key={p.label}
                onClick={() => applyPreset(p.range())}
                className="text-left text-xs px-2.5 py-1.5 rounded-lg text-[var(--t-body)] hover:bg-[var(--surface)] hover:text-[var(--t-heading)] transition-colors cursor-pointer whitespace-nowrap"
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Calendar */}
          <div className="p-2">
            <Calendar
              mode="range"
              numberOfMonths={2}
              selected={draft}
              onSelect={handleCalendarSelect}
              defaultMonth={draft?.from ?? subMonths(startOfToday(), 1)}
              locale={idLocale}
            />
            <div className="flex items-center justify-between px-2 pb-1 pt-1 border-t border-[var(--surface-2)] mt-1">
              <span className="text-[11px] text-[var(--t-muted)] flex items-center gap-1">
                <CalendarIcon className="w-3 h-3" />
                {value
                  ? `${format(value.from, 'd MMM yyyy', { locale: idLocale })} – ${format(value.to, 'd MMM yyyy', { locale: idLocale })} (${dayCount} hari)`
                  : 'Belum ada range dipilih'}
              </span>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-[var(--t-subtle)]">Maks {maxDays} hari</span>
                <Button variant="ghost" size="sm" onClick={handleReset} className="h-6 text-[11px] px-2 text-[var(--brand)] hover:bg-[var(--brand)]/10">
                  Reset
                </Button>
              </div>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
