import { Button } from "@ui-sdk/react/button";
import { Field, FieldLabel } from "@ui-sdk/react/field";
import { Meter, MeterIndicator, MeterLabel, MeterTrack, MeterValue } from "@ui-sdk/react/meter";
import {
  Progress,
  ProgressIndicator,
  ProgressLabel,
  ProgressTrack,
  ProgressValue,
} from "@ui-sdk/react/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectItemIndicator,
  SelectTrigger,
  SelectValue,
} from "@ui-sdk/react/select";
import {
  EXERCISE_GUIDES,
  EXERCISE_OPTIONS,
  PHASE_LABELS,
  TARGET_REP_OPTIONS,
} from "../constants/ergonomics-options";
import type {
  AppMode,
  ExerciseSnapshot,
  ExerciseType,
  PostureMetrics,
  SessionSummary,
} from "../types/ergonomics.types";
import {
  computeOptimalPercent,
  formatBackendLabel,
  formatDegrees,
} from "../utils/format-ergonomics";

const TARGET_REP_ITEMS = TARGET_REP_OPTIONS.map((reps) => ({
  value: String(reps),
  label: `${reps} repeticiones`,
}));

export interface EvaluationPanelProps {
  mode: AppMode;
  postureMetrics: PostureMetrics;
  exercise: ExerciseType;
  exerciseSnapshot: ExerciseSnapshot;
  targetReps: number;
  session: SessionSummary;
  onExerciseChange: (exercise: ExerciseType) => void;
  onTargetRepsChange: (reps: number) => void;
  onNextExercise: () => void;
  onRepeatExercise: () => void;
}

export function EvaluationPanel({
  mode,
  postureMetrics,
  exercise,
  exerciseSnapshot,
  targetReps,
  session,
  onExerciseChange,
  onTargetRepsChange,
  onNextExercise,
  onRepeatExercise,
}: EvaluationPanelProps) {
  const optimalPercent = computeOptimalPercent(session);

  return (
    <div className="panel-stack">
      {mode === "postura" ? (
        <>
          <div className="panel-group">
            <Meter
              value={postureMetrics.score}
              min={0}
              max={100}
              data-status={postureMetrics.status}
              getValueLabel={(val) => `${val} de 100 puntos`}
            >
              <MeterLabel>Índice ergonómico</MeterLabel>
              <MeterValue>{`${postureMetrics.score}%`}</MeterValue>
              <MeterTrack>
                <MeterIndicator />
              </MeterTrack>
            </Meter>

            <div className="diagnosis-block" data-status={postureMetrics.status}>
              <h2 className="diagnosis-heading">{postureMetrics.diagnosis}</h2>
              <p className="diagnosis-copy">{postureMetrics.recommendation}</p>
            </div>
          </div>

          <PostureMetricsList postureMetrics={postureMetrics} optimalPercent={optimalPercent} />
        </>
      ) : (
        <ActiveBreakSection
          exercise={exercise}
          exerciseSnapshot={exerciseSnapshot}
          targetReps={targetReps}
          onExerciseChange={onExerciseChange}
          onTargetRepsChange={onTargetRepsChange}
          onNextExercise={onNextExercise}
          onRepeatExercise={onRepeatExercise}
        />
      )}

      <SessionTelemetry session={session} />
    </div>
  );
}

interface PostureMetricsListProps {
  postureMetrics: PostureMetrics;
  optimalPercent: number;
}

function PostureMetricsList({ postureMetrics, optimalPercent }: PostureMetricsListProps) {
  return (
    <dl className="metrics-list">
      <div className="metric-row">
        <dt className="metric-label">Inclinación cervical</dt>
        <dd className="metric-value">{formatDegrees(postureMetrics.neckAngleDeg)}</dd>
      </div>
      <div className="metric-row">
        <dt className="metric-label">Nivelación de hombros</dt>
        <dd className="metric-value">{formatDegrees(postureMetrics.shoulderTiltDeg)}</dd>
      </div>
      <div className="metric-row">
        <dt className="metric-label">Inclinación de tronco</dt>
        <dd className="metric-value">{formatDegrees(postureMetrics.torsoLeanDeg)}</dd>
      </div>
      <div className="metric-row">
        <dt className="metric-label">Puntos detectados</dt>
        <dd className="metric-value">{`${postureMetrics.visibleCount}\u00A0/\u00A017`}</dd>
      </div>
      <div className="metric-row">
        <dt className="metric-label">Tiempo en postura óptima</dt>
        <dd className="metric-value">{`${optimalPercent}%`}</dd>
      </div>
    </dl>
  );
}

interface ActiveBreakSectionProps {
  exercise: ExerciseType;
  exerciseSnapshot: ExerciseSnapshot;
  targetReps: number;
  onExerciseChange: (exercise: ExerciseType) => void;
  onTargetRepsChange: (reps: number) => void;
  onNextExercise: () => void;
  onRepeatExercise: () => void;
}

type GuideStepState = "done" | "current" | "pending";

function getGuideStepStates(
  snapshot: ExerciseSnapshot,
): readonly [GuideStepState, GuideStepState, GuideStepState] {
  if (snapshot.completed) {
    return ["done", "done", "done"];
  }
  if (snapshot.currentAngleDeg === null || snapshot.phase === "esperando") {
    return ["current", "pending", "pending"];
  }
  if (!snapshot.hasReachedPeak) {
    return ["done", "current", "pending"];
  }
  return ["done", "done", "current"];
}

