export type Category = "sports" | "study";
export type Tone = "work" | "rest" | "focus" | "prepare";
export type Cue = "bell" | "beep" | "soft" | "none";

export interface Stage {
  kind: "stage";
  id: string;
  name: string;
  /** Seconds. Manual stages may use zero because they finish with Next. */
  duration: number;
  mode: "timed" | "manual";
  tone: Tone;
  cue: Cue;
}

export interface Group {
  kind: "group";
  id: string;
  name: string;
  repeats: number;
  children: TimerNode[];
}

export type TimerNode = Stage | Group;

export interface Routine {
  id: string;
  name: string;
  description: string;
  category: Category;
  nodes: TimerNode[];
  sound: boolean;
  vibration: boolean;
  warningSeconds: number;
  icon: string;
  color: string;
  createdAt: number;
  updatedAt: number;
}

export interface FlatStage extends Stage {
  instanceId: string;
  groupPath: string[];
}

export const MAX_EXPANDED_STAGES = 2_000;
export const MAX_GROUP_DEPTH = 4;

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Validate untrusted imports before expanding them or rendering their contents. */
export function validateRoutine(value: unknown): string[] {
  const errors: string[] = [];
  const add = (message: string) => {
    if (errors.length < 25) errors.push(message);
  };
  const string = (item: unknown, label: string, max: number, empty = false) => {
    if (
      typeof item !== "string" ||
      (!empty && !item.trim()) ||
      item.length > max
    ) {
      add(
        `${label} must be ${empty ? "at most" : `between 1 and`} ${max} characters.`,
      );
    }
  };

  if (!record(value))
    return ["The imported file must contain a timer routine."];
  string(value.id, "Routine ID", 128);
  string(value.name, "Routine name", 120);
  string(value.description, "Description", 2_000, true);
  string(value.icon, "Icon", 80);
  string(value.color, "Color", 60);
  if (value.category !== "sports" && value.category !== "study") {
    add("Choose Sports or Study as the routine category.");
  }
  if (typeof value.sound !== "boolean") add("Sound must be on or off.");
  if (typeof value.vibration !== "boolean") add("Vibration must be on or off.");
  if (
    !Number.isInteger(value.warningSeconds) ||
    (value.warningSeconds as number) < 0 ||
    (value.warningSeconds as number) > 60
  ) {
    add("The warning must be a whole number from 0 to 60 seconds.");
  }
  for (const field of ["createdAt", "updatedAt"]) {
    if (
      typeof value[field] !== "number" ||
      !Number.isFinite(value[field]) ||
      (value[field] as number) < 0
    ) {
      add(`${field} must be a valid timestamp.`);
    }
  }

  let inspected = 0;
  const nodeIds = new Set<string>();
  const visit = (nodes: unknown, depth: number, label: string): number => {
    if (!Array.isArray(nodes) || nodes.length === 0) {
      add(`${label} needs at least one stage.`);
      return 0;
    }
    if (nodes.length > MAX_EXPANDED_STAGES) {
      add(
        `A routine can contain at most ${MAX_EXPANDED_STAGES.toLocaleString("en-GB")} stages after repeats.`,
      );
      return MAX_EXPANDED_STAGES + 1;
    }
    let count = 0;
    for (const [index, node] of nodes.entries()) {
      if (++inspected > MAX_EXPANDED_STAGES) {
        add("This routine contains too many editable stages.");
        return MAX_EXPANDED_STAGES + 1;
      }
      const nodeLabel = `${label}, item ${index + 1}`;
      if (!record(node)) {
        add(`${nodeLabel} must be a stage or repeat group.`);
        continue;
      }
      string(node.id, `${nodeLabel} ID`, 128);
      if (typeof node.id === "string" && node.id.trim()) {
        if (nodeIds.has(node.id)) {
          add(
            `${nodeLabel} ID is already used. Give every stage and repeat group a unique ID.`,
          );
        }
        nodeIds.add(node.id);
      }
      string(node.name, `${nodeLabel} name`, 120);
      if (node.kind === "stage") {
        const manual = node.mode === "manual";
        if (node.mode !== "timed" && !manual)
          add(`${nodeLabel} needs a timed or manual finish.`);
        if (
          !Number.isInteger(node.duration) ||
          (node.duration as number) < (manual ? 0 : 1) ||
          (node.duration as number) > 86_400
        ) {
          add(
            `${nodeLabel} duration must be ${manual ? "0" : "1"} to 86,400 whole seconds.`,
          );
        }
        if (
          !["work", "rest", "focus", "prepare"].includes(node.tone as string)
        ) {
          add(`${nodeLabel} has an unsupported stage type.`);
        }
        if (!["bell", "beep", "soft", "none"].includes(node.cue as string)) {
          add(`${nodeLabel} has an unsupported sound.`);
        }
        count += 1;
      } else if (node.kind === "group") {
        if (depth >= MAX_GROUP_DEPTH) {
          add(
            `Repeat groups can be nested at most ${MAX_GROUP_DEPTH} levels deep.`,
          );
          continue;
        }
        const validRepeats =
          Number.isInteger(node.repeats) &&
          (node.repeats as number) >= 1 &&
          (node.repeats as number) <= 99;
        if (!validRepeats)
          add(`${nodeLabel} repeats must be a whole number from 1 to 99.`);
        const children = visit(node.children, depth + 1, `${nodeLabel} group`);
        count += children * (validRepeats ? (node.repeats as number) : 1);
      } else {
        add(`${nodeLabel} must be a stage or repeat group.`);
      }
      // Saturate the count: hostile nested repeats cannot make expansion enormous.
      count = Math.min(MAX_EXPANDED_STAGES + 1, count);
    }
    return count;
  };

  const count = visit(value.nodes, 0, "Routine");
  if (count > MAX_EXPANDED_STAGES) {
    add(
      `Reduce repeats to keep the routine within ${MAX_EXPANDED_STAGES.toLocaleString("en-GB")} total stages.`,
    );
  }
  return errors;
}

