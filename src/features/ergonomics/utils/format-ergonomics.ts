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
