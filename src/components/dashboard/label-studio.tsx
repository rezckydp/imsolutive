'use client';

import { useState } from 'react';
import { LabelLibrary } from '@/components/dashboard/label-library';
import { LabelTemplateEditor } from '@/components/dashboard/label-template-editor';

// Label Studio (ims-feature-label-studio-nav.md) — Editor Template is NOT a
// separate tab, it's reached via a button in Library's header and always
// comes back to Library. View is plain component state (not persisted), so
// a refresh always lands back on Library — exactly the spec'd default.
export function LabelStudioPage() {
  const [view, setView] = useState<'library' | 'editor'>('library');

  if (view === 'editor') {
    return <LabelTemplateEditor onBack={() => setView('library')} />;
  }
  return <LabelLibrary onOpenEditor={() => setView('editor')} />;
}
