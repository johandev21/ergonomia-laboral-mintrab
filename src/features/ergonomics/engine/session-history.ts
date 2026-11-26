import { EXERCISE_OPTIONS } from "../constants/ergonomics-options";
import type {
  AlertSeverity,
  CompletedBreakEvent,
  ExerciseType,
  HistorySource,
  PostureAlertEpisode,
  PostureMetrics,
  PostureStatus,
  SessionHistoryEvent,
  SessionSummary,
  TimelineBucket,
} from "../types/ergonomics.types";

export const HISTORY_STORAGE_KEY = "mintrab-ergonomia-history-v1";
export const TIMELINE_SLOT_COUNT = 28;
const MAX_HISTORY_EVENTS = 500;
const MAX_TIMELINE_BUCKETS = 3600;
const CAMERA_ENTER_ALERT_FRAMES = 3;
const CAMERA_EXIT_ALERT_FRAMES = 2;

const STATUS_PRIORITY: Record<PostureStatus, number> = {
  "sin-pose": 0,
  optima: 1,
  advertencia: 2,
  riesgo: 3,
};

interface PersistedHistoryPayload {
  version: 1;
  framesAnalyzed: number;
  optimalFrames: number;
  alertFrames: number;
  warningFrames: number;
  riskFrames: number;
  worstNeckAngleDeg: number | null;
  buckets: TimelineBucket[];
  events: SessionHistoryEvent[];
}

export interface RecordFrameOptions {
  posture: PostureMetrics;
  inferenceMs: number;
  now: number;
  source: HistorySource;
  fileName?: string;
}

export interface RecordFrameResult {
  structuralChange: boolean;
  shouldPersist: boolean;
}

export interface SessionHistoryStore {
  recordFrame(options: RecordFrameOptions): RecordFrameResult;
  recordActiveBreakFrame(inferenceMs: number): void;
  recordCompletedBreak(
    exercise: ExerciseType,
    reps: number,
    targetReps: number,
    now: number,
  ): RecordFrameResult;
  finalizeActiveEpisode(now: number): boolean;
  setBackend(backend: string): void;
  clearAll(): void;
  persist(): void;
  getSummary(): SessionSummary;
}

function pickMoreSevereStatus(a: PostureStatus, b: PostureStatus): PostureStatus {
  return STATUS_PRIORITY[b] > STATUS_PRIORITY[a] ? b : a;
}

function maxNullable(a: number | null, b: number | null): number | null {
  if (a === null) return b;
  if (b === null) return a;
  return Math.max(a, b);
}

function isAlertStatus(status: PostureStatus): status is AlertSeverity {
  return status === "advertencia" || status === "riesgo";
}

function foldBuckets(buckets: TimelineBucket[]): TimelineBucket[] {
  const folded: TimelineBucket[] = [];
  for (let i = 0; i < buckets.length; i += 2) {
    const first = buckets[i];
    const second = buckets[i + 1];
    if (!second) {
      folded.push(first);
      continue;
    }
    folded.push({
      timestamp: first.timestamp,
      status: pickMoreSevereStatus(first.status, second.status),
      minScore: Math.min(first.minScore, second.minScore),
    });
  }
  return folded;
}

export function compressTimelineToSlots(
  buckets: readonly TimelineBucket[],
  slotCount = TIMELINE_SLOT_COUNT,
): PostureStatus[] {
  if (buckets.length === 0) {
    return [];
  }
  if (buckets.length <= slotCount) {
    return buckets.map((bucket) => bucket.status);
  }

  const slots: PostureStatus[] = [];
  for (let i = 0; i < slotCount; i += 1) {
    const start = Math.floor((i * buckets.length) / slotCount);
    const end = Math.max(start + 1, Math.floor(((i + 1) * buckets.length) / slotCount));
    let worst: PostureStatus = buckets[start].status;
    for (let j = start + 1; j < end && j < buckets.length; j += 1) {
      worst = pickMoreSevereStatus(worst, buckets[j].status);
    }
    slots.push(worst);
  }
  return slots;
}

