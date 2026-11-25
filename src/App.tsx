import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type CSSProperties,
} from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  Activity,
  ArrowDown,
  ArrowUp,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Clock3,
  Coffee,
  Copy,
  Download,
  Dumbbell,
  Flame,
  FolderHeart,
  History,
  Home,
  Layers3,
  Leaf,
  Maximize2,
  Pause,
  Pencil,
  Play,
  Plus,
  Repeat2,
  RotateCcw,
  Search,
  Settings2,
  ShieldCheck,
  SkipForward,
  SlidersHorizontal,
  Sparkles,
  Timer,
  Trash2,
  Upload,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import {
  compileRoutine,
  parseRoutine,
  summarizeRoutine,
  validateRoutine,
  type Category,
  type Routine,
  type Stage,
  type TimerNode,
  type Tone,
} from "./lib/timer";
import { useTimer } from "./lib/useTimer";
import { PRESETS, createBlankRoutine, cloneRoutine } from "./lib/presets";
import {
  addHistory,
  loadHistory,
  loadRoutines,
  saveRoutines,
} from "./lib/storage";
import { playCue, unlockAudio, useWakeLock } from "./lib/audio";

type View = "home" | "builder" | "saved" | "history";
const uid = () => crypto.randomUUID();
const cx = (...items: (string | false | undefined)[]) =>
  items.filter(Boolean).join(" ");
