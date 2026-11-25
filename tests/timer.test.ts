import { describe, expect, it } from "vitest";
import {
  advancePlayback,
  compileRoutine,
  createPlayback,
  nextPlayback,
  parseRoutine,
  pausePlayback,
  playbackMetrics,
  startPlayback,
  summarizeRoutine,
  validateRoutine,
  type Routine,
  type Stage,
  type TimerNode,
} from "../src/lib/timer";

const stage = (
  id: string,
  duration: number,
  mode: "timed" | "manual" = "timed",
): Stage => ({
  kind: "stage",
  id,
  name: id,
  duration,
  mode,
  tone: "work",
  cue: "beep",
});
const routine = (nodes: TimerNode[]): Routine => ({
  id: "test",
  name: "Test session",
  description: "",
  category: "sports",
  nodes,
  sound: true,
  vibration: false,
  warningSeconds: 3,
  icon: "timer",
  color: "#c4ee76",
  createdAt: 0,
  updatedAt: 0,
});

describe("routine compilation", () => {
  it("expands nested repeats in order and gives every occurrence a stable unique ID", () => {
    const input = routine([
      stage("prepare", 5),
      {
        kind: "group",
        id: "rounds",
        name: "Round",
        repeats: 2,
        children: [
          stage("work", 10),
          {
            kind: "group",
            id: "rests",
            name: "Rest",
            repeats: 2,
            children: [stage("rest", 3)],
          },
        ],
      },
    ]);
    const stages = compileRoutine(input);
    expect(stages.map((item) => item.id)).toEqual([
      "prepare",
      "work",
      "rest",
      "rest",
      "work",
      "rest",
      "rest",
    ]);
    expect(new Set(stages.map((item) => item.instanceId)).size).toBe(7);
    expect(stages[3].groupPath).toEqual(["Round 1/2", "Rest 2/2"]);
    expect(compileRoutine(input).map((item) => item.instanceId)).toEqual(
      stages.map((item) => item.instanceId),
    );
    expect(summarizeRoutine(input)).toEqual({
      durationSeconds: 37,
      manualStages: 0,
      stageCount: 7,
    });
  });

  it("does not count a manual stage duration as scheduled time", () => {
    expect(
      summarizeRoutine(routine([stage("run", 0, "manual"), stage("rest", 30)])),
    ).toEqual({ durationSeconds: 30, manualStages: 1, stageCount: 2 });
  });
});

describe("timestamp-based playback", () => {
  it("catches up across several stages after a delayed callback without losing elapsed time", () => {
    const stages = compileRoutine(
      routine([stage("work", 10), stage("rest", 5), stage("work-2", 20)]),
    );
    const playing = startPlayback(createPlayback(), stages, 1_000);
    const caughtUp = advancePlayback(playing, stages, 18_300);
    expect(caughtUp).toMatchObject({
      status: "running",
      index: 2,
      stageElapsedMs: 2_300,
      elapsedMs: 17_300,
    });
    expect(playbackMetrics(caughtUp, stages).remainingMs).toBe(17_700);
  });

  it("moves to the next stage exactly on a boundary and finishes without adding a rest", () => {
    const stages = compileRoutine(
      routine([stage("work", 10), stage("rest", 5)]),
    );
    const start = startPlayback(createPlayback(), stages, 0);
    expect(advancePlayback(start, stages, 10_000)).toMatchObject({
      index: 1,
      stageElapsedMs: 0,
    });
    expect(advancePlayback(start, stages, 100_000)).toEqual({
      status: "completed",
      index: 2,
      stageElapsedMs: 0,
      elapsedMs: 15_000,
      anchorMs: null,
    });
  });

  it("excludes paused time and preserves sub-second progress when resumed", () => {
    const stages = compileRoutine(routine([stage("work", 20)]));
    const playing = startPlayback(createPlayback(), stages, 1_000);
    const paused = pausePlayback(playing, stages, 3_450);
    expect(paused).toMatchObject({
      status: "paused",
      stageElapsedMs: 2_450,
      elapsedMs: 2_450,
    });
    expect(advancePlayback(paused, stages, 50_000)).toBe(paused);
    const resumed = startPlayback(paused, stages, 50_000);
    expect(advancePlayback(resumed, stages, 51_200)).toMatchObject({
      status: "running",
      stageElapsedMs: 3_650,
      elapsedMs: 3_650,
    });
  });

  it("waits indefinitely at a manual stage and continues only when Next is chosen", () => {
    const stages = compileRoutine(
      routine([
        stage("prepare", 5),
        stage("run", 0, "manual"),
        stage("rest", 10),
      ]),
    );
    const playing = startPlayback(createPlayback(), stages, 0);
    const waiting = advancePlayback(playing, stages, 125_000);
    expect(waiting).toMatchObject({
      status: "running",
      index: 1,
      stageElapsedMs: 120_000,
      elapsedMs: 125_000,
    });
    expect(playbackMetrics(waiting, stages)).toMatchObject({
      remainingMs: 0,
      progress: 0,
    });
    const next = nextPlayback(waiting, stages, 130_000);
    expect(next).toMatchObject({
      index: 2,
      stageElapsedMs: 0,
      elapsedMs: 130_000,
    });
    expect(advancePlayback(next, stages, 140_000)).toMatchObject({
      status: "completed",
      elapsedMs: 140_000,
    });
  });

  it("counts actual time when skipping and keeps a paused session paused", () => {
    const stages = compileRoutine(
      routine([stage("work", 30), stage("rest", 10)]),
    );
    const playing = startPlayback(createPlayback(), stages, 0);
    const paused = pausePlayback(playing, stages, 4_000);
    const skipped = nextPlayback(paused, stages, 50_000);
    expect(skipped).toMatchObject({
      status: "paused",
      index: 1,
      elapsedMs: 4_000,
      stageElapsedMs: 0,
    });
    expect(nextPlayback(skipped, stages, 60_000)).toMatchObject({
      status: "completed",
      elapsedMs: 4_000,
    });
  });

  it("ignores a backwards clock sample without counting negative time twice", () => {
    const stages = compileRoutine(routine([stage("work", 30)]));
    const playing = startPlayback(createPlayback(), stages, 10_000);
    const forward = advancePlayback(playing, stages, 12_000);
    const backward = advancePlayback(forward, stages, 11_000);
    expect(backward.elapsedMs).toBe(2_000);
    expect(advancePlayback(backward, stages, 13_000).elapsedMs).toBe(3_000);
  });

  it("allows replay after completion and handles an empty compiled sequence safely", () => {
    const stages = compileRoutine(routine([stage("work", 1)]));
    const finished = advancePlayback(
      startPlayback(createPlayback(), stages, 0),
      stages,
      1_000,
    );
    expect(startPlayback(finished, stages, 10_000)).toMatchObject({
      status: "running",
      index: 0,
      elapsedMs: 0,
    });
    expect(startPlayback(createPlayback(), [], 0).status).toBe("completed");
  });
});