function isValidStatus(value: unknown): value is PostureStatus {
  return (
    value === "sin-pose" || value === "optima" || value === "advertencia" || value === "riesgo"
  );
}

function isValidEvent(value: unknown): value is SessionHistoryEvent {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.id !== "string") return false;
  if (candidate.kind === "postura") {
    return (
      typeof candidate.startedAt === "number" &&
      typeof candidate.durationMs === "number" &&
      (candidate.severity === "advertencia" || candidate.severity === "riesgo") &&
      typeof candidate.minScore === "number" &&
      typeof candidate.diagnosis === "string" &&
      (candidate.source === "camara" || candidate.source === "foto")
    );
  }
  if (candidate.kind === "pausa") {
    return (
      typeof candidate.timestamp === "number" &&
      typeof candidate.exercise === "string" &&
      typeof candidate.exerciseLabel === "string" &&
      typeof candidate.reps === "number" &&
      typeof candidate.targetReps === "number"
    );
  }
  return false;
}

function loadPersistedState(storage: Storage | null): PersistedHistoryPayload | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(HISTORY_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PersistedHistoryPayload>;
    if (parsed.version !== 1) return null;
    const buckets = Array.isArray(parsed.buckets)
      ? parsed.buckets.filter(
          (b): b is TimelineBucket =>
            Boolean(b) &&
            typeof b.timestamp === "number" &&
            isValidStatus(b.status) &&
            typeof b.minScore === "number",
        )
      : [];
    const events = Array.isArray(parsed.events)
      ? parsed.events.filter(isValidEvent).map((ev) => {
          if (ev.kind === "postura" && ev.endedAt === null) {
            return { ...ev, endedAt: ev.startedAt + ev.durationMs };
          }
          return ev;
        })
      : [];

    return {
      version: 1,
      framesAnalyzed: typeof parsed.framesAnalyzed === "number" ? parsed.framesAnalyzed : 0,
      optimalFrames: typeof parsed.optimalFrames === "number" ? parsed.optimalFrames : 0,
      alertFrames: typeof parsed.alertFrames === "number" ? parsed.alertFrames : 0,
      warningFrames: typeof parsed.warningFrames === "number" ? parsed.warningFrames : 0,
      riskFrames: typeof parsed.riskFrames === "number" ? parsed.riskFrames : 0,
      worstNeckAngleDeg:
        typeof parsed.worstNeckAngleDeg === "number" ? parsed.worstNeckAngleDeg : null,
      buckets: buckets.slice(-MAX_TIMELINE_BUCKETS),
      events: events.slice(0, MAX_HISTORY_EVENTS),
    };
  } catch {
    return null;
  }
}

function getSafeLocalStorage(): Storage | null {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      return window.localStorage;
    }
  } catch {
    return null;
  }
  return null;
}