function ActiveBreakSection({
  exercise,
  exerciseSnapshot,
  targetReps,
  onExerciseChange,
  onTargetRepsChange,
  onNextExercise,
  onRepeatExercise,
}: ActiveBreakSectionProps) {
  const guide = EXERCISE_GUIDES[exercise];
  const isAtTargetPeak =
    exercise === "squat" ? exerciseSnapshot.phase === "abajo" : exerciseSnapshot.phase === "arriba";

  const coachState = exerciseSnapshot.completed
    ? "completed"
    : isAtTargetPeak
      ? "peak"
      : exerciseSnapshot.currentAngleDeg !== null && exerciseSnapshot.phase !== "esperando"
        ? "active"
        : "waiting";

  const coachTitle =
    coachState === "completed"
      ? "Meta completada"
      : coachState === "peak"
        ? "Rango alcanzado"
        : coachState === "active"
          ? "Movimiento en curso"
          : "Listo para comenzar";

  const stepStates = getGuideStepStates(exerciseSnapshot);

  return (
    <div className="panel-group">
      <div className="exercise-controls-grid">
        <Field>
          <FieldLabel>Ejercicio de pausa activa</FieldLabel>
          <Select
            items={EXERCISE_OPTIONS}
            value={exercise}
            onValueChange={(next) => {
              if (next === "squat" || next === "arm-raise" || next === "neck-tilt") {
                onExerciseChange(next);
              }
            }}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {EXERCISE_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                  <SelectItemIndicator />
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field>
          <FieldLabel>Meta</FieldLabel>
          <Select
            items={TARGET_REP_ITEMS}
            value={String(targetReps)}
            onValueChange={(next) => {
              const parsed = Number(next);
              if (TARGET_REP_OPTIONS.some((option) => option === parsed)) {
                onTargetRepsChange(parsed);
              }
            }}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TARGET_REP_ITEMS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                  <SelectItemIndicator />
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>

      <Progress
        value={exerciseSnapshot.reps}
        min={0}
        max={targetReps}
        data-completed={exerciseSnapshot.completed ? "true" : "false"}
        getValueLabel={(val, details) => `${val ?? 0} de ${details.max} repeticiones`}
      >
        <ProgressLabel>Progreso de pausa activa</ProgressLabel>
        <ProgressValue>{`${exerciseSnapshot.reps}\u00A0/\u00A0${targetReps} repeticiones`}</ProgressValue>
        <ProgressTrack>
          <ProgressIndicator />
        </ProgressTrack>
      </Progress>

      <div className="exercise-coach-block" data-state={coachState}>
        <h2 className="exercise-coach-heading">{coachTitle}</h2>
        <p className="exercise-coach-copy">{exerciseSnapshot.feedback}</p>
        {exerciseSnapshot.completed ? (
          <div className="exercise-complete-actions">
            <Button data-variant="solid" onClick={onNextExercise}>
              Siguiente ejercicio
            </Button>
            <Button onClick={onRepeatExercise}>Repetir serie</Button>
          </div>
        ) : null}
      </div>

      <div className="exercise-guide-card">
        <p className="exercise-framing-tip">{guide.framingTip}</p>
        <ol className="exercise-steps-list" aria-label="Pasos del ejercicio">
          {guide.steps.map((step, index) => (
            <li key={step} className="exercise-step" data-state={stepStates[index]}>
              <span className="exercise-step-index" aria-hidden="true">
                {stepStates[index] === "done" ? "\u2713" : index + 1}
              </span>
              <span className="exercise-step-label">{step}</span>
            </li>
          ))}
        </ol>
      </div>

      <dl className="metrics-list">
        <div className="metric-row">
          <dt className="metric-label">Ángulo articular</dt>
          <dd className="metric-value">
            {exerciseSnapshot.currentAngleDeg === null
              ? "Sin dato"
              : `${formatDegrees(exerciseSnapshot.currentAngleDeg)} · ${guide.targetLabel}`}
          </dd>
        </div>
        <div className="metric-row">
          <dt className="metric-label">Fase actual</dt>
          <dd className="metric-value">{PHASE_LABELS[exerciseSnapshot.phase]}</dd>
        </div>
      </dl>
    </div>
  );
}

interface SessionTelemetryProps {
  session: SessionSummary;
}

function SessionTelemetry({ session }: SessionTelemetryProps) {
  return (
    <div className="session-telemetry">
      <div className="telemetry-item">
        <span className="telemetry-label">Cuadros analizados</span>
        <span className="telemetry-value">{session.framesAnalyzed}</span>
      </div>
      <div className="telemetry-item">
        <span className="telemetry-label">Latencia de inferencia</span>
        <span className="telemetry-value">
          {session.lastInferenceMs === null ? "\u2013" : `${session.lastInferenceMs}\u00A0ms`}
        </span>
      </div>
      <div className="telemetry-item">
        <span className="telemetry-label">Motor activo</span>
        <span className="telemetry-value">{formatBackendLabel(session.backend)}</span>
      </div>
    </div>
  );
}
