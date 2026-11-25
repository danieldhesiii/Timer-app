import { parseRoutine, type Category, type Routine } from "./timer";

const ROUTINES_KEY = "tempo.routines.v1";
const HISTORY_KEY = "tempo.history.v1";
const MAX_HISTORY = 100;

export interface HistoryEntry {
  id: string;
  routineId: string;
  name: string;
  category: Category;
  completedAt: number;
  elapsedSeconds: number;
}

function readArray(key: string): unknown[] {
  try {
    const raw = globalThis.localStorage?.getItem(key);
    if (!raw) return [];
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function persist(key: string, value: unknown): void {
  try {
    if (!globalThis.localStorage) throw new Error("Storage unavailable");
    globalThis.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    throw new Error(
      "This browser could not save your changes. Free some device storage or export a backup before closing the app.",
    );
  }
}

export function loadRoutines(): Routine[] {
  const routines: Routine[] = [];
  const seen = new Set<string>();
  for (const value of readArray(ROUTINES_KEY)) {
    try {
      const routine = parseRoutine(value);
      if (!seen.has(routine.id)) {
        routines.push(routine);
        seen.add(routine.id);
      }
    } catch {
      // One corrupt record must not hide the rest of the user's routines.
    }
  }
  return routines;
}

export function saveRoutines(routines: Routine[]): void {
  const valid = routines.map((routine) => parseRoutine(routine));
  persist(ROUTINES_KEY, valid);
}

function isHistoryEntry(value: unknown): value is HistoryEntry {
  if (!value || typeof value !== "object") return false;
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.id === "string" &&
    entry.id.length > 0 &&
    entry.id.length <= 200 &&
    typeof entry.routineId === "string" &&
    entry.routineId.length <= 200 &&
    typeof entry.name === "string" &&
    entry.name.length > 0 &&
    entry.name.length <= 120 &&
    (entry.category === "sports" || entry.category === "study") &&
    typeof entry.completedAt === "number" &&
    Number.isFinite(entry.completedAt) &&
    entry.completedAt > 0 &&
    typeof entry.elapsedSeconds === "number" &&
    Number.isFinite(entry.elapsedSeconds) &&
    entry.elapsedSeconds >= 0
  );
}

export function loadHistory(): HistoryEntry[] {
  return readArray(HISTORY_KEY)
    .filter(isHistoryEntry)
    .sort((a, b) => b.completedAt - a.completedAt)
    .slice(0, MAX_HISTORY);
}

export function addHistory(entry: HistoryEntry): void {
  if (!isHistoryEntry(entry))
    throw new Error("This completed session could not be saved.");
  persist(
    HISTORY_KEY,
    [entry, ...loadHistory().filter((item) => item.id !== entry.id)].slice(
      0,
      MAX_HISTORY,
    ),
  );
}