export function createSessionHistoryStore(options?: {
  storage?: Storage | null;
}): SessionHistoryStore {
  const storage =
    options && "storage" in options ? (options.storage ?? null) : getSafeLocalStorage();
  const initial = loadPersistedState(storage);

  let framesAnalyzed = initial?.framesAnalyzed ?? 0;
  let optimalFrames = initial?.optimalFrames ?? 0;
  let alertFrames = initial?.alertFrames ?? 0;
  let warningFrames = initial?.warningFrames ?? 0;
  let riskFrames = initial?.riskFrames ?? 0;
  let worstNeckAngleDeg: number | null = initial?.worstNeckAngleDeg ?? null;
  let lastInferenceMs: number | null = null;
  let backend = "";

  let buckets: TimelineBucket[] = initial?.buckets ? [...initial.buckets] : [];
  let events: SessionHistoryEvent[] = initial?.events ? [...initial.events] : [];

  let activeEpisode: PostureAlertEpisode | null = null;
  let pendingAlertCount = 0;
  let pendingFirstAlertAt = 0;
  let pendingSeverity: AlertSeverity = "advertencia";
  let pendingMinScore = 100;
  let pendingPeakNeck: number | null = null;
  let pendingPeakShoulder: number | null = null;
  let pendingPeakTorso: number | null = null;
  let pendingDiagnosis = "";
  let exitAlertCount = 0;
  let lastCameraBucketSec: number | null = null;
  let seq = 0;

  function nextId(prefix: string, now: number): string {
    seq += 1;
    return `${prefix}-${now}-${seq}`;
  }

  function resetPending(): void {
    pendingAlertCount = 0;
    pendingFirstAlertAt = 0;
    pendingSeverity = "advertencia";
    pendingMinScore = 100;
    pendingPeakNeck = null;
    pendingPeakShoulder = null;
    pendingPeakTorso = null;
    pendingDiagnosis = "";
  }

  function trimEvents(): void {
    if (events.length > MAX_HISTORY_EVENTS) {
      events = events.slice(0, MAX_HISTORY_EVENTS);
    }
  }

  function pushTimelineBucket(posture: PostureMetrics, now: number, source: HistorySource): void {
    if (source === "foto") {
      lastCameraBucketSec = null;
      buckets.push({
        timestamp: now,
        status: posture.status,
        minScore: posture.score,
      });
    } else {
      const currentSec = Math.floor(now / 1000);
      if (lastCameraBucketSec === currentSec && buckets.length > 0) {
        const last = buckets[buckets.length - 1];
        last.status = pickMoreSevereStatus(last.status, posture.status);
        last.minScore = Math.min(last.minScore, posture.score);
      } else {
        lastCameraBucketSec = currentSec;
        buckets.push({
          timestamp: now,
          status: posture.status,
          minScore: posture.score,
        });
      }
    }

    if (buckets.length > MAX_TIMELINE_BUCKETS) {
      buckets = foldBuckets(buckets);
    }
  }

  function persist(): void {
    if (!storage) return;
    try {
      const serializableEvents = events.map((ev) => {
        if (ev.kind === "postura" && ev.endedAt === null) {
          return { ...ev, endedAt: ev.startedAt + ev.durationMs };
        }
        return ev;
      });
      const payload: PersistedHistoryPayload = {
        version: 1,
        framesAnalyzed,
        optimalFrames,
        alertFrames,
        warningFrames,
        riskFrames,
        worstNeckAngleDeg,
        buckets,
        events: serializableEvents,
      };
      storage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // Ignore storage quota or private-mode errors silently.
    }
  }

  function closeActiveEpisode(now: number): boolean {
    resetPending();
    exitAlertCount = 0;
    if (!activeEpisode) {
      return false;
    }
    activeEpisode.endedAt = now;
    activeEpisode.durationMs = Math.max(0, now - activeEpisode.startedAt);
    activeEpisode = null;
    return true;
  }

  return {
    recordFrame({ posture, inferenceMs, now, source, fileName }) {
      let structuralChange = false;
      let shouldPersist = false;

      framesAnalyzed += 1;
      lastInferenceMs = inferenceMs;

      if (posture.status === "optima") {
        optimalFrames += 1;
      } else if (posture.status === "advertencia") {
        alertFrames += 1;
        warningFrames += 1;
      } else if (posture.status === "riesgo") {
        alertFrames += 1;
        riskFrames += 1;
      }

      if (posture.neckAngleDeg !== null) {
        worstNeckAngleDeg = maxNullable(worstNeckAngleDeg, posture.neckAngleDeg);
      }

      pushTimelineBucket(posture, now, source);

      if (source === "foto") {
        if (closeActiveEpisode(now)) {
          structuralChange = true;
        }
        if (isAlertStatus(posture.status)) {
          const episode: PostureAlertEpisode = {
            id: nextId("postura", now),
            kind: "postura",
            startedAt: now,
            endedAt: now,
            durationMs: 0,
            severity: posture.status,
            minScore: posture.score,
            peakNeckAngleDeg: posture.neckAngleDeg,
            peakShoulderTiltDeg: posture.shoulderTiltDeg,
            peakTorsoLeanDeg: posture.torsoLeanDeg,
            diagnosis: posture.diagnosis,
            source: "foto",
            fileName,
          };
          events.unshift(episode);
          trimEvents();
          structuralChange = true;
        }
        shouldPersist = true;
        return { structuralChange, shouldPersist };
      }

      // Live camera stream with hysteresis (3 frames to open, 2 frames to close)
      if (isAlertStatus(posture.status)) {
        exitAlertCount = 0;
        if (activeEpisode) {
          activeEpisode.durationMs = Math.max(0, now - activeEpisode.startedAt);
          if (posture.status === "riesgo" && activeEpisode.severity !== "riesgo") {
            activeEpisode.severity = "riesgo";
            activeEpisode.diagnosis = posture.diagnosis;
            structuralChange = true;
          }
          if (posture.score <= activeEpisode.minScore) {
            activeEpisode.minScore = posture.score;
            if (posture.status === activeEpisode.severity) {
              activeEpisode.diagnosis = posture.diagnosis;
            }
          }
          activeEpisode.peakNeckAngleDeg = maxNullable(
            activeEpisode.peakNeckAngleDeg,
            posture.neckAngleDeg,
          );
          activeEpisode.peakShoulderTiltDeg = maxNullable(
            activeEpisode.peakShoulderTiltDeg,
            posture.shoulderTiltDeg,
          );
          activeEpisode.peakTorsoLeanDeg = maxNullable(
            activeEpisode.peakTorsoLeanDeg,
            posture.torsoLeanDeg,
          );
        } else {
          if (pendingAlertCount === 0) {
            pendingFirstAlertAt = now;
            pendingSeverity = posture.status;
            pendingMinScore = posture.score;
            pendingDiagnosis = posture.diagnosis;
          } else {
            if (posture.status === "riesgo") {
              pendingSeverity = "riesgo";
            }
            if (posture.score <= pendingMinScore) {
              pendingMinScore = posture.score;
              pendingDiagnosis = posture.diagnosis;
            }
          }
          pendingPeakNeck = maxNullable(pendingPeakNeck, posture.neckAngleDeg);
          pendingPeakShoulder = maxNullable(pendingPeakShoulder, posture.shoulderTiltDeg);
          pendingPeakTorso = maxNullable(pendingPeakTorso, posture.torsoLeanDeg);
          pendingAlertCount += 1;

          if (pendingAlertCount >= CAMERA_ENTER_ALERT_FRAMES) {
            const episode: PostureAlertEpisode = {
              id: nextId("postura", pendingFirstAlertAt),
              kind: "postura",
              startedAt: pendingFirstAlertAt,
              endedAt: null,
              durationMs: Math.max(0, now - pendingFirstAlertAt),
              severity: pendingSeverity,
              minScore: pendingMinScore,
              peakNeckAngleDeg: pendingPeakNeck,
              peakShoulderTiltDeg: pendingPeakShoulder,
              peakTorsoLeanDeg: pendingPeakTorso,
              diagnosis: pendingDiagnosis,
              source: "camara",
            };
            activeEpisode = episode;
            events.unshift(episode);
            trimEvents();
            resetPending();
            structuralChange = true;
            shouldPersist = true;
          }
        }
      } else {
        resetPending();
        if (activeEpisode) {
          exitAlertCount += 1;
          if (exitAlertCount >= CAMERA_EXIT_ALERT_FRAMES) {
            closeActiveEpisode(now);
            structuralChange = true;
            shouldPersist = true;
          }
        }
      }

      return { structuralChange, shouldPersist };
    },

    recordActiveBreakFrame(inferenceMs) {
      framesAnalyzed += 1;
      lastInferenceMs = inferenceMs;
    },

    recordCompletedBreak(exercise, reps, targetReps, now) {
      const label = EXERCISE_OPTIONS.find((opt) => opt.value === exercise)?.label ?? "Pausa activa";
      const breakEvent: CompletedBreakEvent = {
        id: nextId("pausa", now),
        kind: "pausa",
        timestamp: now,
        exercise,
        exerciseLabel: label,
        reps,
        targetReps,
      };
      events.unshift(breakEvent);
      trimEvents();
      return { structuralChange: true, shouldPersist: true };
    },

    finalizeActiveEpisode(now) {
      const closed = closeActiveEpisode(now);
      if (closed) {
        persist();
      }
      return closed;
    },

    setBackend(nextBackend) {
      backend = nextBackend;
    },

    clearAll() {
      framesAnalyzed = 0;
      optimalFrames = 0;
      alertFrames = 0;
      warningFrames = 0;
      riskFrames = 0;
      worstNeckAngleDeg = null;
      lastInferenceMs = null;
      buckets = [];
      events = [];
      activeEpisode = null;
      lastCameraBucketSec = null;
      exitAlertCount = 0;
      resetPending();
      if (storage) {
        try {
          storage.removeItem(HISTORY_STORAGE_KEY);
        } catch {
          // Ignore storage removal errors.
        }
      }
    },

    persist,

    getSummary(): SessionSummary {
      return {
        framesAnalyzed,
        optimalFrames,
        alertFrames,
        warningFrames,
        riskFrames,
        worstNeckAngleDeg,
        lastInferenceMs,
        backend,
        postureHistory: compressTimelineToSlots(buckets, TIMELINE_SLOT_COUNT),
        timelineSampleCount: buckets.length,
        historyEvents: events.map((ev) => ({ ...ev })),
        activeEpisodeId: activeEpisode?.id ?? null,
      };
    },
  };
}

