import { useCallback, useEffect, useRef, useState } from "react";
import { CANVAS_HEIGHT, CANVAS_WIDTH, DEFAULT_CALIBRATION } from "../constants/ergonomics-options";
import { evaluateDeskPosture } from "../engine/evaluate-posture";
import { createExerciseTracker, type ExerciseTracker } from "../engine/exercise-tracker";
import { createMoveNetEngine } from "../engine/movenet-engine";
import { drawPoseFrame } from "../engine/pose-canvas-renderer";
import type {
  AppMode,
  CalibrationSettings,
  ExerciseSnapshot,
  ExerciseType,
  ModelVariant,
  PoseEngine,
  PoseKeypoint,
  PostureMetrics,
  SessionSummary,
  StatusTone,
} from "../types/ergonomics.types";
import { renderFileToOffscreenCanvas } from "../utils/load-image-file";

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
  }));
  const [session, setSession] = useState<SessionSummary>({
    framesAnalyzed: 0,
    optimalFrames: 0,
    alertFrames: 0,
    lastInferenceMs: null,
    backend: "",
    postureHistory: [],
  });

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const inFlightRef = useRef(false);
  const mountedRef = useRef(true);

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
        setSession((prev) => ({ ...prev, backend: result.backend }));
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
    };
    window.addEventListener("pagehide", handlePageHide);

    return () => {
      mountedRef.current = false;
      window.removeEventListener("pagehide", handlePageHide);
      stopCameraTracks();
      engineRef.current?.dispose();
      engineRef.current = null;
    };
  }, [ensureEngine, initialAutoInit, stopCameraTracks, updateStatus]);

  const applyPoseEvaluation = useCallback(
    (
      nextKeypoints: PoseKeypoint[],
      inferenceMs: number,
      source: HTMLVideoElement | HTMLCanvasElement | HTMLImageElement,
      mirrorOverride?: boolean,
    ) => {
      const currentCal = calibrationRef.current;
      const currentMode = modeRef.current;
      const currentExercise = exerciseRef.current;

      const posture = evaluateDeskPosture(nextKeypoints, currentCal);
      setKeypoints(nextKeypoints);
      setPostureMetrics(posture);

      let highlightAngle = posture.neckAngleDeg;
      if (currentMode === "pausa") {
        const snap = trackerRef.current.update(nextKeypoints, currentCal);
        setExerciseSnapshot(snap);
        highlightAngle = snap.currentAngleDeg;
      }

      setSession((prev) => ({
        ...prev,
        framesAnalyzed: prev.framesAnalyzed + 1,
        optimalFrames: prev.optimalFrames + (posture.status === "optima" ? 1 : 0),
        alertFrames:
          prev.alertFrames +
          (posture.status === "advertencia" || posture.status === "riesgo" ? 1 : 0),
        lastInferenceMs: inferenceMs,
        postureHistory: [...prev.postureHistory, posture.status].slice(-28),
      }));

      const ctx = canvasRef.current?.getContext("2d");
      if (ctx) {
        drawPoseFrame(ctx, source, nextKeypoints, {
          width: CANVAS_WIDTH,
          height: CANVAS_HEIGHT,
          minConfidence: currentCal.minConfidence,
          showOverlay: currentCal.showOverlay,
          mirror: mirrorOverride ?? currentCal.mirrorCamera,
          status: posture.status,
          mode: currentMode,
          exercise: currentExercise,
          side: currentCal.side,
          highlightAngleDeg: highlightAngle,
        });
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

        applyPoseEvaluation(result.keypoints, result.inferenceMs, offscreen, false);
        setPhotoActive(true);
        updateStatus(`Fotografía analizada: ${file.name}.`, "neutral", file.name);
      } catch {
        if (!mountedRef.current) return;
        updateStatus("No fue posible analizar la fotografía seleccionada.", "error");
      }
    },
    [applyPoseEvaluation, engineReady, ensureEngine, stopCameraTracks, updateStatus],
  );

  const handleExerciseChange = useCallback((nextExercise: ExerciseType) => {
    setExercise(nextExercise);
    const snap = trackerRef.current.reset(nextExercise, calibrationRef.current.targetReps);
    setExerciseSnapshot(snap);
  }, []);

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
        setSession((prev) => ({ ...prev, backend: res.backend }));
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

  const resetTrackerAndSession = useCallback(
    (message: string) => {
      engineRef.current?.reset();
      const snap = trackerRef.current.reset(exerciseRef.current, calibrationRef.current.targetReps);
      setExerciseSnapshot(snap);
      setSession((prev) => ({
        framesAnalyzed: 0,
        optimalFrames: 0,
        alertFrames: 0,
        lastInferenceMs: null,
        backend: prev.backend,
        postureHistory: [],
      }));
      updateStatus(message);
    },
    [updateStatus],
  );

  const handleResetSession = useCallback(() => {
    resetTrackerAndSession("Sesión ergonómica reiniciada.");
  }, [resetTrackerAndSession]);

  const handleClearRecords = useCallback(() => {
    setKeypoints([]);
    setPostureMetrics(evaluateDeskPosture([], calibrationRef.current));
    setPhotoFiles([]);
    setPhotoActive(false);
    const ctx = canvasRef.current?.getContext("2d");
    if (ctx) {
      ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    }
    resetTrackerAndSession("Registro ergonómico borrado.");
  }, [resetTrackerAndSession]);

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
    handleExerciseChange,
    handleModelVariantChange,
    handleResetSession,
    handleClearRecords,
  };
}
