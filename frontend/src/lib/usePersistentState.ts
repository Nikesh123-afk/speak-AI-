import { useEffect, useState } from 'react';

function read<T>(key: string, initial: T): T {
  try {
    const raw = window.sessionStorage.getItem(key);
    return raw === null ? initial : (JSON.parse(raw) as T);
  } catch {
    return initial;
  }
}

/**
 * useState that survives a reload or an accidental navigation within this tab.
 * Session storage only: answers never outlive the tab, and nothing is shared between tabs.
 */
export function usePersistentState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => read(key, initial));
  useEffect(() => {
    try {
      if (value === null || value === undefined) window.sessionStorage.removeItem(key);
      else window.sessionStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Storage can be full or blocked (private mode); the state still works in memory.
    }
  }, [key, value]);
  return [value, setValue] as const;
}

/** Warns before closing or reloading the tab while `active`. */
export function useLeaveWarning(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [active]);
}
