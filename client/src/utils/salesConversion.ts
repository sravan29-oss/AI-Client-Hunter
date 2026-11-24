import type { Pitch } from '../types';

export type DraftAction = 'approve' | 'record-send' | 'record-reply' | 'record-conversion';

export function availableDraftActions(pitch: Pick<Pitch, 'status' | 'approvedAt'>): DraftAction[] {
  switch (pitch.status) {
    case 'DRAFT': return [pitch.approvedAt ? 'record-send' : 'approve'];
    case 'SENT': return ['record-reply', 'record-conversion'];
    case 'REPLIED': return ['record-conversion'];
    default: return [];
  }
}

export function followUpDueAt(localValue: string, now = new Date()): string | undefined {
  const due = new Date(localValue);
  if (!Number.isFinite(due.getTime()) || due <= now) return undefined;
  return due.toISOString();
}

export function formatQuoteAmount(currency: 'INR' | 'USD', minor: number) {
  return new Intl.NumberFormat(currency === 'INR' ? 'en-IN' : 'en-US', { style: 'currency', currency }).format(minor / 100);
}
