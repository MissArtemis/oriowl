import type { Entry } from './types';

// A sync works from a snapshot; changes made while requests are pending win.
export function mergeNoteSync(snapshot: Entry[], synced: Entry[], current: Entry[]) {
  const before = new Map(snapshot.map((entry) => [entry.id, entry]));
  const result = new Map(synced.map((entry) => [entry.id, entry]));
  const present = new Set(current.map((entry) => entry.id));
  const merged = current.map((entry) =>
    entry === before.get(entry.id) ? result.get(entry.id) || entry : entry,
  );
  for (const entry of synced) {
    if (!before.has(entry.id) && !present.has(entry.id)) merged.push(entry);
  }
  return merged.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