function escapeCsvCell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  if (/[",\n\r]/.test(safe)) {
    return `"${safe.replace(/"/g, '""')}"`;
  }
  return safe;
}

function formatCsvTimestamp(epochMs: number): string {
  const d = new Date(epochMs);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function buildHistoryCsv(events: readonly SessionHistoryEvent[]): string {
  const headers = [
    "Fecha y hora",
    "Tipo",
    "Severidad",
    "Detalle",
    "Duración (s)",
    "Puntaje mín. (%)",
    "Cuello máx. (°)",
    "Hombros máx. (°)",
    "Tronco máx. (°)",
    "Origen",
  ];

  const rows = events.map((ev) => {
    if (ev.kind === "pausa") {
      return [
        formatCsvTimestamp(ev.timestamp),
        "Pausa activa",
        "Completada",
        `${ev.exerciseLabel} (${ev.reps}/${ev.targetReps} repeticiones)`,
        "",
        "",
        "",
        "",
        "",
        "Cámara",
      ];
    }

    const durationSec = ev.source === "foto" ? "0.0" : (ev.durationMs / 1000).toFixed(1);
    const origen = ev.source === "foto" ? `Fotografía: ${ev.fileName ?? "imagen"}` : "Cámara";
    return [
      formatCsvTimestamp(ev.startedAt),
      "Postura",
      ev.severity === "riesgo" ? "Riesgo" : "Advertencia",
      ev.diagnosis,
      durationSec,
      String(ev.minScore),
      ev.peakNeckAngleDeg === null ? "" : ev.peakNeckAngleDeg.toFixed(1),
      ev.peakShoulderTiltDeg === null ? "" : ev.peakShoulderTiltDeg.toFixed(1),
      ev.peakTorsoLeanDeg === null ? "" : ev.peakTorsoLeanDeg.toFixed(1),
      origen,
    ];
  });

  const lines = [headers, ...rows].map((row) => row.map(escapeCsvCell).join(","));
  return `\uFEFF${lines.join("\r\n")}`;
}

export function downloadHistoryCsv(events: readonly SessionHistoryEvent[]): void {
  if (typeof document === "undefined" || events.length === 0) return;
  const csv = buildHistoryCsv(events);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const today = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const filename = `historial-ergonomia-${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}.csv`;

  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