/** Return a clean copy containing only supported fields. */
export function parseRoutine(value: unknown): Routine {
  const errors = validateRoutine(value);
  if (errors.length) throw new Error(errors.join(" "));
  const routine = value as Routine;
  const copyNode = (node: TimerNode): TimerNode =>
    node.kind === "group"
      ? {
          kind: "group",
          id: node.id,
          name: node.name.trim(),
          repeats: node.repeats,
          children: node.children.map(copyNode),
        }
      : {
          kind: "stage",
          id: node.id,
          name: node.name.trim(),
          duration: node.duration,
          mode: node.mode,
          tone: node.tone,
          cue: node.cue,
        };
  return {
    id: routine.id,
    name: routine.name.trim(),
    description: routine.description.trim(),
    category: routine.category,
    nodes: routine.nodes.map(copyNode),
    sound: routine.sound,
    vibration: routine.vibration,
    warningSeconds: routine.warningSeconds,
    icon: routine.icon,
    color: routine.color,
    createdAt: routine.createdAt,
    updatedAt: routine.updatedAt,
  };
}

export function compileRoutine(routine: Routine): FlatStage[] {
  const clean = parseRoutine(routine);
  const stages: FlatStage[] = [];
  const visit = (nodes: TimerNode[], path: string[], groups: string[]) => {
    nodes.forEach((node, index) => {
      const nextPath = [...path, `${index}:${node.id}`];
      if (node.kind === "stage") {
        stages.push({
          ...node,
          instanceId: nextPath.join("/"),
          groupPath: [...groups],
        });
      } else {
        for (let repeat = 0; repeat < node.repeats; repeat++) {
          visit(
            node.children,
            [...nextPath, String(repeat)],
            [...groups, `${node.name} ${repeat + 1}/${node.repeats}`],
          );
        }
      }
    });
  };
  visit(clean.nodes, [], []);
  return stages;
}

