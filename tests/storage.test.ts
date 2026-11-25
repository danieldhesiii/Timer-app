import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PRESETS } from "../src/lib/presets";
import {
  addHistory,
  loadHistory,
  loadRoutines,
  saveRoutines,
  type HistoryEntry,
} from "../src/lib/storage";

let data: Map<string, string>;
let storage: {
  getItem: ReturnType<typeof vi.fn>;
  setItem: ReturnType<typeof vi.fn>;
};
const routinesKey = "tempo.routines.v1";
const historyKey = "tempo.history.v1";
const historyEntry = (index: number): HistoryEntry => ({
  id: `session-${index}`,
  routineId: "boxing",
  name: "Boxing rounds",
  category: "sports",
  completedAt: index + 1,
  elapsedSeconds: 90,
});

beforeEach(() => {
  data = new Map();
  storage = {
    getItem: vi.fn((key: string) => data.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      data.set(key, value);
    }),
  };
  vi.stubGlobal("localStorage", storage);
});
afterEach(() => vi.unstubAllGlobals());

describe("local routine persistence", () => {
  it("returns an empty library for malformed or unavailable browser storage", () => {
    data.set(routinesKey, "{broken");
    expect(loadRoutines()).toEqual([]);
    data.set(routinesKey, JSON.stringify({ routines: PRESETS }));
    expect(loadRoutines()).toEqual([]);
    storage.getItem.mockImplementation(() => {
      throw new Error("Access denied");
    });
    expect(loadRoutines()).toEqual([]);
    expect(loadHistory()).toEqual([]);
  });

  it("keeps valid records when another saved record is corrupt and removes duplicate IDs", () => {
    data.set(
      routinesKey,
      JSON.stringify([
        PRESETS[0],
        { ...PRESETS[1], nodes: [] },
        null,
        PRESETS[0],
        PRESETS[2],
      ]),
    );
    expect(loadRoutines().map((routine) => routine.id)).toEqual([
      PRESETS[0].id,
      PRESETS[2].id,
    ]);
  });

  it("validates an entire save before replacing the current library", () => {
    saveRoutines([PRESETS[0]]);
    const previous = data.get(routinesKey);
    expect(() => saveRoutines([{ ...PRESETS[1], nodes: [] }])).toThrow(
      "at least one stage",
    );
    expect(data.get(routinesKey)).toBe(previous);
    expect(loadRoutines()).toEqual([PRESETS[0]]);
  });

  it("reports quota failures as actionable errors instead of silently claiming success", () => {
    saveRoutines([PRESETS[0]]);
    storage.setItem.mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    expect(() => saveRoutines([PRESETS[1]])).toThrow(
      "could not save your changes",
    );
    expect(loadRoutines().map((routine) => routine.id)).toEqual([
      PRESETS[0].id,
    ]);
    expect(() => addHistory(historyEntry(1))).toThrow("export a backup");
  });
});

describe("completed session history", () => {
  it("filters corrupt entries, sorts newest first, and retains the latest 100", () => {
    const entries = Array.from({ length: 103 }, (_, index) =>
      historyEntry(index),
    );
    data.set(
      historyKey,
      JSON.stringify([
        ...entries,
        { ...historyEntry(999), elapsedSeconds: -1 },
        null,
        { ...historyEntry(1000), category: "unsupported" },
      ]),
    );
    const history = loadHistory();
    expect(history).toHaveLength(100);
    expect(history[0].id).toBe("session-102");
    expect(history.at(-1)?.id).toBe("session-3");
  });

  it("replaces a retried history entry by ID instead of recording the session twice", () => {
    addHistory(historyEntry(1));
    addHistory({ ...historyEntry(1), elapsedSeconds: 95 });
    expect(loadHistory()).toEqual([{ ...historyEntry(1), elapsedSeconds: 95 }]);
    expect(() =>
      addHistory({ ...historyEntry(2), completedAt: Number.NaN }),
    ).toThrow("could not be saved");
    expect(loadHistory()).toHaveLength(1);
  });
});
