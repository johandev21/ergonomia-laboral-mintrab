import type {
  AnalysisSide,
  CalibrationSettings,
  ExerciseGuide,
  ExercisePhase,
  ExerciseType,
  KeypointMeta,
  ModelVariant,
} from "../types/ergonomics.types";

export const CANVAS_WIDTH = 960;
export const CANVAS_HEIGHT = 540;

export const KEYPOINT_META: readonly KeypointMeta[] = [
  { index: 0, name: "nose", labelEs: "Nariz" },
  { index: 1, name: "left_eye", labelEs: "Ojo izquierdo" },
  { index: 2, name: "right_eye", labelEs: "Ojo derecho" },
  { index: 3, name: "left_ear", labelEs: "Oreja izquierda" },
  { index: 4, name: "right_ear", labelEs: "Oreja derecha" },
  { index: 5, name: "left_shoulder", labelEs: "Hombro izquierdo" },
  { index: 6, name: "right_shoulder", labelEs: "Hombro derecho" },
  { index: 7, name: "left_elbow", labelEs: "Codo izquierdo" },
  { index: 8, name: "right_elbow", labelEs: "Codo derecho" },
  { index: 9, name: "left_wrist", labelEs: "Muñeca izquierda" },
  { index: 10, name: "right_wrist", labelEs: "Muñeca derecha" },
  { index: 11, name: "left_hip", labelEs: "Cadera izquierda" },
  { index: 12, name: "right_hip", labelEs: "Cadera derecha" },
  { index: 13, name: "left_knee", labelEs: "Rodilla izquierda" },
  { index: 14, name: "right_knee", labelEs: "Rodilla derecha" },
  { index: 15, name: "left_ankle", labelEs: "Tobillo izquierdo" },
  { index: 16, name: "right_ankle", labelEs: "Tobillo derecho" },
] as const;

export const SKELETON_EDGES: readonly (readonly [number, number])[] = [
  [0, 1],
  [0, 2],
  [1, 3],
  [2, 4],
  [5, 6],
  [5, 7],
  [7, 9],
  [6, 8],
  [8, 10],
  [5, 11],
  [6, 12],
  [11, 12],
  [11, 13],
  [13, 15],
  [12, 14],
  [14, 16],
] as const;

export const DEFAULT_CALIBRATION: CalibrationSettings = {
  modelVariant: "lightning",
  side: "auto",
  minConfidence: 0.45,
  neckThresholdDeg: 15,
  showOverlay: true,
  mirrorCamera: true,
  targetReps: 10,
};

export const TARGET_REP_OPTIONS = [5, 10, 15] as const;

export const EXERCISE_GUIDES: Record<ExerciseType, ExerciseGuide> = {
  squat: {
    framingTip: "Aléjate ~1,5 m de perfil o frente dejando visibles cadera, rodillas y tobillos.",
    targetLabel: "Meta ≤ 108°",
    steps: [
      "Ponte de pie con espalda erguida",
      "Flexiona rodillas hasta bajar la cadera",
      "Vuelve a extender para sumar 1 repetición",
    ],
  },
  "arm-raise": {
    framingTip:
      "Mantén visibles hombros y muñecas (funciona sentado o de pie, de frente o de costado).",
    targetLabel: "Meta ≥ 135°",
    steps: [
      "Relaja los brazos a los costados",
      "Eleva los brazos por sobre los hombros",
      "Desciende de forma controlada (+1 rep)",
    ],
  },
  "neck-tilt": {
    framingTip: "Centra cabeza y hombros frente a la cámara con buena iluminación.",
    targetLabel: "Meta ≥ 22°",
    steps: [
      "Mantén la cabeza centrada y hombros relajados",
      "Inclina suavemente la oreja hacia un hombro",
      "Regresa al centro sin forzar (+1 rep)",
    ],
  },
};

export const EXERCISE_OPTIONS: { value: ExerciseType; label: string }[] = [
  { value: "squat", label: "Sentadillas asistidas" },
  { value: "arm-raise", label: "Elevación de brazos" },
  { value: "neck-tilt", label: "Inclinación lateral" },
];

export const MODEL_OPTIONS: { value: ModelVariant; label: string }[] = [
  { value: "lightning", label: "MoveNet Lightning (velocidad)" },
  { value: "thunder", label: "MoveNet Thunder (precisión)" },
];

export const SIDE_OPTIONS: { value: AnalysisSide; label: string }[] = [
  { value: "auto", label: "Automático" },
  { value: "left", label: "Perfil izquierdo" },
  { value: "right", label: "Perfil derecho" },
];

export const PHASE_LABELS: Record<ExercisePhase, string> = {
  esperando: "En espera",
  arriba: "Posición alta",
  abajo: "Posición baja",
  transicion: "En transición",
};
