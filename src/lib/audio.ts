import { useEffect, useState } from "react";
import type { FlatStage } from "./timer";
let context: AudioContext | undefined;
export async function unlockAudio() {
  try {
    const Audio =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    if (!context || context.state === "closed") context = new Audio();
    if (context.state !== "running") await context.resume();
  } catch {
    /* Cues remain optional when the browser blocks audio. */
  }
}
export function playCue(
  kind: "stage" | "warning" | "complete",
  stage: FlatStage,
  sound: boolean,
  vibration: boolean,
) {
  if (vibration && "vibrate" in navigator)
    navigator.vibrate(kind === "complete" ? [100, 80, 100] : 80);
  if (
    !sound ||
    !context ||
    context.state !== "running" ||
    (stage.cue === "none" && kind !== "complete")
  )
    return;
  const ctx = context;
  const notes =
    kind === "complete"
      ? [660, 830, 990]
      : kind === "warning"
        ? [660]
        : stage.cue === "bell"
          ? [880, 1320]
          : stage.cue === "soft"
            ? [523]
            : [880];
  notes.forEach((frequency, index) => {
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    const start = ctx.currentTime + index * 0.14;
    oscillator.type = stage.cue === "bell" ? "triangle" : "sine";
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(0.13, start + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, start + 0.4);
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start(start);
    oscillator.stop(start + 0.42);
  });
}
export function useWakeLock(active: boolean) {
  const [state, setState] = useState<"off" | "active" | "unavailable">("off");
  useEffect(() => {
    let cancelled = false;
    let lock: WakeLockSentinel | undefined;
    const request = async () => {
      if (!active || document.visibilityState !== "visible") return;
      try {
        if (!("wakeLock" in navigator)) {
          setState("unavailable");
          return;
        }
        const next = await navigator.wakeLock.request("screen");
        if (cancelled) {
          await next.release();
          return;
        }
        lock = next;
        setState("active");
        next.addEventListener("release", () => {
          if (!cancelled) setState("off");
        });
      } catch {
        if (!cancelled) setState("unavailable");
      }
    };
    if (active) void request();
    else setState("off");
    document.addEventListener("visibilitychange", request);
    return () => {
      cancelled = true;
      void lock?.release();
      document.removeEventListener("visibilitychange", request);
    };
  }, [active]);
  return state;
}