const clock = (seconds: number) => {
  const s = Math.max(0, Math.ceil(seconds));
  return s >= 3600
    ? `${Math.floor(s / 3600)}:${String(Math.floor(s / 60) % 60).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`
    : `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};
const length = (routine: Routine) => {
  try {
    const s = summarizeRoutine(routine);
    return `${clock(s.durationSeconds)}${s.manualStages ? " + open stages" : ""}`;
  } catch {
    return "Check routine";
  }
};
const Icon = ({ name, size = 24 }: { name: string; size?: number }) => {
  const Component =
    (
      {
        boxing: Dumbbell,
        flame: Flame,
        repeat: Repeat2,
        timer: Timer,
        run: Activity,
        focus: Leaf,
        book: BookOpen,
        coffee: Coffee,
        layers: Layers3,
        pencil: Pencil,
      } as Record<string, typeof Timer>
    )[name] || Timer;
  return <Component size={size} strokeWidth={1.7} />;
};
function Modal({
  title,
  trigger,
  children,
}: {
  title: string;
  trigger: ReactNode;
  children: ReactNode;
}) {
  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="modal-overlay" />
        <Dialog.Content className="modal">
          <div className="modal-heading">
            <Dialog.Title>{title}</Dialog.Title>
            <Dialog.Close className="icon-button" aria-label="Close">
              <X size={20} />
            </Dialog.Close>
          </div>
          <Dialog.Description className="sr-only">
            {title} information and options.
          </Dialog.Description>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
function App() {
  const [view, setView] = useState<View>("home");
  const [category, setCategory] = useState<Category>("sports");
  const [saved, setSaved] = useState(loadRoutines);
  const [history, setHistory] = useState(loadHistory);
  const [draft, setDraft] = useState<Routine>(() =>
    createBlankRoutine("sports"),
  );
  const [active, setActive] = useState<Routine | null>(null);
  const draftBaseline = useRef(JSON.stringify(draft));
  const draftDirty = JSON.stringify(draft) !== draftBaseline.current;
  const [query, setQuery] = useState("");
  const [toast, setToast] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(""), 4500);
    return () => clearTimeout(id);
  }, [toast]);
  useEffect(() => {
    if (!draftDirty) return;
    const preventLoss = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", preventLoss);
    return () => window.removeEventListener("beforeunload", preventLoss);
  }, [draftDirty]);
  const navigate = (next: View) => {
    setView(next);
    setQuery("");
    window.scrollTo({ top: 0 });
  };
  const canReplaceDraft = () =>
    !draftDirty ||
    window.confirm(
      "Replace your unsaved routine? Your current edits will be lost.",
    );
  const makeNew = () => {
    if (!canReplaceDraft()) return;
    const next = createBlankRoutine(category);
    draftBaseline.current = JSON.stringify(next);
    setDraft(next);
    navigate("builder");
  };
  const edit = (routine: Routine) => {
    if (!canReplaceDraft()) return;
    const next = structuredClone(
      saved.some((r) => r.id === routine.id)
        ? routine
        : { ...cloneRoutine(routine), name: routine.name },
    );
    draftBaseline.current = JSON.stringify(next);
    setDraft(next);
    navigate("builder");
  };
  const persist = (next: Routine[], message: string) => {
    try {
      saveRoutines(next);
      setSaved(next);
      setToast(message);
      return true;
    } catch (error) {
      setToast(
        error instanceof Error
          ? error.message
          : "Could not save on this device.",
      );
      return false;
    }
  };
  const save = (routine: Routine) => {
    const updated = { ...routine, updatedAt: Date.now() };
    const next = saved.some((r) => r.id === routine.id)
      ? saved.map((r) => (r.id === routine.id ? updated : r))
      : [updated, ...saved];
    if (persist(next, "Routine saved on this device")) {
      draftBaseline.current = JSON.stringify(updated);
      setDraft(updated);
      navigate("saved");
    }
  };
  const run = (routine: Routine) => {
    const errors = validateRoutine(routine);
    if (errors.length) {
      setToast(errors[0]);
      return;
    }
    void unlockAudio();
    setActive(structuredClone(routine));
    window.scrollTo({ top: 0 });
  };
  const completed = (routine: Routine, seconds: number) => {
    try {
      addHistory({
        id: uid(),
        routineId: routine.id,
        name: routine.name,
        category: routine.category,
        completedAt: Date.now(),
        elapsedSeconds: Math.round(seconds),
      });
      setHistory(loadHistory());
    } catch {
      setToast("Session finished. History could not be saved on this device.");
    }
  };
  const exportRoutines = () => {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify({ version: 1, routines: saved }, null, 2)], {
        type: "application/json",
      }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "tempo-routines.json";
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const importRoutines = async (file?: File) => {
    if (!file) return;
    try {
      if (file.size > 1024 * 1024)
        throw new Error("Please choose a backup smaller than 1 MB.");
      const json: unknown = JSON.parse(await file.text());
      if (!json || typeof json !== "object")
        throw new Error("Choose a valid Tempo routine or backup file.");
      const backup = json as { routines?: unknown };
      const list = Array.isArray(backup.routines) ? backup.routines : [json];
      if (list.length > 100)
        throw new Error("Import up to 100 routines at a time.");
      const imported = list.map((item: unknown) => ({
        ...parseRoutine(item),
        id: uid(),
        updatedAt: Date.now(),
      }));
      if (
        persist(
          [...imported, ...saved],
          `${imported.length} routine${imported.length === 1 ? "" : "s"} imported`,
        )
      )
        navigate("saved");
    } catch (error) {
      setToast(
        error instanceof Error
          ? error.message
          : "That file is not a valid Tempo backup.",
      );
    }
    if (fileInput.current) fileInput.current.value = "";
  };
  const help = (
    <Modal
      title="A little help"
      trigger={
        <button className="icon-button" aria-label="Help and iPhone setup">
          <CircleHelp size={21} />
        </button>
      }
    >
      <div className="help-content">
        <p>Make time for your sport, your study, and everything in between.</p>
        <h3>On your iPhone</h3>
        <p>
          Open Tempo in Safari. Tap Share, then Add to Home Screen for an
          app-like shortcut.
        </p>
        <h3>While your timer runs</h3>
        <p>
          Keep Tempo open for reliable sound cues. We try to keep the screen
          awake when your browser supports it. If Safari is suspended or your
          screen locks, cues may be missed; the timer catches up when you
          return.
        </p>
        <h3>Your routines belong to you</h3>
        <p>
          Saved routines and history stay in this browser on this device.
          Clearing browser data removes them. Export your routines from Saved to
          keep a backup.
        </p>
        <h3>Sounds and vibration</h3>
        <p>
          Check your device volume. Vibration is optional and is unavailable in
          iPhone Safari. Use Test sound in the builder to check your volume
          before a session.
        </p>
      </div>
    </Modal>
  );
  if (active)
    return (
      <>
        <Player
          routine={active}
          onExit={() => setActive(null)}
          onComplete={completed}
        />
        {toast && (
          <div className="toast" role="status">
            {toast}
          </div>
        )}
      </>
    );
  const templates = PRESETS.filter(
    (r) =>
      r.category === category &&
      `${r.name} ${r.description}`.toLowerCase().includes(query.toLowerCase()),
  );
  const featured = PRESETS.find((r) => r.category === category)!;
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            navigate("home");
          }}
        >
          <span className="brand-mark">
            <Activity size={25} />
          </span>
          tempo<span className="brand-period">.</span>
        </a>
        <div className="sidebar-label">A LITTLE STRUCTURE. MORE YOU.</div>
        <nav aria-label="Main navigation">
          {(
            [
              { id: "home", label: "Discover", icon: Home },
              { id: "saved", label: "My routines", icon: FolderHeart },
              { id: "history", label: "Session history", icon: History },
            ] as const
          ).map(({ id, label, icon: NavIcon }) => (
            <button
              key={id}
              className={cx("nav-item", view === id && "active")}
              onClick={() => navigate(id)}
            >
              <NavIcon size={20} />
              {label}
              {id === "saved" && saved.length > 0 && (
                <span className="nav-count">{saved.length}</span>
              )}
            </button>
          ))}
          <button
            className={cx("nav-item", view === "builder" && "active")}
            onClick={() => navigate("builder")}
          >
            <SlidersHorizontal size={20} />
            Timer builder
          </button>
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <span className="note-icon">
              <Sparkles size={19} />
            </span>
            <strong>Your time. Your way.</strong>
            <p>Make a little room for what matters.</p>
            <button onClick={makeNew}>
              Create your own <Plus size={16} />
            </button>
          </div>
          <div className="sidebar-footer">
            <span>Made for your everyday.</span>
            {help}
          </div>
        </div>
      </aside>
      <main className="main-content">
        <header className="topbar">
          <span className="breadcrumb">
            Your space <ChevronRight size={14} />
            <strong>
              {view === "home"
                ? "Discover"
                : view === "saved"
                  ? "My routines"
                  : view === "history"
                    ? "Session history"
                    : "Timer builder"}
            </strong>
          </span>
          <span className="topbar-note">
            <ShieldCheck size={15} />
            No account. Just your time.
          </span>
          <span className="mobile-brand">
            tempo<span>.</span>
          </span>
          <span className="mobile-help">{help}</span>
        </header>
        {view === "home" && (
          <div className="page-content discover-page">
            <div className="page-heading">
              <div>
                <div className="eyebrow">LET’S MAKE TIME</div>
                <h1>
                  Find your rhythm<span>.</span>
                </h1>
                <p>A little structure for whatever’s on your agenda.</p>
              </div>
              <button className="button dark heading-action" onClick={makeNew}>
                <Plus size={18} />
                Create a timer
              </button>
            </div>
            <div className="library-toolbar">
              <div className="category-tabs" aria-label="Timer categories">
                <button
                  className={cx(category === "sports" && "selected")}
                  onClick={() => {
                    setCategory("sports");
                    setQuery("");
                  }}
                  aria-pressed={category === "sports"}
                >
                  <Dumbbell size={18} />
                  Sports
                </button>
                <button
                  className={cx(category === "study" && "selected")}
                  onClick={() => {
                    setCategory("study");
                    setQuery("");
                  }}
                  aria-pressed={category === "study"}
                >
                  <BookOpen size={18} />
                  Study & focus
                </button>
              </div>
              <label className="search-field">
                <Search size={17} />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Find a timer…"
                  aria-label="Find a timer"
                />
              </label>
            </div>
            {!query && (
              <section
                className={cx(
                  "featured",
                  category === "study" && "featured-study",
                )}
              >
                <div className="featured-content">
                  <span className="featured-tag">
                    <span className="live-dot" />{" "}
                    {category === "sports"
                      ? "IN YOUR CORNER"
                      : "A CLEARER HEAD"}
                  </span>
                  <h2>
                    {category === "sports" ? (
                      <>
                        One round
                        <br />
                        at a time.
                      </>
                    ) : (
                      <>
                        A little focus.
                        <br />A lot of possibility.
                      </>
                    )}
                  </h2>
                  <p>
                    {category === "sports"
                      ? "Set your pace. Find your flow. We’ll keep an eye on the clock."
                      : "Give one thing your full attention. We’ll take care of the breaks."}
                  </p>
                  <div className="featured-buttons">
                    <button
                      className="button dark"
                      onClick={() => run(featured)}
                    >
                      <Play size={16} fill="currentColor" />
                      {category === "sports"
                        ? "Start boxing rounds"
                        : "Start a focus session"}
                    </button>
                    <button
                      className="text-button"
                      onClick={() => edit(featured)}
                    >
                      Make it yours <Settings2 size={16} />
                    </button>
                  </div>
                </div>
                <div className="featured-art" aria-hidden="true">
                  <div className="orbit orbit-one" />
                  <div className="orbit orbit-two" />
                  <div className="timer-dial">
                    <div className="dial-label">
                      {category === "sports" ? "ROUND 01 / 06" : "FOCUS / 01"}
                    </div>
                    <div className="dial-time">
                      {category === "sports" ? "03:00" : "25:00"}
                    </div>
                    <div className="dial-sub">
                      {category === "sports"
                        ? "YOU’VE GOT THIS"
                        : "ONE THING AT A TIME"}
                    </div>
                    <div className="dial-play">
                      <Play size={17} fill="currentColor" />
                    </div>
                  </div>
                  <div className="art-chip chip-top">
                    <Volume2 size={14} />{" "}
                    {category === "sports"
                      ? "A bell for every round"
                      : "Space to concentrate"}
                  </div>
                  <div className="art-chip chip-bottom">
                    <Clock3 size={14} />
                    {length(featured)} total
                  </div>
                </div>
              </section>
            )}
            <div className="section-heading">
              <div>
                <h2>
                  {category === "sports"
                    ? "Made to move"
                    : "Make room for focus"}
                </h2>
                <p>
                  {category === "sports"
                    ? "Your session, already set up. Just press play."
                    : "Less deciding. More doing."}
                </p>
              </div>
              <span className="subtle-count">{templates.length} presets</span>
            </div>
            <div className="preset-grid">
              {templates.map((r) => (
                <RoutineCard
                  key={r.id}
                  routine={r}
                  onStart={() => run(r)}
                  onEdit={() => edit(r)}
                />
              ))}
            </div>
            {!templates.length && (
              <Empty
                icon={<Search />}
                title="No timers found"
                text="Try another search, or build exactly what you have in mind."
                action={
                  <button className="button dark" onClick={makeNew}>
                    Create a timer
                  </button>
                }
              />
            )}
            <button className="custom-callout" onClick={makeNew}>
              <span className="custom-callout-icon">
                <SlidersHorizontal size={25} />
              </span>
              <span>
                <strong>A timer as individual as you.</strong>
                <small>
                  Mix stages, add breaks, repeat your way. Start with a blank
                  canvas.
                </small>
              </span>
              <span className="callout-link">
                Open the builder <Plus size={18} />
              </span>
            </button>
            <div className="page-footnote">
              <Leaf size={15} /> A little progress is still progress.
            </div>
          </div>
        )}
        {view === "builder" && (
          <Builder
            key={draft.id}
            routine={draft}
            onChange={setDraft}
            onSave={save}
            onStart={run}
            onBack={() => navigate("home")}
          />
        )}
        {view === "saved" && (
          <div className="page-content">
            <div className="page-heading">
              <div>
                <div className="eyebrow">READY WHEN YOU ARE</div>
                <h1>
                  My routines<span>.</span>
                </h1>
                <p>Your favourites, exactly how you like them.</p>
              </div>
              <button className="button dark" onClick={makeNew}>
                <Plus size={18} />
                New routine
              </button>
            </div>
            <div className="saved-tools">
              <span>{saved.length} saved on this device</span>
              <div>
                <button
                  className="button ghost"
                  onClick={() => fileInput.current?.click()}
                >
                  <Upload size={16} />
                  Import
                </button>
                <button
                  className="button ghost"
                  disabled={!saved.length}
                  onClick={exportRoutines}
                >
                  <Download size={16} />
                  Export backup
                </button>
              </div>
            </div>
            {saved.length ? (
              <div className="preset-grid saved-grid">
                {saved.map((r) => (
                  <RoutineCard
                    key={r.id}
                    routine={r}
                    onStart={() => run(r)}
                    onEdit={() => edit(r)}
                    extra={
                      <div className="saved-card-actions">
                        <button
                          onClick={() =>
                            persist(
                              [cloneRoutine(r), ...saved],
                              "Routine duplicated",
                            )
                          }
                        >
                          <Copy size={15} />
                          Duplicate
                        </button>
                        <Modal
                          title="Delete this routine?"
                          trigger={
                            <button aria-label={`Delete ${r.name}`}>
                              <Trash2 size={15} />
                            </button>
                          }
                        >
                          <p>This removes “{r.name}” from this device.</p>
                          <Dialog.Close asChild>
                            <button
                              className="button danger"
                              onClick={() =>
                                persist(
                                  saved.filter((x) => x.id !== r.id),
                                  "Routine deleted",
                                )
                              }
                            >
                              Delete routine
                            </button>
                          </Dialog.Close>
                        </Modal>
                      </div>
                    }
                  />
                ))}
              </div>
            ) : (
              <Empty
                icon={<FolderHeart size={30} />}
                title="Your next favourite starts here"
                text="Customize a preset or build a routine from scratch, then save it for next time."
                action={
                  <button className="button dark" onClick={makeNew}>
                    <Plus size={17} />
                    Build a routine
                  </button>
                }
              />
            )}
          </div>
        )}
        {view === "history" && (
          <div className="page-content">
            <div className="page-heading">
              <div>
                <div className="eyebrow">TIME WELL SPENT</div>
                <h1>
                  Small steps. Real progress<span>.</span>
                </h1>
                <p>Your completed sessions, all in one place.</p>
              </div>
            </div>
            {history.length ? (
              <div className="history-list">
                {history.map((h) => (
                  <div className="history-row" key={h.id}>
                    <span
                      className={cx(
                        "routine-icon",
                        h.category === "sports" ? "sage" : "lilac",
                      )}
                    >
                      {h.category === "sports" ? (
                        <Dumbbell size={21} />
                      ) : (
                        <BookOpen size={21} />
                      )}
                    </span>
                    <div>
                      <strong>{h.name}</strong>
                      <span>
                        {new Date(h.completedAt).toLocaleString([], {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })}
                      </span>
                    </div>
                    <span className="history-time">
                      {clock(h.elapsedSeconds)}
                    </span>
                    <CheckCircle2 size={21} />
                  </div>
                ))}
              </div>
            ) : (
              <Empty
                icon={<History size={30} />}
                title="A fresh start"
                text="Finish your first session and it will appear here."
                action={
                  <button
                    className="button dark"
                    onClick={() => navigate("home")}
                  >
                    Explore timers
                  </button>
                }
              />
            )}
          </div>
        )}
      </main>
      <nav className="bottom-nav" aria-label="Mobile navigation">
        <button
          className={cx(view === "home" && "active")}
          onClick={() => navigate("home")}
        >
          <Home size={22} />
          <span>Discover</span>
        </button>
        <button
          className={cx(view === "builder" && "active")}
          onClick={() => navigate("builder")}
        >
          <SlidersHorizontal size={22} />
          <span>Builder</span>
        </button>
        <button
          className={cx(view === "saved" && "active")}
          onClick={() => navigate("saved")}
        >
          <FolderHeart size={22} />
          <span>My routines</span>
        </button>
        <button
          className={cx(view === "history" && "active")}
          onClick={() => navigate("history")}
        >
          <History size={22} />
          <span>History</span>
        </button>
      </nav>
      <input
        ref={fileInput}
        type="file"
        accept="application/json,.json"
        className="sr-only"
        aria-label="Import routines file"
        onChange={(e) => void importRoutines(e.target.files?.[0])}
      />
      {toast && (
        <div className="toast" role="status">
          <CheckCircle2 size={17} />
          {toast}
        </div>
      )}
    </div>
  );
}
function Empty({
  icon,
  title,
  text,
  action,
}: {
  icon: ReactNode;
  title: string;
  text: string;
  action: ReactNode;
}) {
  return (
    <div className="empty-state">
      <span>{icon}</span>
      <h2>{title}</h2>
      <p>{text}</p>
      {action}
    </div>
  );
}
function RoutineCard({
  routine: r,
  onStart,
  onEdit,
  extra,
}: {
  routine: Routine;
  onStart: () => void;
  onEdit: () => void;
  extra?: ReactNode;
}) {
  const summary = summarizeRoutine(r);
  return (
    <article className="routine-card">
      <div className="card-top">
        <span className={cx("routine-icon", r.color)}>
          <Icon name={r.icon} />
        </span>
        <button
          className="icon-button card-edit"
          aria-label={`Customize ${r.name}`}
          onClick={onEdit}
        >
          <Settings2 size={18} />
        </button>
      </div>
      <h3>{r.name}</h3>
      <p>{r.description}</p>
      <div className="card-meta">
        <span>
          <Clock3 size={14} />
          {length(r)}
        </span>
        <span>
          {summary.manualStages ? "Your pace" : `${summary.stageCount} stages`}
        </span>
      </div>
      <div className="card-bottom">
        <button className="text-button" onClick={onEdit}>
          Customize
        </button>
        <button
          className="small-play"
          aria-label={`Start ${r.name}`}
          onClick={onStart}
        >
          <Play size={16} fill="currentColor" />
        </button>
      </div>
      {extra}
    </article>
  );
}
function newStage(tone: Tone = "work"): Stage {
  return {
    kind: "stage",
    id: uid(),
    name: tone === "rest" ? "Rest" : tone === "focus" ? "Focus" : "New stage",
    duration: tone === "rest" ? 30 : 60,
    mode: "timed",
    tone,
    cue: tone === "focus" ? "soft" : "bell",
  };
}
function copyNode(node: TimerNode): TimerNode {
  return node.kind === "group"
    ? { ...node, id: uid(), children: node.children.map(copyNode) }
    : { ...node, id: uid() };
}
function Builder({
  routine: r,
  onChange,
  onSave,
  onStart,
  onBack,
}: {
  routine: Routine;
  onChange: (r: Routine) => void;
  onSave: (r: Routine) => void;
  onStart: (r: Routine) => void;
  onBack: () => void;
}) {
  const errors = validateRoutine(r);
  let summary = { durationSeconds: 0, manualStages: 0, stageCount: 0 };
  try {
    summary = summarizeRoutine(r);
  } catch {
    /* Validation below explains invalid edits. */
  }
  const update = (patch: Partial<Routine>) => onChange({ ...r, ...patch });
  return (
    <div className="page-content builder-page">
      <button className="back-link" onClick={onBack}>
        <ChevronLeft size={17} />
        Back to discover
      </button>
      <div className="page-heading">
        <div>
          <div className="eyebrow">MAKE IT YOURS</div>
          <h1>
            Your perfect timing<span>.</span>
          </h1>
          <p>A few simple blocks. Endless possibilities.</p>
        </div>
        <button
          className="button dark"
          disabled={!!errors.length}
          onClick={() => onSave(r)}
        >
          <Check size={18} />
          Save routine
        </button>
      </div>
      <div className="builder-layout">
        <div className="builder-main">
          <section className="builder-section">
            <h2>The essentials</h2>
            <div className="form-row">
              <label className="field wide">
                Routine name
                <input
                  maxLength={100}
                  value={r.name}
                  onChange={(e) => update({ name: e.target.value })}
                  placeholder="e.g. My morning circuit"
                />
              </label>
              <label className="field">
                Category
                <select
                  value={r.category}
                  onChange={(e) =>
                    update({ category: e.target.value as Category })
                  }
                >
                  <option value="sports">Sports</option>
                  <option value="study">Study & focus</option>
                </select>
              </label>
            </div>
            <label className="field">
              A little description <span className="optional">optional</span>
              <input
                maxLength={300}
                value={r.description}
                onChange={(e) => update({ description: e.target.value })}
                placeholder="What are we making time for?"
              />
            </label>
          </section>
          <section className="builder-section sequence-section">
            <div className="section-heading">
              <div>
                <h2>Build your flow</h2>
                <p>
                  Stages play from top to bottom. Repeat blocks loop their
                  contents.
                </p>
              </div>
              <Layers3 size={21} />
            </div>
            <NodeList
              nodes={r.nodes}
              onChange={(nodes) => update({ nodes })}
              depth={0}
              category={r.category}
            />
          </section>
          <section className="builder-section">
            <div className="section-heading">
              <div>
                <h2>The finishing touches</h2>
                <p>Set the cues that work for you.</p>
              </div>
              <Volume2 size={20} />
            </div>
            <div className="setting-row">
              <span>
                <strong>Sound cues</strong>
                <small>A clear cue when each stage changes.</small>
              </span>
              <button
                role="switch"
                aria-checked={r.sound}
                className={cx("switch", r.sound && "on")}
                onClick={() => update({ sound: !r.sound })}
                aria-label="Sound cues"
              >
                <span />
              </button>
            </div>
            <button
              className="button ghost"
              onClick={async () => {
                await unlockAudio();
                playCue(
                  "stage",
                  {
                    ...newStage("work"),
                    instanceId: "sound-preview",
                    groupPath: [],
                  },
                  true,
                  false,
                );
              }}
            >
              <Volume2 size={17} />
              Test sound
            </button>
            <div className="setting-row">
              <span>
                <strong>Vibration</strong>
                <small>Where supported. Unavailable in iPhone Safari.</small>
              </span>
              <button
                role="switch"
                aria-checked={r.vibration}
                className={cx("switch", r.vibration && "on")}
                onClick={() => update({ vibration: !r.vibration })}
                aria-label="Vibration"
              >
                <span />
              </button>
            </div>
            <label className="setting-row">
              <span>
                <strong>Heads-up cue</strong>
                <small>Seconds before a timed stage ends. Set 0 for off.</small>
              </span>
              <input
                aria-label="Warning seconds"
                className="number-input"
                type="number"
                min={0}
                max={60}
                value={r.warningSeconds}
                onChange={(e) =>
                  update({
                    warningSeconds: Math.max(
                      0,
                      Math.min(60, Number(e.target.value)),
                    ),
                  })
                }
              />
            </label>
            <div className="palette-row">
              <span>Routine colour</span>
              {["green", "sage", "lilac", "peach"].map((color) => (
                <button
                  key={color}
                  aria-label={`Use ${color} colour`}
                  aria-pressed={r.color === color}
                  className={cx(
                    "colour-choice",
                    color,
                    r.color === color && "chosen",
                  )}
                  onClick={() => update({ color })}
                >
                  {r.color === color && <Check size={16} />}
                </button>
              ))}
            </div>
          </section>
        </div>
        <aside className="builder-preview">
          <div className="preview-inner">
            <span className="eyebrow">YOUR SESSION AT A GLANCE</span>
            <div className={cx("preview-symbol", r.color)}>
              <Icon name={r.icon} size={28} />
            </div>
            <h2>{r.name || "Your routine"}</h2>
            <div className="preview-duration">
              {clock(summary.durationSeconds)}
            </div>
            <p>
              {summary.manualStages
                ? `plus ${summary.manualStages} stage${summary.manualStages === 1 ? "" : "s"} at your pace`
                : "total session time"}
            </p>
            <div className="preview-details">
              <span>
                <Layers3 size={17} />
                {summary.stageCount} stages
              </span>
              <span>
                <Volume2 size={17} />
                {r.sound ? "Sound on" : "Sound off"}
              </span>
            </div>
            <Timeline routine={r} />
            {errors.length > 0 && (
              <div className="validation-error" role="alert">
                {errors[0]}
              </div>
            )}
            <button
              className="button dark full"
              disabled={!!errors.length}
              onClick={() => onStart(r)}
            >
              <Play size={16} fill="currentColor" />
              Try this timer
            </button>
            <button
              className="button ghost full"
              disabled={!!errors.length}
              onClick={() => onSave(r)}
            >
              <Check size={17} />
              Save for next time
            </button>
            <p className="preview-note">
              Saved on this device. No account needed.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
function NodeList({
  nodes,
  onChange,
  depth,
  category,
}: {
  nodes: TimerNode[];
  onChange: (nodes: TimerNode[]) => void;
  depth: number;
  category: Category;
}) {
  const update = (i: number, node: TimerNode) =>
    onChange(nodes.map((n, j) => (i === j ? node : n)));
  const move = (i: number, direction: number) => {
    const next = [...nodes];
    [next[i], next[i + direction]] = [next[i + direction], next[i]];
    onChange(next);
  };
  return (
    <div className={cx("node-list", depth > 0 && "nested")}>
      {nodes.map((node, i) => (
        <div
          className={cx(
            "node-block",
            node.kind === "group" ? "repeat-block" : "stage-block",
          )}
          key={node.id}
        >
          <div className="node-top">
            <span
              className={cx(
                "stage-badge",
                node.kind === "group" ? "group-badge" : node.tone,
              )}
            >
              {node.kind === "group" ? (
                <Repeat2 size={16} />
              ) : node.mode === "manual" ? (
                <CheckCircle2 size={16} />
              ) : (
                <Clock3 size={16} />
              )}
            </span>
            <input
              className="node-name"
              aria-label={`${node.kind === "group" ? "Block" : "Stage"} name`}
              maxLength={100}
              value={node.name}
              onChange={(e) => update(i, { ...node, name: e.target.value })}
            />
            <div className="node-actions">
              <button
                className="icon-button"
                disabled={i === 0}
                aria-label={`Move ${node.name} up`}
                onClick={() => move(i, -1)}
              >
                <ArrowUp size={15} />
              </button>
              <button
                className="icon-button"
                disabled={i === nodes.length - 1}
                aria-label={`Move ${node.name} down`}
                onClick={() => move(i, 1)}
              >
                <ArrowDown size={15} />
              </button>
              <button
                className="icon-button"
                aria-label={`Duplicate ${node.name}`}
                onClick={() =>
                  onChange([
                    ...nodes.slice(0, i + 1),
                    copyNode(node),
                    ...nodes.slice(i + 1),
                  ])
                }
              >
                <Copy size={15} />
              </button>
              <button
                className="icon-button"
                aria-label={`Remove ${node.name}`}
                onClick={() => onChange(nodes.filter((_, j) => i !== j))}
              >
                <X size={16} />
              </button>
            </div>
          </div>
          {node.kind === "group" ? (
            <>
              <div className="repeat-settings">
                <Repeat2 size={15} />
                <span>Repeat this block</span>
                <input
                  aria-label={`${node.name} repeats`}
                  type="number"
                  min={1}
                  max={99}
                  value={node.repeats}
                  onChange={(e) =>
                    update(i, {
                      ...node,
                      repeats: Math.max(
                        1,
                        Math.min(99, Number(e.target.value)),
                      ),
                    })
                  }
                />
                <span>times</span>
              </div>
              <NodeList
                nodes={node.children}
                onChange={(children) => update(i, { ...node, children })}
                depth={depth + 1}
                category={category}
              />
            </>
          ) : (
            <div className="stage-fields">
              <label className="mini-field">
                Finish
                <select
                  aria-label={`${node.name} finish mode`}
                  value={node.mode}
                  onChange={(e) =>
                    update(i, {
                      ...node,
                      mode: e.target.value as Stage["mode"],
                    })
                  }
                >
                  <option value="timed">After a duration</option>
                  <option value="manual">When I tap next</option>
                </select>
              </label>
              {node.mode === "timed" ? (
                <div className="duration-fields">
                  <label className="mini-field">
                    Min
                    <input
                      aria-label={`${node.name} minutes`}
                      type="number"
                      min={0}
                      max={1440}
                      value={Math.floor(node.duration / 60)}
                      onChange={(e) =>
                        update(i, {
                          ...node,
                          duration:
                            Math.max(
                              0,
                              Math.min(1440, Number(e.target.value)),
                            ) *
                              60 +
                            (node.duration % 60),
                        })
                      }
                    />
                  </label>
                  <span>:</span>
                  <label className="mini-field">
                    Sec
                    <input
                      aria-label={`${node.name} seconds`}
                      type="number"
                      min={0}
                      max={59}
                      value={node.duration % 60}
                      onChange={(e) =>
                        update(i, {
                          ...node,
                          duration:
                            Math.floor(node.duration / 60) * 60 +
                            Math.max(0, Math.min(59, Number(e.target.value))),
                        })
                      }
                    />
                  </label>
                </div>
              ) : (
                <div className="manual-explainer">
                  Take your time.
                  <br />
                  Advance when you’re done.
                </div>
              )}
              <label className="mini-field">
                Type
                <select
                  aria-label={`${node.name} type`}
                  value={node.tone}
                  onChange={(e) =>
                    update(i, { ...node, tone: e.target.value as Tone })
                  }
                >
                  <option value="work">Work</option>
                  <option value="rest">Rest</option>
                  <option value="focus">Focus</option>
                  <option value="prepare">Prepare</option>
                </select>
              </label>
              <label className="mini-field">
                Cue
                <select
                  aria-label={`${node.name} cue`}
                  value={node.cue}
                  onChange={(e) =>
                    update(i, { ...node, cue: e.target.value as Stage["cue"] })
                  }
                >
                  <option value="bell">Bell</option>
                  <option value="beep">Beep</option>
                  <option value="soft">Soft</option>
                  <option value="none">Silent</option>
                </select>
              </label>
            </div>
          )}
        </div>
      ))}
      <div className="add-stage-row">
        <button
          className="button add-button"
          onClick={() =>
            onChange([
              ...nodes,
              newStage(category === "study" ? "focus" : "work"),
            ])
          }
        >
          <Plus size={16} />
          Add stage
        </button>
        <button
          className="button add-button"
          onClick={() => onChange([...nodes, newStage("rest")])}
        >
          <Coffee size={16} />
          Add rest
        </button>
        {depth < 3 && (
          <button
            className="button add-button"
            onClick={() =>
              onChange([
                ...nodes,
                {
                  kind: "group",
                  id: uid(),
                  name: "Repeat block",
                  repeats: 3,
                  children: [
                    newStage(category === "study" ? "focus" : "work"),
                    newStage("rest"),
                  ],
                },
              ])
            }
          >
            <Repeat2 size={16} />
            Repeat block
          </button>
        )}
      </div>
    </div>
  );
}
function Timeline({ routine }: { routine: Routine }) {
  let stages: ReturnType<typeof compileRoutine> = [];
  try {
    stages = compileRoutine(routine);
  } catch {
    return null;
  }
  return (
    <div className="timeline" aria-label="Session stages">
      {stages.slice(0, 9).map((s) => (
        <div key={s.instanceId}>
          <span className={cx("timeline-dot", s.tone)} />
          <span>{s.name}</span>
          <small>{s.mode === "manual" ? "Open" : clock(s.duration)}</small>
        </div>
      ))}
      {stages.length > 9 && <p>+ {stages.length - 9} more stages</p>}
    </div>
  );
}
function Player({
  routine: r,
  onExit,
  onComplete,
}: {
  routine: Routine;
  onExit: () => void;
  onComplete: (r: Routine, seconds: number) => void;
}) {
  const [sound, setSound] = useState(r.sound);
  const [keepAwake, setKeepAwake] = useState(true);
  const [wide, setWide] = useState(false);
  const soundRef = useRef(sound);
  soundRef.current = sound;
  const timer = useTimer(r, (kind, stage) =>
    playCue(kind, stage, soundRef.current, r.vibration),
  );
  const wake = useWakeLock(keepAwake && timer.status === "running");
  const recorded = useRef(false);
  useEffect(() => {
    if (timer.status === "completed" && !recorded.current) {
      recorded.current = true;
      onComplete(r, timer.elapsedMs / 1000);
    }
  }, [timer.status, r, onComplete, timer.elapsedMs]);
  useEffect(() => {
    document.title =
      timer.status === "running"
        ? `${clock((timer.currentStage?.mode === "manual" ? timer.stageElapsedMs : timer.remainingMs) / 1000)} · ${r.name} — Tempo`
        : "Tempo — Your time, your way";
    return () => {
      document.title = "Tempo — Your time, your way";
    };
  }, [
    timer.status,
    timer.remainingMs,
    timer.stageElapsedMs,
    timer.currentStage,
    r.name,
  ]);
  const stage = timer.currentStage;
  const complete = timer.status === "completed";
  const go = async () => {
    if (timer.status === "running") {
      timer.pause();
      return;
    }
    await unlockAudio();
    if (timer.status === "ready") timer.start();
    else if (timer.status === "paused") timer.resume();
  };
  const restart = () => {
    recorded.current = false;
    timer.restart();
  };
  return (
    <div
      className={cx(
        "player",
        wide && "player-wide",
        stage && `player-${stage.tone}`,
      )}
    >
      <header className="player-header">
        <Modal
          title="Leave this session?"
          trigger={
            <button className="button ghost">
              <ChevronLeft size={18} />
              Exit session
            </button>
          }
        >
          <p>
            Your current timer will stop. Completed sessions stay in your
            history.
          </p>
          <Dialog.Close asChild>
            <button className="button dark" onClick={onExit}>
              Leave session
            </button>
          </Dialog.Close>
        </Modal>
        <span className="player-brand">
          tempo<span>.</span>
        </span>
        <div>
          <button
            className="icon-button"
            aria-label={sound ? "Mute sounds" : "Enable sounds"}
            onClick={async () => {
              await unlockAudio();
              setSound(!sound);
            }}
          >
            {sound ? <Volume2 size={22} /> : <VolumeX size={22} />}
          </button>
          <button
            className="icon-button"
            aria-label="Toggle expanded view"
            aria-pressed={wide}
            onClick={() => setWide(!wide)}
          >
            <Maximize2 size={21} />
          </button>
        </div>
      </header>
      <div className="player-content">
        <span className="eyebrow">{r.name}</span>
        {complete ? (
          <>
            <div className="complete-mark">
              <Check size={38} />
            </div>
            <h1>
              Time well spent<span>.</span>
            </h1>
            <p className="complete-copy">You showed up. That’s what counts.</p>
            <div className="complete-summary">
              <span>
                <strong>{clock(Math.round(timer.elapsedMs / 1000))}</strong>
                elapsed time
              </span>
              <span>
                <strong>{timer.stages.length}</strong>stages in routine
              </span>
            </div>
            <button className="button dark" onClick={restart}>
              <RotateCcw size={18} />
              Go again
            </button>
            <button className="text-button done-button" onClick={onExit}>
              Back to my space
            </button>
          </>
        ) : (
          <>
            <div className="player-stage-heading">
              <span className={cx("stage-type", stage?.tone)}>
                {timer.status === "paused"
                  ? "PAUSED"
                  : timer.status === "ready"
                    ? "READY WHEN YOU ARE"
                    : stage?.tone === "rest"
                      ? "TAKE A BREATHER"
                      : stage?.mode === "manual"
                        ? "AT YOUR PACE"
                        : stage?.tone === "prepare"
                          ? "GET READY"
                          : stage?.tone === "focus"
                            ? "IN THE ZONE"
                            : "LET’S GO"}
              </span>
              <h1>{stage?.name || "Ready to begin"}</h1>
              <p>
                {stage?.groupPath.join(" · ") ||
                  `Stage ${timer.index + 1} of ${timer.stages.length}`}
              </p>
            </div>
            <div className="player-clock">
              <div
                className="clock-track"
                style={
                  {
                    "--progress": `${Math.max(0, Math.min(100, timer.progress * 100))}%`,
                  } as CSSProperties
                }
              />
              <div className="clock-inner">
                <span
                  className="clock-numbers"
                  role="timer"
                  aria-label={
                    stage?.mode === "manual"
                      ? "Elapsed stage time"
                      : "Time remaining"
                  }
                >
                  {clock(
                    (stage?.mode === "manual"
                      ? Math.floor(timer.stageElapsedMs / 1000) * 1000
                      : timer.remainingMs) / 1000,
                  )}
                </span>
                <span className="clock-caption">
                  {stage?.mode === "manual"
                    ? "UNTIL YOU’RE READY"
                    : "REMAINING"}
                </span>
              </div>
            </div>
            <div className="player-controls">
              <Modal
                title="Restart this session?"
                trigger={
                  <button
                    className="control-secondary"
                    aria-label="Restart session"
                  >
                    <RotateCcw size={23} />
                  </button>
                }
              >
                <p>Your current progress will reset to the first stage.</p>
                <Dialog.Close asChild>
                  <button className="button dark" onClick={restart}>
                    Restart timer
                  </button>
                </Dialog.Close>
              </Modal>
              <button className="control-main" onClick={() => void go()}>
                {timer.status === "running" ? (
                  <>
                    <Pause size={23} fill="currentColor" />
                    Pause
                  </>
                ) : (
                  <>
                    <Play size={23} fill="currentColor" />
                    {timer.status === "paused" ? "Resume" : "Start session"}
                  </>
                )}
              </button>
              <button
                className="control-secondary"
                aria-label={
                  stage?.mode === "manual" ? "Finish stage" : "Skip stage"
                }
                disabled={timer.status === "ready" || timer.status === "paused"}
                onClick={timer.next}
              >
                {stage?.mode === "manual" ? (
                  <Check size={24} />
                ) : (
                  <SkipForward size={24} />
                )}
              </button>
            </div>
            {stage?.mode === "manual" && (
              <button
                className="text-button manual-next"
                disabled={timer.status !== "running"}
                onClick={timer.next}
              >
                Done with this stage <CheckCircle2 size={17} />
              </button>
            )}
            <div className="up-next">
              <span>UP NEXT</span>
              <strong>
                {timer.stages[timer.index + 1]?.name || "Session complete"}
              </strong>
              <small>
                {timer.stages[timer.index + 1]?.mode === "manual"
                  ? "Your pace"
                  : timer.stages[timer.index + 1]
                    ? clock(timer.stages[timer.index + 1].duration)
                    : "You’ve got this"}
              </small>
            </div>
            <div className="session-progress">
              <div>
                <span>
                  Stage {timer.index + 1} of {timer.stages.length}
                </span>
                <span>{clock(Math.floor(timer.elapsedMs / 1000))} elapsed</span>
              </div>
              <div className="session-progress-track">
                <span
                  style={{
                    width: `${((timer.index + timer.progress) / timer.stages.length) * 100}%`,
                  }}
                />
              </div>
            </div>
          </>
        )}
      </div>
      <footer className="player-footer">
        <button
          className="text-button"
          onClick={() => setKeepAwake(!keepAwake)}
        >
          <span className={cx("awake-dot", wake === "active" && "on")} />
          {keepAwake
            ? wake === "active"
              ? "Keeping your screen awake"
              : wake === "unavailable"
                ? "Keep screen on unavailable"
                : "Keep screen on"
            : "Keep screen on: off"}
        </button>
        <span>Keep Tempo open for reliable sound cues.</span>
      </footer>
    </div>
  );
}
export default App;
