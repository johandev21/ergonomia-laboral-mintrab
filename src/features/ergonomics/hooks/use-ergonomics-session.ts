import { useCallback, useEffect, useRef, useState } from "react";
import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  DEFAULT_CALIBRATION,
  EXERCISE_OPTIONS,
} from "../constants/ergonomics-options";
import { evaluateDeskPosture } from "../engine/evaluate-posture";
import { createExerciseTracker, type ExerciseTracker } from "../engine/exercise-tracker";
import { createMoveNetEngine } from "../engine/movenet-engine";
import { drawPoseFrame } from "../engine/pose-canvas-renderer";
import {
  createSessionHistoryStore,
  downloadHistoryCsv,
  type SessionHistoryStore,
} from "../engine/session-history";
import type {
  AppMode,
  CalibrationSettings,
  ExerciseSnapshot,
  ExerciseType,
  HistorySource,
  ModelVariant,
  PoseEngine,
  PoseKeypoint,
  PostureMetrics,
  PostureStatus,
  SessionSummary,
  StatusTone,
} from "../types/ergonomics.types";
import { renderFileToOffscreenCanvas } from "../utils/load-image-file";

const UI_SYNC_INTERVAL_MS = 150;

export interface UseErgonomicsSessionOptions {
  engineFactory?: () => PoseEngine;
  initialAutoInit?: boolean;
}

