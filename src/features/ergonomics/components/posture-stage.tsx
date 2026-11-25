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
import { CANVAS_HEIGHT, CANVAS_WIDTH } from "../constants/ergonomics-options";
import type { PostureStatus, StatusTone } from "../types/ergonomics.types";

const TIMELINE_SLOTS = Array.from({ length: 28 }, (_, slot) => `slot-${slot}`);

export interface PostureStageProps {
  videoRef: RefObject<HTMLVideoElement | null>;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  cameraActive: boolean;
  photoActive: boolean;
  engineLoading: boolean;
  photoFiles: File[];
  postureHistory: readonly PostureStatus[];
  statusMessage: string;
  statusTone: StatusTone;
  statusFileName?: string | null;
  onStartCamera: () => void;
  onStopCamera: () => void;
  onSelectPhotos: (files: File[]) => void;
  onResetSession: () => void;
  onClearRecords: () => void;
}

export function PostureStage({
  videoRef,
  canvasRef,
  cameraActive,
  photoActive,
  engineLoading,
  photoFiles,
  postureHistory,
  statusMessage,
  statusTone,
  statusFileName,
  onStartCamera,
  onStopCamera,
  onSelectPhotos,
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
        {!cameraActive && !photoActive && <StageEmptyState />}
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

      <PostureTimeline history={postureHistory} />

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

function StageEmptyState() {
  return (
    <div className="stage-empty">
      <h2 className="stage-empty-title">Evaluación postural en navegador</h2>
      <p className="stage-empty-copy">
        Active la cámara web o cargue una fotografía para medir alineación cervical, hombros y
        pausas activas sin enviar datos fuera de su equipo.
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
  history: readonly PostureStatus[];
}

function PostureTimeline({ history }: PostureTimelineProps) {
  const optimalCount = history.filter((status) => status === "optima").length;
  const alertCount = history.filter(
    (status) => status === "advertencia" || status === "riesgo",
  ).length;
  const optimalPercent = history.length > 0 ? Math.round((optimalCount / history.length) * 100) : 0;
  const alertLabel = alertCount === 1 ? "1 alerta" : `${alertCount} alertas`;
  const summary =
    history.length === 0
      ? "Sin lecturas aún · últimos 28 cuadros"
      : `${optimalPercent}% óptima · ${alertLabel} · ${history.length}\u00A0/\u00A028 cuadros`;

  return (
    <section className="timeline-card" aria-label="Estabilidad postural de la sesión">
      <div className="timeline-header">
        <span className="timeline-title">Estabilidad postural de la sesión</span>
        <span className="timeline-summary">{summary}</span>
      </div>
      <div className="ticks-row" aria-hidden="true">
        {TIMELINE_SLOTS.map((slotId, index) => {
          const status = history[index] ?? "idle";
          return <span key={slotId} className="timeline-tick" data-status={status} />;
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
            Esta acción elimina todas las métricas acumuladas, los cuadros analizados y el progreso
            de pausas activas de la sesión actual.
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
