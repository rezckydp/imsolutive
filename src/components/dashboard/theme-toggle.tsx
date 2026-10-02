'use client';

import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { Moon, Sun } from 'lucide-react';

// Toggles between light/dark. Guards against the SSR/client mismatch
// next-themes warns about by only trusting `theme` once mounted client-side.
export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return <div className="w-9 h-9 rounded-lg" aria-hidden />;
  }

  const isDark = theme === 'dark';

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      title={isDark ? 'Ganti ke Light Mode' : 'Ganti ke Dark Mode'}
      className="w-9 h-9 flex items-center justify-center rounded-lg text-[var(--t-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--t-heading)] transition-colors cursor-pointer"
    >
      {isDark ? <Sun className="w-[18px] h-[18px]" /> : <Moon className="w-[18px] h-[18px]" />}
    </button>
  );
}