export function useErgonomicsSession({
  engineFactory = createMoveNetEngine,
  initialAutoInit = true,
}: UseErgonomicsSessionOptions) {
  const [mode, setMode] = useState<AppMode>("postura");
  const [exercise, setExercise] = useState<ExerciseType>("squat");
  const [calibration, setCalibration] = useState<CalibrationSettings>(DEFAULT_CALIBRATION);

  const [engineReady, setEngineReady] = useState(false);
  const [engineLoading, setEngineLoading] = useState(initialAutoInit);
  const [cameraActive, setCameraActive] = useState(false);
  const [photoActive, setPhotoActive] = useState(false);
  const [photoFiles, setPhotoFiles] = useState<File[]>([]);
  const [statusMessage, setStatusMessage] = useState(
    initialAutoInit
      ? "Preparando motor local de postura MoveNet."
      : "Motor en espera. Active la cámara o analice una fotografía.",
  );
  const [statusTone, setStatusTone] = useState<StatusTone>("neutral");
  const [statusFileName, setStatusFileName] = useState<string | null>(null);

  const updateStatus = useCallback(
    (message: string, tone: StatusTone = "neutral", fileName: string | null = null) => {
      setStatusTone(tone);
      setStatusMessage(message);
      setStatusFileName(fileName);
    },
    [],
  );

  const [keypoints, setKeypoints] = useState<PoseKeypoint[]>([]);
  const [postureMetrics, setPostureMetrics] = useState<PostureMetrics>(() =>
    evaluateDeskPosture([], DEFAULT_CALIBRATION),
  );
  const [exerciseSnapshot, setExerciseSnapshot] = useState<ExerciseSnapshot>(() => ({
    exercise: "squat",
    reps: 0,
    targetReps: DEFAULT_CALIBRATION.targetReps,
    currentAngleDeg: null,
    phase: "esperando",
    feedback: "Ubíquese frente a la cámara para iniciar la pausa activa.",
    completed: false,
    hasReachedPeak: false,
  }));
  const [historyStore] = useState<SessionHistoryStore>(() => createSessionHistoryStore());
  const historyRef = useRef<SessionHistoryStore>(historyStore);
  const [session, setSession] = useState<SessionSummary>(() => historyStore.getSummary());

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const inFlightRef = useRef(false);
  const mountedRef = useRef(true);
  const lastUiCommitAtRef = useRef(0);
  const lastCommittedStatusRef = useRef<PostureStatus>("sin-pose");
  const lastCommittedExerciseKeyRef = useRef("");
  const breakLoggedRef = useRef(false);

  const engineRef = useRef<PoseEngine | null>(null);
  const engineFactoryRef = useRef(engineFactory);
  const trackerRef = useRef<ExerciseTracker>(
    createExerciseTracker("squat", DEFAULT_CALIBRATION.targetReps),
  );

  const modeRef = useRef(mode);
  const exerciseRef = useRef(exercise);
  const calibrationRef = useRef(calibration);

  useEffect(() => {
    engineFactoryRef.current = engineFactory;
    modeRef.current = mode;
    exerciseRef.current = exercise;
    calibrationRef.current = calibration;
  }, [engineFactory, mode, exercise, calibration]);

  const ensureEngine = useCallback(
    async (variant: ModelVariant) => {
      if (!engineRef.current) {
        engineRef.current = engineFactoryRef.current();
      }
      setEngineLoading(true);
      try {
        const result = await engineRef.current.init(variant);
        if (!mountedRef.current) return null;
        setEngineReady(true);
        setEngineLoading(false);
        historyRef.current!.setBackend(result.backend);
        setSession(historyRef.current!.getSummary());
        return engineRef.current;
      } catch {
        if (!mountedRef.current) return null;
        setEngineReady(false);
        setEngineLoading(false);
        updateStatus("No fue posible inicializar el modelo MoveNet en este navegador.", "error");
        return null;
      }
    },
    [updateStatus],
  );

  const stopCameraTracks = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) {
        track.stop();
      }
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    inFlightRef.current = false;
    setCameraActive(false);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    if (initialAutoInit) {
      void ensureEngine(calibrationRef.current.modelVariant).then((engine) => {
        if (engine && mountedRef.current) {
          updateStatus("Modelo MoveNet listo. Active la cámara o analice una fotografía.");
        }
      });
    }

    const handlePageHide = () => {
      stopCameraTracks();
      historyStore.finalizeActiveEpisode(Date.now());
      historyStore.persist();
    };
    window.addEventListener("pagehide", handlePageHide);

    return () => {
      mountedRef.current = false;
      window.removeEventListener("pagehide", handlePageHide);
      stopCameraTracks();
      historyStore.finalizeActiveEpisode(Date.now());
      historyStore.persist();
      engineRef.current?.dispose();
      engineRef.current = null;
    };
  }, [ensureEngine, historyStore, initialAutoInit, stopCameraTracks, updateStatus]);

  const applyPoseEvaluation = useCallback(
    (
      nextKeypoints: PoseKeypoint[],
      inferenceMs: number,
      source: HTMLVideoElement | HTMLCanvasElement | HTMLImageElement,
      options?: {
        mirrorOverride?: boolean;
        sourceKind?: HistorySource;
        fileName?: string;
      },
    ) => {
      const currentCal = calibrationRef.current;
      const currentMode = modeRef.current;
      const currentExercise = exerciseRef.current;
      const sourceKind: HistorySource = options?.sourceKind ?? "camara";
      const now = Date.now();
      const history = historyRef.current!;
      const ctx = canvasRef.current?.getContext("2d");

      if (currentMode === "pausa") {
        const snap = trackerRef.current.update(nextKeypoints, currentCal);
        const exerciseKey = `${snap.exercise}:${snap.reps}:${snap.targetReps}:${snap.phase}:${snap.completed}:${snap.hasReachedPeak}`;
        let breakRecorded = false;

        history.recordActiveBreakFrame(inferenceMs);

        if (snap.completed && !breakLoggedRef.current) {
          breakLoggedRef.current = true;
          history.recordCompletedBreak(currentExercise, snap.reps, snap.targetReps, now);
          history.persist();
          breakRecorded = true;
        }

        const isAtTargetPeak =
          currentExercise === "squat" ? snap.phase === "abajo" : snap.phase === "arriba";
        let drawStatus: PostureStatus;
        if (snap.completed || isAtTargetPeak) {
          drawStatus = "optima";
        } else if (snap.currentAngleDeg === null || snap.phase === "esperando") {
          drawStatus = "sin-pose";
        } else {
          drawStatus = "advertencia";
        }

        if (ctx) {
          drawPoseFrame(ctx, source, nextKeypoints, {
            width: CANVAS_WIDTH,
            height: CANVAS_HEIGHT,
            minConfidence: currentCal.minConfidence,
            showOverlay: currentCal.showOverlay,
            mirror: options?.mirrorOverride ?? currentCal.mirrorCamera,
            status: drawStatus,
            mode: currentMode,
            exercise: currentExercise,
            side: currentCal.side,
            highlightAngleDeg: snap.currentAngleDeg,
          });
        }

        const shouldCommitUi =
          sourceKind === "foto" ||
          breakRecorded ||
          exerciseKey !== lastCommittedExerciseKeyRef.current ||
          now - lastUiCommitAtRef.current >= UI_SYNC_INTERVAL_MS;

        if (shouldCommitUi) {
          lastUiCommitAtRef.current = now;
          lastCommittedExerciseKeyRef.current = exerciseKey;
          setKeypoints(nextKeypoints);
          setExerciseSnapshot(snap);
          setSession(history.getSummary());
        }
        return;
      }

      const posture = evaluateDeskPosture(nextKeypoints, currentCal);

      if (ctx) {
        drawPoseFrame(ctx, source, nextKeypoints, {
          width: CANVAS_WIDTH,
          height: CANVAS_HEIGHT,
          minConfidence: currentCal.minConfidence,
          showOverlay: currentCal.showOverlay,
          mirror: options?.mirrorOverride ?? currentCal.mirrorCamera,
          status: posture.status,
          mode: currentMode,
          exercise: currentExercise,
          side: currentCal.side,
          highlightAngleDeg: posture.neckAngleDeg,
        });
      }

      const historyResult = history.recordFrame({
        posture,
        inferenceMs,
        now,
        source: sourceKind,
        fileName: options?.fileName,
      });

      if (historyResult.shouldPersist) {
        history.persist();
      }

      const shouldCommitUi =
        sourceKind === "foto" ||
        historyResult.structuralChange ||
        posture.status !== lastCommittedStatusRef.current ||
        now - lastUiCommitAtRef.current >= UI_SYNC_INTERVAL_MS;

      if (shouldCommitUi) {
        lastUiCommitAtRef.current = now;
        lastCommittedStatusRef.current = posture.status;
        setKeypoints(nextKeypoints);
        setPostureMetrics(posture);
        setSession(history.getSummary());
      }
    },
    [],
  );

  const runLoopFrame = useCallback(() => {
    const tick = () => {
      const video = videoRef.current;
      const engine = engineRef.current;
      if (!mountedRef.current || !streamRef.current || !video || !engine) {
        return;
      }

      if (!inFlightRef.current && video.readyState >= 2) {
        inFlightRef.current = true;
        void engine
          .estimate(video)
          .then((result) => {
            if (!mountedRef.current || !streamRef.current) return;
            applyPoseEvaluation(result.keypoints, result.inferenceMs, video);
          })
          .catch(() => {
            if (!mountedRef.current) return;
            updateStatus("Ocurrió un error al estimar la postura desde la cámara.", "error");
          })
          .finally(() => {
            inFlightRef.current = false;
          });
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    tick();
  }, [applyPoseEvaluation, updateStatus]);

  const handleStartCamera = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      updateStatus("Este navegador no admite acceso a cámara mediante getUserMedia.", "error");
      return;
    }

    updateStatus("Solicitando permiso de cámara.");

    try {
      const engine =
        engineRef.current && engineReady
          ? engineRef.current
          : await ensureEngine(calibrationRef.current.modelVariant);
      if (!engine || !mountedRef.current) return;

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: CANVAS_WIDTH },
          height: { ideal: CANVAS_HEIGHT },
          facingMode: "user",
        },
        audio: false,
      });

      if (!mountedRef.current) {
        for (const track of stream.getTracks()) {
          track.stop();
        }
        return;
      }

      stopCameraTracks();
      streamRef.current = stream;

      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        await video.play().catch(() => undefined);
      }

      setPhotoActive(false);
      setCameraActive(true);
      updateStatus("Cámara activa. Procesamiento ergonómico local en curso.");
      rafRef.current = requestAnimationFrame(runLoopFrame);
    } catch {
      updateStatus(
        "No se pudo acceder a la cámara. Verifique permisos o analice una fotografía.",
        "error",
      );
    }
  }, [engineReady, ensureEngine, runLoopFrame, stopCameraTracks, updateStatus]);

  const handleStopCamera = useCallback(() => {
    stopCameraTracks();
    const history = historyRef.current!;
    history.finalizeActiveEpisode(Date.now());
    history.persist();
    setSession(history.getSummary());
    updateStatus("Cámara detenida.");
  }, [stopCameraTracks, updateStatus]);

  const handlePhotoSelection = useCallback(
    async (files: File[]) => {
      setPhotoFiles(files);
      const file = files[0];
      if (!file) return;

      stopCameraTracks();
      updateStatus("Analizando fotografía localmente.");

      try {
        const engine =
          engineRef.current && engineReady
            ? engineRef.current
            : await ensureEngine(calibrationRef.current.modelVariant);
        if (!engine || !mountedRef.current) return;

        const offscreen = await renderFileToOffscreenCanvas(file);
        if (!mountedRef.current) return;

        const result = await engine.estimate(offscreen);
        if (!mountedRef.current) return;

        applyPoseEvaluation(result.keypoints, result.inferenceMs, offscreen, {
          mirrorOverride: false,
          sourceKind: "foto",
          fileName: file.name,
        });
        setPhotoActive(true);
        updateStatus(`Fotografía analizada: ${file.name}.`, "neutral", file.name);
      } catch {
        if (!mountedRef.current) return;
        updateStatus("No fue posible analizar la fotografía seleccionada.", "error");
      }
    },
    [applyPoseEvaluation, engineReady, ensureEngine, stopCameraTracks, updateStatus],
  );

  const handleModeChange = useCallback((nextMode: AppMode) => {
    if (nextMode === "pausa") {
      const history = historyRef.current!;
      history.finalizeActiveEpisode(Date.now());
      history.persist();
      setSession(history.getSummary());
      breakLoggedRef.current = false;
      lastCommittedExerciseKeyRef.current = "";
    }
    modeRef.current = nextMode;
    setMode(nextMode);
  }, []);

  const handleExerciseChange = useCallback((nextExercise: ExerciseType) => {
    exerciseRef.current = nextExercise;
    setExercise(nextExercise);
    breakLoggedRef.current = false;
    lastCommittedExerciseKeyRef.current = "";
    const snap = trackerRef.current.reset(nextExercise, calibrationRef.current.targetReps);
    setExerciseSnapshot(snap);
  }, []);

  const handleTargetRepsChange = useCallback((reps: number) => {
    const nextCal: CalibrationSettings = { ...calibrationRef.current, targetReps: reps };
    calibrationRef.current = nextCal;
    setCalibration((prev) => ({ ...prev, targetReps: reps }));
    breakLoggedRef.current = false;
    lastCommittedExerciseKeyRef.current = "";
    const snap = trackerRef.current.reset(exerciseRef.current, reps);
    setExerciseSnapshot(snap);
  }, []);

  const handleRepeatExercise = useCallback(() => {
    breakLoggedRef.current = false;
    lastCommittedExerciseKeyRef.current = "";
    const snap = trackerRef.current.reset(exerciseRef.current, calibrationRef.current.targetReps);
    setExerciseSnapshot(snap);
  }, []);

  const handleNextExercise = useCallback(() => {
    const completedExercises = new Set(
      historyRef
        .current!.getSummary()
        .historyEvents.filter((ev) => ev.kind === "pausa")
        .map((ev) => ev.exercise),
    );
    const currentIdx = EXERCISE_OPTIONS.findIndex((opt) => opt.value === exerciseRef.current);
    const baseIdx = currentIdx >= 0 ? currentIdx : 0;
    for (let offset = 1; offset <= EXERCISE_OPTIONS.length; offset += 1) {
      const candidate = EXERCISE_OPTIONS[(baseIdx + offset) % EXERCISE_OPTIONS.length];
      if (candidate && !completedExercises.has(candidate.value)) {
        handleExerciseChange(candidate.value);
        return;
      }
    }
    const fallback = EXERCISE_OPTIONS[(baseIdx + 1) % EXERCISE_OPTIONS.length];
    if (fallback) {
      handleExerciseChange(fallback.value);
    }
  }, [handleExerciseChange]);

  const handleModelVariantChange = useCallback(
    async (nextVariant: ModelVariant) => {
      setCalibration((prev) => ({ ...prev, modelVariant: nextVariant }));
      if (!engineRef.current) {
        await ensureEngine(nextVariant);
        return;
      }
      setEngineLoading(true);
      try {
        const res = await engineRef.current.switchVariant(nextVariant);
        if (!mountedRef.current) return;
        setEngineLoading(false);
        setEngineReady(true);
        historyRef.current!.setBackend(res.backend);
        setSession(historyRef.current!.getSummary());
        updateStatus(
          nextVariant === "thunder"
            ? "Modelo actualizado a MoveNet Thunder (precisión)."
            : "Modelo actualizado a MoveNet Lightning (velocidad).",
        );
      } catch {
        if (!mountedRef.current) return;
        setEngineLoading(false);
        updateStatus("No fue posible cambiar la variante de MoveNet.", "error");
      }
    },
    [ensureEngine, updateStatus],
  );

  const handleResetSession = useCallback(() => {
    const history = historyRef.current!;
    history.finalizeActiveEpisode(Date.now());
    breakLoggedRef.current = false;
    lastCommittedExerciseKeyRef.current = "";
    lastCommittedStatusRef.current = "sin-pose";
    lastUiCommitAtRef.current = 0;
    engineRef.current?.reset();
    const snap = trackerRef.current.reset(exerciseRef.current, calibrationRef.current.targetReps);
    setExerciseSnapshot(snap);
    setSession(history.getSummary());
    updateStatus("Sesión reiniciada. El historial acumulado se conserva.");
  }, [updateStatus]);

  const handleClearRecords = useCallback(() => {
    const history = historyRef.current!;
    history.clearAll();
    breakLoggedRef.current = false;
    lastCommittedExerciseKeyRef.current = "";
    lastCommittedStatusRef.current = "sin-pose";
    lastUiCommitAtRef.current = 0;
    engineRef.current?.reset();
    const snap = trackerRef.current.reset(exerciseRef.current, calibrationRef.current.targetReps);
    setExerciseSnapshot(snap);
    setKeypoints([]);
    setPostureMetrics(evaluateDeskPosture([], calibrationRef.current));
    setPhotoFiles([]);
    setPhotoActive(false);
    const ctx = canvasRef.current?.getContext("2d");
    if (ctx) {
      ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    }
    setSession(history.getSummary());
    updateStatus("Registro ergonómico borrado.");
  }, [updateStatus]);

  const handleExportHistoryCsv = useCallback(() => {
    downloadHistoryCsv(historyRef.current!.getSummary().historyEvents);
  }, []);

  return {
    mode,
    setMode,
    exercise,
    calibration,
    setCalibration,
    engineLoading,
    cameraActive,
    photoActive,
    photoFiles,
    statusMessage,
    statusTone,
    statusFileName,
    keypoints,
    postureMetrics,
    exerciseSnapshot,
    session,
    videoRef,
    canvasRef,
    handleStartCamera,
    handleStopCamera,
    handlePhotoSelection,
    handleModeChange,
    handleExerciseChange,
    handleTargetRepsChange,
    handleNextExercise,
    handleRepeatExercise,
    handleModelVariantChange,
    handleResetSession,
    handleClearRecords,
    handleExportHistoryCsv,
  };
}
