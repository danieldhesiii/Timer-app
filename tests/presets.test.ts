import { describe, expect, it } from "vitest";
import {
  cloneRoutine,
  createBlankRoutine,
  getPreset,
  PRESETS,
} from "../src/lib/presets";
import {
  compileRoutine,
  validateRoutine,
  type TimerNode,
} from "../src/lib/timer";

function editableIds(nodes: TimerNode[]): string[] {
  return nodes.flatMap((node) =>
    node.kind === "group"
      ? [node.id, ...editableIds(node.children)]
      : [node.id],
  );
}

describe("editable preset library", () => {
  it("ships valid, uniquely identified routines in both requested categories", () => {
    expect(new Set(PRESETS.map((routine) => routine.id)).size).toBe(
      PRESETS.length,
    );
    expect(new Set(PRESETS.map((routine) => routine.category))).toEqual(
      new Set(["sports", "study"]),
    );
    for (const routine of PRESETS) {
      expect(validateRoutine(routine), routine.name).toEqual([]);
      const ids = editableIds(routine.nodes);
      expect(new Set(ids).size, routine.name).toBe(ids.length);
    }
    expect(getPreset("missing")).toBeUndefined();
  });

  it("finishes boxing and MMA on their final work round without inventing a recovery period", () => {
    for (const [id, rounds] of [
      ["boxing", 6],
      ["mma", 5],
    ] as const) {
      const stages = compileRoutine(getPreset(id)!);
      expect(stages.filter((stage) => stage.tone === "work")).toHaveLength(
        rounds,
      );
      expect(stages.filter((stage) => stage.tone === "rest")).toHaveLength(
        rounds - 1,
      );
      expect(stages.at(-1)?.tone).toBe("work");
    }
  });

  it("lets the athlete finish HYROX runs and stations manually", () => {
    const stages = compileRoutine(getPreset("hyrox")!);
    expect(stages[0].tone).toBe("prepare");
    expect(stages.slice(1)).toHaveLength(16);
    expect(stages.slice(1).every((stage) => stage.mode === "manual")).toBe(
      true,
    );
    expect(
      stages.filter((stage) => stage.name.startsWith("Run ")),
    ).toHaveLength(8);
  });

  it("creates valid blank routines appropriate to the selected category", () => {
    const sports = createBlankRoutine("sports");
    const study = createBlankRoutine("study");
    expect(validateRoutine(sports)).toEqual([]);
    expect(validateRoutine(study)).toEqual([]);
    expect(sports.id).not.toBe(study.id);
    expect(sports.nodes[0]).toMatchObject({ kind: "stage", tone: "work" });
    expect(study.nodes[0]).toMatchObject({ kind: "stage", tone: "focus" });
  });

  it("duplicates nested stages independently with new editable IDs", () => {
    const source = getPreset("boxing")!;
    const original = structuredClone(source);
    const clone = cloneRoutine(source);
    expect(clone.id).not.toBe(source.id);
    expect(
      editableIds(clone.nodes).every(
        (id) => !editableIds(source.nodes).includes(id),
      ),
    ).toBe(true);
    const group = clone.nodes.find((node) => node.kind === "group");
    expect(group?.kind).toBe("group");
    if (group?.kind === "group") {
      group.children[0].name = "An independent edit";
      group.repeats = 2;
    }
    expect(source).toEqual(original);
  });

  it("keeps a duplicate of a maximum-length imported name valid and savable", () => {
    const source = { ...PRESETS[0], name: "A".repeat(120) };
    expect(validateRoutine(source)).toEqual([]);
    const clone = cloneRoutine(source);
    expect(validateRoutine(clone)).toEqual([]);
    expect(clone.name.length).toBeLessThanOrEqual(120);
  });
});
