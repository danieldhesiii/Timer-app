import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  advancePlayback,
  compileRoutine,
  createPlayback,
  nextPlayback,
  pausePlayback,
  playbackMetrics,
  startPlayback,
  type FlatStage,
  type Playback,
  type Routine,
} from "./timer";

export type TimerCueKind = "stage" | "warning" | "complete";
export type TimerCueHandler = (kind: TimerCueKind, stage: FlatStage) => void;

/**
 * Timestamp-based timing keeps the visible state accurate after Safari throttles
 * callbacks. It does not guarantee sounds while iOS suspends the browser.
 * `progress` is the current timed stage's progress (manual stages return zero).
 */
export function useTimer(routine: Routine, onCue?: TimerCueHandler) {
  // A caller may reconstruct the same routine object on every render. Only an
  // actual definition change should discard its running session.
  const definition = JSON.stringify(routine);
  const stages = useMemo(
    () => compileRoutine(JSON.parse(definition) as Routine),
    [definition],
  );
  const cueRef = useRef(onCue);
  cueRef.current = onCue;
  const [playback, setPlayback] = useState<Playback>(createPlayback);
  const playbackRef = useRef(playback);
  const warnedRef = useRef(new Set<string>());

  const commit = useCallback(
    (next: Playback, announceStart = false) => {
      const previous = playbackRef.current;
      playbackRef.current = next;
      setPlayback(next);
      const current = stages[next.index];
      const previousStage = stages[previous.index];
      if (next.status === "completed" && previous.status !== "completed") {
        const last = stages[stages.length - 1];
        if (last) cueRef.current?.("complete", last);
        return;
      }
      const enteredStage = next.index !== previous.index || announceStart;
      if (current && next.status === "running" && enteredStage) {
        cueRef.current?.("stage", current);
      }
      if (
        current?.mode === "timed" &&
        next.status === "running" &&
        routine.warningSeconds > 0
      ) {
        const remaining = current.duration * 1_000 - next.stageElapsedMs;
        const previousRemaining = previousStage
          ? previousStage.duration * 1_000 - previous.stageElapsedMs
          : Infinity;
        if (
          remaining > 0 &&
          remaining <= routine.warningSeconds * 1_000 &&
          !warnedRef.current.has(current.instanceId)
        ) {
          // A catch-up can arrive after the warning point. Announce the current
          // stage once, rather than replaying sounds for every missed interval.
          if (
            !enteredStage &&
            previousRemaining > routine.warningSeconds * 1_000
          ) {
            cueRef.current?.("warning", current);
          }
          warnedRef.current.add(current.instanceId);
        }
      }
    },
    [stages, routine.warningSeconds],
  );

  useEffect(() => {
    const ready = createPlayback();
    playbackRef.current = ready;
    warnedRef.current.clear();
    setPlayback(ready);
  }, [definition]);

  const tick = useCallback(() => {
    if (playbackRef.current.status === "running") {
      commit(advancePlayback(playbackRef.current, stages, Date.now()));
    }
  }, [commit, stages]);

  useEffect(() => {
    if (playback.status !== "running") return;
    const interval = window.setInterval(tick, 100);
    const onVisible = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pageshow", tick);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pageshow", tick);
    };
  }, [playback.status, tick]);

  const start = useCallback(() => {
    const previous = playbackRef.current;
    if (previous.status === "completed") warnedRef.current.clear();
    commit(
      startPlayback(previous, stages, Date.now()),
      previous.status === "ready" || previous.status === "completed",
    );
  }, [commit, stages]);

  const pause = useCallback(() => {
    commit(pausePlayback(playbackRef.current, stages, Date.now()));
  }, [commit, stages]);

  const next = useCallback(() => {
    commit(nextPlayback(playbackRef.current, stages, Date.now()));
  }, [commit, stages]);

  const restart = useCallback(() => {
    warnedRef.current.clear();
    const ready = createPlayback();
    playbackRef.current = ready;
    setPlayback(ready);
  }, []);

  const metrics = playbackMetrics(playback, stages);
  return {
    status: playback.status,
    stages,
    ...metrics,
    index: playback.index,
    stageElapsedMs: playback.stageElapsedMs,
    elapsedMs: playback.elapsedMs,
    start,
    pause,
    resume: start,
    next,
    restart,
  };
}
