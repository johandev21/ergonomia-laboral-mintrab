export type AppMode = "postura" | "pausa";

export type ModelVariant = "lightning" | "thunder";

export type AnalysisSide = "auto" | "left" | "right";

export type ExerciseType = "squat" | "arm-raise" | "neck-tilt";

export type PostureStatus = "sin-pose" | "optima" | "advertencia" | "riesgo";

export type ExercisePhase = "esperando" | "arriba" | "abajo" | "transicion";

export type StatusTone = "neutral" | "error";

export interface KeypointMeta {
  index: number;
  name: string;
  labelEs: string;
}

export interface PoseKeypoint {
  index: number;
  name: string;
  labelEs: string;
  x: number;
  y: number;
  score: number;
}

export interface CalibrationSettings {
  modelVariant: ModelVariant;
  side: AnalysisSide;
  minConfidence: number;
  neckThresholdDeg: number;
  showOverlay: boolean;
  mirrorCamera: boolean;
  targetReps: number;
}

export interface PostureMetrics {
  status: PostureStatus;
  score: number;
  neckAngleDeg: number | null;
  shoulderTiltDeg: number | null;
  torsoLeanDeg: number | null;
  diagnosis: string;
  recommendation: string;
  visibleCount: number;
}

export interface ExerciseSnapshot {
  exercise: ExerciseType;
  reps: number;
  targetReps: number;
  currentAngleDeg: number | null;
  phase: ExercisePhase;
  feedback: string;
  completed: boolean;
}

export interface ExerciseTracker {
  update(
    keypoints: readonly PoseKeypoint[],
    settings: Pick<CalibrationSettings, "side" | "minConfidence">,
  ): ExerciseSnapshot;
  reset(nextExercise?: ExerciseType, nextTargetReps?: number): ExerciseSnapshot;
  getSnapshot(): ExerciseSnapshot;
}

export interface SessionSummary {
  framesAnalyzed: number;
  optimalFrames: number;
  alertFrames: number;
  lastInferenceMs: number | null;
  backend: string;
  postureHistory: PostureStatus[];
}

export interface PoseInferenceResult {
  keypoints: PoseKeypoint[];
  inferenceMs: number;
}

export interface PoseEngine {
  init(variant: ModelVariant): Promise<{ backend: string }>;
  switchVariant(variant: ModelVariant): Promise<{ backend: string }>;
  estimate(
    source: HTMLVideoElement | HTMLCanvasElement | HTMLImageElement,
  ): Promise<PoseInferenceResult>;
  reset(): void;
  dispose(): void;
}

export interface DrawPoseOptions {
  width: number;
  height: number;
  minConfidence: number;
  showOverlay: boolean;
  mirror: boolean;
  status: PostureStatus;
  mode: AppMode;
  exercise: ExerciseType;
  side: AnalysisSide;
  highlightAngleDeg?: number | null;
}
