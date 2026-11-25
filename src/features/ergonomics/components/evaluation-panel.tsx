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
import { EXERCISE_OPTIONS, PHASE_LABELS } from "../constants/ergonomics-options";
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

export interface EvaluationPanelProps {
  mode: AppMode;
  postureMetrics: PostureMetrics;
  exercise: ExerciseType;
  exerciseSnapshot: ExerciseSnapshot;
  targetReps: number;
  session: SessionSummary;
  onExerciseChange: (exercise: ExerciseType) => void;
}

export function EvaluationPanel({
  mode,
  postureMetrics,
  exercise,
  exerciseSnapshot,
  targetReps,
  session,
  onExerciseChange,
}: EvaluationPanelProps) {
  const optimalPercent = computeOptimalPercent(session);

  return (
    <div className="panel-stack">
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

      {mode === "postura" ? (
        <PostureMetricsList postureMetrics={postureMetrics} optimalPercent={optimalPercent} />
      ) : (
        <ActiveBreakSection
          exercise={exercise}
          exerciseSnapshot={exerciseSnapshot}
          targetReps={targetReps}
          onExerciseChange={onExerciseChange}
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
}

function ActiveBreakSection({
  exercise,
  exerciseSnapshot,
  targetReps,
  onExerciseChange,
}: ActiveBreakSectionProps) {
  return (
    <div className="panel-group">
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

      <Progress
        value={exerciseSnapshot.reps}
        min={0}
        max={targetReps}
        getValueLabel={(val, details) => `${val ?? 0} de ${details.max} repeticiones`}
      >
        <ProgressLabel>Progreso de pausa activa</ProgressLabel>
        <ProgressValue>{`${exerciseSnapshot.reps}\u00A0/\u00A0${targetReps} repeticiones`}</ProgressValue>
        <ProgressTrack>
          <ProgressIndicator />
        </ProgressTrack>
      </Progress>

      <dl className="metrics-list">
        <div className="metric-row">
          <dt className="metric-label">Ángulo articular</dt>
          <dd className="metric-value">{formatDegrees(exerciseSnapshot.currentAngleDeg)}</dd>
        </div>
        <div className="metric-row">
          <dt className="metric-label">Fase actual</dt>
          <dd className="metric-value">{PHASE_LABELS[exerciseSnapshot.phase]}</dd>
        </div>
      </dl>

      <p className="exercise-cue">{exerciseSnapshot.feedback}</p>
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
