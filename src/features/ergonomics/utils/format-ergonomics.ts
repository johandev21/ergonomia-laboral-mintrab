import type { SessionSummary } from "../types/ergonomics.types";

export function formatDegrees(value: number | null): string {
  return value === null ? "Sin dato" : `${value.toFixed(1)}°`;
}

export function formatBackendLabel(backend: string): string {
  if (!backend) return "En espera";
  if (backend.toLowerCase() === "webgl") return "WebGL";
  if (backend.toLowerCase() === "cpu") return "CPU";
  return backend;
}

export function computeOptimalPercent(
  session: Pick<SessionSummary, "framesAnalyzed" | "optimalFrames">,
): number {
  return session.framesAnalyzed > 0
    ? Math.round((session.optimalFrames / session.framesAnalyzed) * 100)
    : 0;
}

export function formatClockTime(epochMs: number): string {
  const date = new Date(epochMs);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

export function formatDurationShort(durationMs: number): string {
  const safeMs = Math.max(0, durationMs);
  if (safeMs < 1000) return "< 1\u00A0s";
  if (safeMs < 60_000) return `${(safeMs / 1000).toFixed(1)}\u00A0s`;
  const totalSecs = Math.floor(safeMs / 1000);
  const mins = Math.floor(totalSecs / 60);
  const secs = totalSecs % 60;
  return `${mins}\u00A0min ${secs}\u00A0s`;
}

export function formatSessionSpan(sampleCount: number): string {
  const safeCount = Math.max(0, Math.floor(sampleCount));
  if (safeCount === 1) return "1 lectura";
  if (safeCount < 60) return `${safeCount}\u00A0s de sesión`;
  const mins = Math.floor(safeCount / 60);
  const secs = safeCount % 60;
  return `${mins}\u00A0min ${secs}\u00A0s`;
}