export function summarizeRoutine(routine: Routine) {
  const stages = compileRoutine(routine);
  return {
    durationSeconds: stages.reduce(
      (sum, stage) => sum + (stage.mode === "timed" ? stage.duration : 0),
      0,
    ),
    manualStages: stages.filter((stage) => stage.mode === "manual").length,
    stageCount: stages.length,
  };
}

export type PlaybackStatus = "ready" | "running" | "paused" | "completed";

export interface Playback {
  status: PlaybackStatus;
  index: number;
  stageElapsedMs: number;
  elapsedMs: number;
  /** Last real-world timestamp sampled; paused time is never counted. */
  anchorMs: number | null;
}

export function createPlayback(): Playback {
  return {
    status: "ready",
    index: 0,
    stageElapsedMs: 0,
    elapsedMs: 0,
    anchorMs: null,
  };
}

/** Advance using elapsed time, including time between throttled browser callbacks. */
export function advancePlayback(
  playback: Playback,
  stages: FlatStage[],
  now: number,
): Playback {
  if (playback.status !== "running" || playback.anchorMs === null)
    return playback;
  const anchorMs = Math.max(playback.anchorMs, now);
  let delta = anchorMs - playback.anchorMs;
  let { index, stageElapsedMs, elapsedMs } = playback;
  while (index < stages.length) {
    const stage = stages[index];
    if (stage.mode === "manual") {
      stageElapsedMs += delta;
      elapsedMs += delta;
      return { status: "running", index, stageElapsedMs, elapsedMs, anchorMs };
    }
    const available = Math.max(0, stage.duration * 1_000 - stageElapsedMs);
    if (delta < available) {
      stageElapsedMs += delta;
      elapsedMs += delta;
      return { status: "running", index, stageElapsedMs, elapsedMs, anchorMs };
    }
    delta -= available;
    elapsedMs += available;
    index += 1;
    stageElapsedMs = 0;
  }
  return {
    status: "completed",
    index: stages.length,
    stageElapsedMs: 0,
    elapsedMs,
    anchorMs: null,
  };
}

export function startPlayback(
  playback: Playback,
  stages: FlatStage[],
  now: number,
): Playback {
  if (playback.status === "running")
    return advancePlayback(playback, stages, now);
  if (!stages.length) return { ...createPlayback(), status: "completed" };
  const base = playback.status === "completed" ? createPlayback() : playback;
  return { ...base, status: "running", anchorMs: now };
}

export function pausePlayback(
  playback: Playback,
  stages: FlatStage[],
  now: number,
): Playback {
  if (playback.status !== "running") return playback;
  const next = advancePlayback(playback, stages, now);
  return next.status === "completed"
    ? next
    : { ...next, status: "paused", anchorMs: null };
}

export function nextPlayback(
  playback: Playback,
  stages: FlatStage[],
  now: number,
): Playback {
  const next = advancePlayback(playback, stages, now);
  if (next.status === "completed") return next;
  const index = next.index + 1;
  if (index >= stages.length) {
    return {
      ...next,
      status: "completed",
      index: stages.length,
      stageElapsedMs: 0,
      anchorMs: null,
    };
  }
  return {
    ...next,
    index,
    stageElapsedMs: 0,
    anchorMs: next.status === "running" ? now : null,
  };
}

export function playbackMetrics(playback: Playback, stages: FlatStage[]) {
  const currentStage = stages[playback.index];
  const remainingMs =
    currentStage?.mode === "timed"
      ? Math.max(0, currentStage.duration * 1_000 - playback.stageElapsedMs)
      : 0;
  const progress =
    playback.status === "completed"
      ? 1
      : currentStage?.mode === "timed"
        ? Math.min(1, playback.stageElapsedMs / (currentStage.duration * 1_000))
        : 0;
  return { currentStage, remainingMs, progress };
}
