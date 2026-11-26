import { Button } from "@ui-sdk/react/button";
import {
  SegmentedControl,
  SegmentedControlIndicator,
  SegmentedControlItem,
} from "@ui-sdk/react/segmented-control";
import { useState } from "react";
import type {
  CompletedBreakEvent,
  PostureAlertEpisode,
  SessionSummary,
} from "../types/ergonomics.types";
import { formatClockTime, formatDegrees, formatDurationShort } from "../utils/format-ergonomics";

type HistoryFilter = "todos" | "postura" | "pausa";

export interface HistoryPanelProps {
  session: SessionSummary;
  onExportCsv: () => void;
}

export function HistoryPanel({ session, onExportCsv }: HistoryPanelProps) {
  const [filter, setFilter] = useState<HistoryFilter>("todos");

  const postureEvents = session.historyEvents.filter((ev) => ev.kind === "postura");
  const breakEvents = session.historyEvents.filter((ev) => ev.kind === "pausa");
  const filteredEvents =
    filter === "todos"
      ? session.historyEvents
      : session.historyEvents.filter((ev) => ev.kind === filter);

  const emptyMessage =
    session.historyEvents.length === 0
      ? "Aún no hay alertas posturales ni pausas completadas en esta sesión."
      : filter === "postura"
        ? "No se registraron alertas posturales en esta sesión."
        : "No se completaron pausas activas en esta sesión.";

  return (
    <div className="panel-stack">
      <div className="history-header">
        <h2 className="history-title">Historial de la sesión</h2>
        <Button disabled={session.historyEvents.length === 0} onClick={onExportCsv}>
          Exportar CSV
        </Button>
      </div>

      <div className="session-telemetry">
        <div className="telemetry-item">
          <span className="telemetry-label">Alertas posturales</span>
          <span className="telemetry-value">{postureEvents.length}</span>
        </div>
        <div className="telemetry-item">
          <span className="telemetry-label">Pausas completadas</span>
          <span className="telemetry-value">{breakEvents.length}</span>
        </div>
        <div className="telemetry-item">
          <span className="telemetry-label">Peor cuello</span>
          <span className="telemetry-value">
            {session.worstNeckAngleDeg === null
              ? "\u2013"
              : formatDegrees(session.worstNeckAngleDeg)}
          </span>
        </div>
      </div>

      <SegmentedControl
        aria-label="Filtrar historial"
        value={filter}
        onValueChange={(next) => {
          if (next === "todos" || next === "postura" || next === "pausa") {
            setFilter(next);
          }
        }}
      >
        <SegmentedControlIndicator />
        <SegmentedControlItem value="todos">Todos</SegmentedControlItem>
        <SegmentedControlItem value="postura">Alertas</SegmentedControlItem>
        <SegmentedControlItem value="pausa">Pausas</SegmentedControlItem>
      </SegmentedControl>

      {filteredEvents.length === 0 ? (
        <p className="history-empty">{emptyMessage}</p>
      ) : (
        <ol className="history-list" aria-label="Eventos ergonómicos registrados">
          {filteredEvents.map((ev) =>
            ev.kind === "postura" ? (
              <PostureHistoryItem key={ev.id} episode={ev} />
            ) : (
              <BreakHistoryItem key={ev.id} event={ev} />
            ),
          )}
        </ol>
      )}

      <p className="privacy-note">
        El historial guarda solo marcas de tiempo y métricas numéricas en este navegador; nunca
        almacena imágenes ni video.
      </p>
    </div>
  );
}

interface PostureHistoryItemProps {
  episode: PostureAlertEpisode;
}

function PostureHistoryItem({ episode }: PostureHistoryItemProps) {
  const neckDetail =
    episode.peakNeckAngleDeg === null
      ? null
      : episode.source === "camara"
        ? `Cuello máx. ${formatDegrees(episode.peakNeckAngleDeg)}`
        : `Cuello ${formatDegrees(episode.peakNeckAngleDeg)}`;

  const shoulderDetail =
    episode.source === "camara" &&
    episode.peakShoulderTiltDeg !== null &&
    episode.peakShoulderTiltDeg > 6
      ? `Hombros ${formatDegrees(episode.peakShoulderTiltDeg)}`
      : null;

  return (
    <li
      className="history-item"
      data-tone={episode.severity}
      data-active={episode.endedAt === null ? "true" : "false"}
    >
      <div className="history-item-top">
        <div className="history-badge-group">
          <span className="history-badge" data-tone={episode.severity}>
            {episode.severity === "riesgo" ? "Riesgo" : "Advertencia"}
          </span>
          {episode.endedAt === null ? <span className="history-live-tag">En curso</span> : null}
        </div>
        <span className="history-time">{formatClockTime(episode.startedAt)}</span>
      </div>

      <p className="history-diagnosis">{episode.diagnosis}</p>

      <p className="history-meta">
        {episode.source === "camara" ? (
          <>
            {`Duración ${formatDurationShort(episode.durationMs)} · Índice mín. ${episode.minScore}%`}
            {neckDetail ? ` · ${neckDetail}` : null}
            {shoulderDetail ? ` · ${shoulderDetail}` : null}
          </>
        ) : (
          <>
            {`Índice ${episode.minScore}%`}
            {neckDetail ? ` · ${neckDetail}` : null}
            {" · Foto: "}
            <bdi className="status-filename">{episode.fileName ?? "imagen"}</bdi>
          </>
        )}
      </p>
    </li>
  );
}

interface BreakHistoryItemProps {
  event: CompletedBreakEvent;
}

function BreakHistoryItem({ event }: BreakHistoryItemProps) {
  return (
    <li className="history-item" data-tone="pausa" data-active="false">
      <div className="history-item-top">
        <span className="history-badge" data-tone="pausa">
          Pausa activa
        </span>
        <span className="history-time">{formatClockTime(event.timestamp)}</span>
      </div>

      <p className="history-diagnosis">{event.exerciseLabel}</p>
      <p className="history-meta">
        {`Meta completada · ${event.reps}\u00A0/\u00A0${event.targetReps} repeticiones`}
      </p>
    </li>
  );
}
