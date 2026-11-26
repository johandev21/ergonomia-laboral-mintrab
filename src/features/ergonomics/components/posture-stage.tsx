import {
  AlertDialog,
  AlertDialogBackdrop,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@ui-sdk/react/alert-dialog";
import { Button } from "@ui-sdk/react/button";
import { FileInput, FileInputTrigger } from "@ui-sdk/react/file-input";
import type { RefObject } from "react";
import { CANVAS_HEIGHT, CANVAS_WIDTH, EXERCISE_OPTIONS } from "../constants/ergonomics-options";
import type {
  AppMode,
  ExerciseType,
  SessionHistoryEvent,
  SessionSummary,
  StatusTone,
} from "../types/ergonomics.types";
import { computeOptimalPercent } from "../utils/format-ergonomics";

const TIMELINE_SLOTS = Array.from({ length: 28 }, (_, slot) => `slot-${slot}`);

export interface PostureStageProps {
  videoRef: RefObject<HTMLVideoElement | null>;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  mode: AppMode;
  exercise: ExerciseType;
  cameraActive: boolean;
  photoActive: boolean;
  engineLoading: boolean;
  photoFiles: File[];
  session: SessionSummary;
  statusMessage: string;
  statusTone: StatusTone;
  statusFileName?: string | null;
  onStartCamera: () => void;
  onStopCamera: () => void;
  onSelectPhotos: (files: File[]) => void;
  onSelectExercise: (exercise: ExerciseType) => void;
  onResetSession: () => void;
  onClearRecords: () => void;
}

export function PostureStage({
  videoRef,
  canvasRef,
  mode,
  exercise,
  cameraActive,
  photoActive,
  engineLoading,
  photoFiles,
  session,
  statusMessage,
  statusTone,
  statusFileName,
  onStartCamera,
  onStopCamera,
  onSelectPhotos,
  onSelectExercise,
  onResetSession,
  onClearRecords,
}: PostureStageProps) {
  return (
    <section className="stage-column" aria-label="Visor de análisis postural">
      <div className="stage-frame">
        <video ref={videoRef} className="stage-video-hidden" playsInline muted />
        <canvas
          ref={canvasRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          className="stage-canvas"
        />
        {!cameraActive && !photoActive && <StageEmptyState mode={mode} />}
      </div>

      <StageActionBar
        cameraActive={cameraActive}
        engineLoading={engineLoading}
        photoFiles={photoFiles}
        onStartCamera={onStartCamera}
        onStopCamera={onStopCamera}
        onSelectPhotos={onSelectPhotos}
        onResetSession={onResetSession}
        onClearRecords={onClearRecords}
      />

      {mode === "postura" ? (
        <PostureTimeline session={session} />
      ) : (
        <ActiveBreakRoutineCard
          exercise={exercise}
          historyEvents={session.historyEvents}
          onSelectExercise={onSelectExercise}
        />
      )}

      <div
        className="status-banner"
        role="status"
        aria-label="Estado del análisis"
        aria-live="polite"
        data-tone={statusTone}
      >
        {statusFileName ? (
          <>
            Fotografía analizada: <bdi className="status-filename">{statusFileName}</bdi>.
          </>
        ) : (
          statusMessage
        )}
      </div>
    </section>
  );
}

interface StageEmptyStateProps {
  mode: AppMode;
}

function StageEmptyState({ mode }: StageEmptyStateProps) {
  return (
    <div className="stage-empty">
      <h2 className="stage-empty-title">
        {mode === "postura"
          ? "Evaluación postural en navegador"
          : "Pausa activa guiada en navegador"}
      </h2>
      <p className="stage-empty-copy">
        {mode === "postura"
          ? "Active la cámara web o cargue una fotografía para medir alineación cervical, hombros y pausas activas sin enviar datos fuera de su equipo."
          : "Active la cámara web para seguir paso a paso las repeticiones de su pausa activa sin enviar datos fuera de su equipo."}
      </p>
    </div>
  );
}

interface StageActionBarProps {
  cameraActive: boolean;
  engineLoading: boolean;
  photoFiles: File[];
  onStartCamera: () => void;
  onStopCamera: () => void;
  onSelectPhotos: (files: File[]) => void;
  onResetSession: () => void;
  onClearRecords: () => void;
}

function StageActionBar({
  cameraActive,
  engineLoading,
  photoFiles,
  onStartCamera,
  onStopCamera,
  onSelectPhotos,
  onResetSession,
  onClearRecords,
}: StageActionBarProps) {
  return (
    <div className="action-bar">
      <div className="action-group action-group-capture">
        <Button
          data-variant="solid"
          disabled={cameraActive || engineLoading}
          pendingAnnouncement="Iniciando cámara"
          onClick={onStartCamera}
        >
          Activar cámara
        </Button>

        <Button disabled={!cameraActive} onClick={onStopCamera}>
          Detener cámara
        </Button>

        <FileInput
          aria-label="Analizar fotografía"
          accept="image/*"
          value={photoFiles}
          announcement={({ added }) =>
            added.length > 0 ? `Fotografía cargada: ${added.map((f) => f.name).join(", ")}.` : null
          }
          onValueChange={onSelectPhotos}
        >
          <FileInputTrigger>Analizar fotografía</FileInputTrigger>
        </FileInput>
      </div>

      <div className="action-group action-group-session">
        <Button onClick={onResetSession}>Reiniciar sesión</Button>

        <ClearRecordsDialog onConfirm={onClearRecords} />
      </div>
    </div>
  );
}

interface PostureTimelineProps {
  session: SessionSummary;
}

function PostureTimeline({ session }: PostureTimelineProps) {
  const optimalPercent = computeOptimalPercent(session);
  const alertEpisodeCount = session.historyEvents.filter((ev) => ev.kind === "postura").length;
  const alertLabel = alertEpisodeCount === 1 ? "1 alerta" : `${alertEpisodeCount} alertas`;
  const frameLabel =
    session.framesAnalyzed === 1 ? "1 lectura" : `${session.framesAnalyzed} cuadros`;
  const summary =
    session.framesAnalyzed === 0 && session.postureHistory.length === 0
      ? "Sin lecturas aún · historial de la sesión"
      : `${optimalPercent}% óptima · ${alertLabel} · ${frameLabel}`;

  return (
    <section className="timeline-card" aria-label="Estabilidad postural de la sesión">
      <div className="timeline-header">
        <span className="timeline-title">Estabilidad postural de la sesión</span>
        <span className="timeline-summary">{summary}</span>
      </div>
      <div className="ticks-row" aria-hidden="true">
        {TIMELINE_SLOTS.map((slotId, index) => {
          const status = session.postureHistory[index] ?? "idle";
          return <span key={slotId} className="timeline-tick" data-status={status} />;
        })}
      </div>
    </section>
  );
}

interface ActiveBreakRoutineCardProps {
  exercise: ExerciseType;
  historyEvents: readonly SessionHistoryEvent[];
  onSelectExercise: (exercise: ExerciseType) => void;
}

function ActiveBreakRoutineCard({
  exercise,
  historyEvents,
  onSelectExercise,
}: ActiveBreakRoutineCardProps) {
  const completedSet = new Set(
    historyEvents.filter((ev) => ev.kind === "pausa").map((ev) => ev.exercise),
  );

  return (
    <section className="routine-card" aria-label="Rutina de pausa activa">
      <div className="routine-header">
        <span className="routine-title">Rutina de pausa activa</span>
        <span className="routine-summary">
          {`${completedSet.size}\u00A0/\u00A0${EXERCISE_OPTIONS.length} ejercicios completados`}
        </span>
      </div>
      <div className="routine-grid">
        {EXERCISE_OPTIONS.map((opt) => {
          const isDone = completedSet.has(opt.value);
          const isActive = opt.value === exercise;
          const stateLabel = isDone ? "Completado" : isActive ? "En curso" : "Pendiente";

          return (
            <button
              key={opt.value}
              type="button"
              className="routine-item"
              data-active={isActive ? "true" : "false"}
              data-completed={isDone ? "true" : "false"}
              onClick={() => onSelectExercise(opt.value)}
            >
              <span className="routine-item-name">{opt.label}</span>
              <span className="routine-item-state">{stateLabel}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

interface ClearRecordsDialogProps {
  onConfirm: () => void;
}

function ClearRecordsDialog({ onConfirm }: ClearRecordsDialogProps) {
  return (
    <AlertDialog
      onOpenChange={(open, details) => {
        if (!open && details.returnValue === "confirm") {
          onConfirm();
        }
      }}
    >
      <AlertDialogTrigger data-variant="destructive">Borrar registro</AlertDialogTrigger>
      <AlertDialogBackdrop />
      <AlertDialogContent>
        <div>
          <AlertDialogTitle>¿Borrar el registro ergonómico?</AlertDialogTitle>
          <AlertDialogDescription>
            Esta acción elimina todas las métricas acumuladas, el historial de alertas guardado y el
            progreso de pausas activas.
          </AlertDialogDescription>
        </div>
        <div className="dialog-footer">
          <AlertDialogClose>Cancelar</AlertDialogClose>
          <AlertDialogClose
            value="confirm"
            data-variant="destructive"
            data-agent-confirm="Borra todas las métricas y contadores acumulados en la sesión actual"
          >
            Confirmar borrado
          </AlertDialogClose>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
