import type { Category, Group, Routine, Stage, TimerNode, Tone } from "./timer";

const PRESET_DATE = Date.UTC(2026, 10, 25);
let sequence = 0;

function stage(
  name: string,
  duration: number,
  tone: Tone = "work",
  mode: Stage["mode"] = "timed",
): Stage {
  return {
    kind: "stage",
    id: `preset-stage-${++sequence}`,
    name,
    duration,
    tone,
    mode,
    cue: tone === "focus" ? "soft" : tone === "rest" ? "beep" : "bell",
  };
}

function group(name: string, repeats: number, children: TimerNode[]): Group {
  return {
    kind: "group",
    id: `preset-group-${++sequence}`,
    name,
    repeats,
    children,
  };
}

function preset(
  id: string,
  name: string,
  description: string,
  category: Category,
  icon: string,
  color: string,
  nodes: TimerNode[],
): Routine {
  return {
    id,
    name,
    description,
    category,
    icon,
    color,
    nodes,
    sound: true,
    vibration: false,
    warningSeconds: category === "sports" ? 10 : 0,
    createdAt: PRESET_DATE,
    updatedAt: PRESET_DATE,
  };
}

export const PRESETS: Routine[] = [
  preset(
    "boxing",
    "Boxing rounds",
    "Six rounds. Find your pace, then make every round count.",
    "sports",
    "boxing",
    "green",
    [
      stage("Get ready", 10, "prepare"),
      group("Rounds", 5, [stage("Box", 180), stage("Recover", 60, "rest")]),
      stage("Final round", 180),
    ],
  ),
  preset(
    "mma",
    "MMA rounds",
    "Five rounds with a minute to recover between them.",
    "sports",
    "flame",
    "peach",
    [
      stage("Get ready", 10, "prepare"),
      group("Rounds", 4, [stage("Work", 300), stage("Recover", 60, "rest")]),
      stage("Final round", 300),
    ],
  ),
  preset(
    "hiit",
    "HIIT intervals",
    "Eight sets of 40 seconds on, 20 seconds off.",
    "sports",
    "flame",
    "lilac",
    [
      stage("Get ready", 10, "prepare"),
      group("Intervals", 7, [stage("Work", 40), stage("Recover", 20, "rest")]),
      stage("Last push", 40),
    ],
  ),
  preset(
    "emom",
    "Every minute",
    "A fresh minute, a fresh set. Twelve minutes of EMOM.",
    "sports",
    "repeat",
    "sage",
    [
      stage("Get ready", 10, "prepare"),
      group("EMOM", 12, [stage("Your next set", 60)]),
    ],
  ),
  preset(
    "amrap",
    "AMRAP",
    "One uninterrupted block. Set your own movements and pace.",
    "sports",
    "timer",
    "peach",
    [
      stage("Get ready", 10, "prepare"),
      stage("As many rounds as you can", 720),
    ],
  ),
  preset(
    "hyrox",
    "HYROX training",
    "Run, complete a station, then tap Next. Advance at your own pace.",
    "sports",
    "run",
    "sage",
    [
      stage("Get ready", 10, "prepare"),
      ...[
        "SkiErg",
        "Sled push",
        "Sled pull",
        "Burpee broad jumps",
        "Row",
        "Farmer carry",
        "Sandbag lunges",
        "Wall balls",
      ].flatMap((station, index) => [
        stage(`Run ${index + 1}`, 60, "work", "manual"),
        stage(station, 60, "work", "manual"),
      ]),
    ],
  ),
  preset(
    "pomodoro",
    "Pomodoro",
    "Four focus blocks, short breaks, then a longer recharge.",
    "study",
    "focus",
    "lilac",
    [
      group("Focus cycles", 3, [
        stage("Focus", 1500, "focus"),
        stage("Short break", 300, "rest"),
      ]),
      stage("Final focus", 1500, "focus"),
      stage("Long break", 900, "rest"),
    ],
  ),
  preset(
    "deep-work",
    "Deep work",
    "52 minutes to get into it. 17 minutes to step away.",
    "study",
    "layers",
    "green",
    [stage("Deep work", 3120, "focus"), stage("Recharge", 1020, "rest")],
  ),
  preset(
    "study-sprints",
    "Study sprints",
    "Three focused 20-minute sessions with room to reset.",
    "study",
    "pencil",
    "peach",
    [
      group("Study cycles", 2, [
        stage("Study", 1200, "focus"),
        stage("Reset", 300, "rest"),
      ]),
      stage("Final sprint", 1200, "focus"),
    ],
  ),
  preset(
    "reading",
    "Reading time",
    "Read, reflect, and take a little breathing room.",
    "study",
    "book",
    "sage",
    [
      stage("Read", 1800, "focus"),
      stage("Reflect and make notes", 300, "focus"),
      stage("Take a break", 300, "rest"),
    ],
  ),
  preset(
    "exam-practice",
    "Exam practice",
    "A little planning, a timed paper, and space to review.",
    "study",
    "pencil",
    "lilac",
    [
      stage("Read and plan", 300, "focus"),
      stage("Answer questions", 2700, "focus"),
      stage("Review your answers", 600, "focus"),
    ],
  ),
];

function newId(prefix: string): string {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
}

export function getPreset(id: string): Routine | undefined {
  return PRESETS.find((item) => item.id === id);
}

export function createBlankRoutine(category: Category = "sports"): Routine {
  const now = Date.now();
  return {
    id: newId("routine"),
    name: "My custom timer",
    description: "",
    category,
    icon: category === "sports" ? "timer" : "focus",
    color: category === "sports" ? "green" : "lilac",
    sound: true,
    vibration: false,
    warningSeconds: category === "sports" ? 10 : 0,
    createdAt: now,
    updatedAt: now,
    nodes: [
      {
        kind: "stage",
        id: newId("stage"),
        name: category === "sports" ? "Work" : "Focus",
        duration: category === "sports" ? 60 : 1500,
        mode: "timed",
        tone: category === "sports" ? "work" : "focus",
        cue: category === "sports" ? "bell" : "soft",
      },
    ],
  };
}

export function cloneRoutine(routine: Routine): Routine {
  const copyNode = (node: TimerNode): TimerNode =>
    node.kind === "group"
      ? { ...node, id: newId("group"), children: node.children.map(copyNode) }
      : { ...node, id: newId("stage") };
  const now = Date.now();
  return {
    ...routine,
    id: newId("routine"),
    name: `${routine.name.slice(0, 115)} copy`,
    nodes: routine.nodes.map(copyNode),
    createdAt: now,
    updatedAt: now,
  };
}