describe("untrusted routine validation", () => {
  it("rejects reused node IDs across stages and groups, including nested children", () => {
    const duplicateStages = routine([stage("same", 10), stage("same", 20)]);
    expect(validateRoutine(duplicateStages).join(" ")).toContain("unique ID");
    expect(() => parseRoutine(duplicateStages)).toThrow("ID is already used");

    const duplicateGroupAndStage = routine([
      {
        kind: "group",
        id: "same",
        name: "Round",
        repeats: 2,
        children: [stage("same", 10)],
      },
    ]);
    expect(validateRoutine(duplicateGroupAndStage).join(" ")).toContain(
      "unique ID",
    );

    const duplicateGroups = routine([
      {
        kind: "group",
        id: "same",
        name: "First",
        repeats: 1,
        children: [stage("first-work", 10)],
      },
      {
        kind: "group",
        id: "same",
        name: "Second",
        repeats: 1,
        children: [stage("second-work", 10)],
      },
    ]);
    expect(validateRoutine(duplicateGroups).join(" ")).toContain("unique ID");
  });

  it("rejects missing stages and invalid numbers instead of hanging during expansion", () => {
    expect(validateRoutine(routine([])).join(" ")).toContain(
      "at least one stage",
    );
    expect(
      validateRoutine(routine([stage("bad", Number.NaN)])).join(" "),
    ).toContain("whole seconds");
    expect(
      validateRoutine(
        routine([
          {
            kind: "group",
            id: "g",
            name: "Round",
            repeats: Infinity,
            children: [stage("work", 1)],
          },
        ]),
      ).join(" "),
    ).toContain("1 to 99");
    expect(validateRoutine(routine([stage("bad", 0)])).length).toBeGreaterThan(
      0,
    );
  });

  it("caps exponential repeats before trying to allocate their stages", () => {
    const input = routine([
      {
        kind: "group",
        id: "outer",
        name: "Outer",
        repeats: 99,
        children: [
          {
            kind: "group",
            id: "inner",
            name: "Inner",
            repeats: 99,
            children: [stage("work", 1)],
          },
        ],
      },
    ]);
    expect(validateRoutine(input).join(" ")).toContain("2,000 total stages");
    expect(() => compileRoutine(input)).toThrow("Reduce repeats");
  });

  it("rejects too deeply nested groups, including a cyclic object", () => {
    const group = {
      kind: "group" as const,
      id: "cycle",
      name: "Cycle",
      repeats: 1,
      children: [] as TimerNode[],
    };
    group.children.push(group);
    expect(validateRoutine(routine([group])).join(" ")).toContain("4 levels");
  });

  it("cleans supported imports without retaining unknown fields or sharing mutable children", () => {
    const source = {
      ...routine([stage("work", 30)]),
      name: "  Boxing  ",
      injected: "<script>",
    };
    const clean = parseRoutine(source);
    expect(clean.name).toBe("Boxing");
    expect(clean).not.toHaveProperty("injected");
    expect(clean.nodes[0]).not.toBe(source.nodes[0]);
    expect(() => parseRoutine({ name: "missing everything" })).toThrow(
      "Routine ID",
    );
  });
});
