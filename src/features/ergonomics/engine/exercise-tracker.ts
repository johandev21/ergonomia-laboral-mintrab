import type {
  AnalysisSide,
  CalibrationSettings,
  ExercisePhase,
  ExerciseSnapshot,
  ExerciseTracker,
  ExerciseType,
  PoseKeypoint,
} from "../types/ergonomics.types";
import {
  calculateAngle,
  midpoint,
  round1,
  selectAnalysisSide,
  validPoint,
  verticalAngle,
} from "./evaluate-posture";

export type { ExerciseTracker };

type StableZone = "arriba" | "abajo";

const STABILITY_FRAMES = 3;

function pickTripletAngle(
  keypoints: readonly PoseKeypoint[],
  leftIndices: readonly [number, number, number],
  rightIndices: readonly [number, number, number],
  side: AnalysisSide,
  minConfidence: number,
): number | null {
  const getChain = (indices: readonly [number, number, number]) => {
    const a = validPoint(keypoints[indices[0]], minConfidence);
    const b = validPoint(keypoints[indices[1]], minConfidence);
    const c = validPoint(keypoints[indices[2]], minConfidence);
    if (!a || !b || !c) return null;
    return { a, b, c, score: a.score + b.score + c.score };
  };

  if (side === "left") {
    const left = getChain(leftIndices);
    return left ? calculateAngle(left.a, left.b, left.c) : null;
  }
  if (side === "right") {
    const right = getChain(rightIndices);
    return right ? calculateAngle(right.a, right.b, right.c) : null;
  }

  const left = getChain(leftIndices);
  const right = getChain(rightIndices);
  if (left && right) {
    const chosen = left.score >= right.score ? left : right;
    return calculateAngle(chosen.a, chosen.b, chosen.c);
  }
  const fallback = left ?? right;
  return fallback ? calculateAngle(fallback.a, fallback.b, fallback.c) : null;
}

function measureNeckTiltAngle(
  keypoints: readonly PoseKeypoint[],
  side: AnalysisSide,
  minConfidence: number,
): number | null {
  const leftEar = validPoint(keypoints[3], minConfidence);
  const rightEar = validPoint(keypoints[4], minConfidence);
  const leftShoulder = validPoint(keypoints[5], minConfidence);
  const rightShoulder = validPoint(keypoints[6], minConfidence);
  const nose = validPoint(keypoints[0], minConfidence);

  if (leftEar && rightEar && leftShoulder && rightShoulder) {
    const midAxisTilt = verticalAngle(
      midpoint(leftEar, rightEar),
      midpoint(leftShoulder, rightShoulder),
    );
    const earDx = Math.abs(rightEar.x - leftEar.x);
    const earDy = Math.abs(rightEar.y - leftEar.y);
    const earLineTilt =
      Math.hypot(earDx, earDy) >= 1e-6 ? (Math.atan2(earDy, earDx) * 180) / Math.PI : 0;
    return round1(Math.max(midAxisTilt ?? 0, earLineTilt));
  }

  if (leftEar && rightEar) {
    const earDx = Math.abs(rightEar.x - leftEar.x);
    const earDy = Math.abs(rightEar.y - leftEar.y);
    if (Math.hypot(earDx, earDy) >= 1e-6) {
      return round1((Math.atan2(earDy, earDx) * 180) / Math.PI);
    }
  }

  const chosenSide = selectAnalysisSide(keypoints, side);
  const ear = chosenSide === "left" ? leftEar : rightEar;
  const shoulder = chosenSide === "left" ? leftShoulder : rightShoulder;
  if (ear && shoulder) {
    return verticalAngle(ear, shoulder);
  }

  if (nose && leftShoulder && rightShoulder) {
    return verticalAngle(nose, midpoint(leftShoulder, rightShoulder));
  }

  return null;
}

function pickArmRaiseFallbackAngle(
  keypoints: readonly PoseKeypoint[],
  side: AnalysisSide,
  minConfidence: number,
): number | null {
  const getChain = (shoulderIdx: number, wristIdx: number) => {
    const shoulder = validPoint(keypoints[shoulderIdx], minConfidence);
    const wrist = validPoint(keypoints[wristIdx], minConfidence);
    if (!shoulder || !wrist) return null;
    return { shoulder, wrist, score: shoulder.score + wrist.score };
  };

  if (side === "left") {
    const left = getChain(5, 9);
    return left
      ? calculateAngle({ x: left.shoulder.x, y: left.shoulder.y + 100 }, left.shoulder, left.wrist)
      : null;
  }
  if (side === "right") {
    const right = getChain(6, 10);
    return right
      ? calculateAngle(
          { x: right.shoulder.x, y: right.shoulder.y + 100 },
          right.shoulder,
          right.wrist,
        )
      : null;
  }

  const left = getChain(5, 9);
  const right = getChain(6, 10);
  const chosen = left && right ? (left.score >= right.score ? left : right) : (left ?? right);
  return chosen
    ? calculateAngle(
        { x: chosen.shoulder.x, y: chosen.shoulder.y + 100 },
        chosen.shoulder,
        chosen.wrist,
      )
    : null;
}

function getExerciseAngle(
  exercise: ExerciseType,
  keypoints: readonly PoseKeypoint[],
  settings: Pick<CalibrationSettings, "side" | "minConfidence">,
): number | null {
  const { side, minConfidence } = settings;
  if (exercise === "squat") {
    const angle = pickTripletAngle(keypoints, [11, 13, 15], [12, 14, 16], side, minConfidence);
    return angle === null ? null : round1(angle);
  }

  if (exercise === "arm-raise") {
    const angle =
      pickTripletAngle(keypoints, [11, 5, 9], [12, 6, 10], side, minConfidence) ??
      pickArmRaiseFallbackAngle(keypoints, side, minConfidence);
    return angle === null ? null : round1(angle);
  }

  return measureNeckTiltAngle(keypoints, side, minConfidence);
}

function classifyZone(exercise: ExerciseType, angleDeg: number): StableZone | "transicion" {
  if (exercise === "squat") {
    if (angleDeg >= 158) return "arriba";
    if (angleDeg <= 108) return "abajo";
    return "transicion";
  }
  if (exercise === "arm-raise") {
    if (angleDeg <= 45) return "abajo";
    if (angleDeg >= 135) return "arriba";
    return "transicion";
  }
  if (angleDeg <= 10) return "abajo";
  if (angleDeg >= 22) return "arriba";
  return "transicion";
}

function getMissingJointsFeedback(exercise: ExerciseType): string {
  if (exercise === "squat") {
    return "Posiciona cadera, rodilla y tobillo dentro del encuadre.";
  }
  if (exercise === "arm-raise") {
    return "Mantén visibles hombros y muñecas dentro del encuadre para medir la elevación.";
  }
  return "Deja visibles cabeza y hombros frente a la cámara.";
}

function getExerciseFeedback(
  exercise: ExerciseType,
  phase: ExercisePhase,
  hasReachedPeak: boolean,
  completed: boolean,
): string {
  if (completed) {
    return "Meta de pausa activa completada. Buen trabajo.";
  }

  if (exercise === "squat") {
    if (phase === "abajo") return "Buena profundidad, vuelve a extender las rodillas.";
    if (phase === "arriba") {
      return hasReachedPeak
        ? "Repetición contada. Baja nuevamente con espalda recta."
        : "Posición inicial lista. Flexiona rodillas hasta bajar la cadera.";
    }
    if (phase === "transicion") return "Controla el descenso manteniendo la espalda erguida.";
    return "Ponte de pie dentro del encuadre para iniciar las sentadillas.";
  }

  if (exercise === "arm-raise") {
    if (phase === "arriba") return "Brazos arriba. Desciende de forma controlada.";
    if (phase === "abajo") {
      return "Brazos en reposo. Eleva hacia arriba sobre los hombros.";
    }
    if (phase === "transicion") return "Continúa el movimiento manteniendo los hombros relajados.";
    return "Coloca el torso y los brazos visibles para iniciar.";
  }

  if (phase === "arriba") return "Mantén el estiramiento lateral y vuelve al centro.";
  if (phase === "abajo") return "Cabeza centrada. Inclina suavemente hacia un lado.";
  if (phase === "transicion") return "Movimiento suave sin forzar el cuello.";
  return "Centra cabeza y hombros frente a la cámara para iniciar.";
}

export function createExerciseTracker(
  initialExercise: ExerciseType,
  initialTargetReps: number,
): ExerciseTracker {
  let exercise: ExerciseType = initialExercise;
  let targetReps = Math.max(1, Math.round(initialTargetReps));
  let reps = 0;
  let phase: ExercisePhase = "esperando";
  let currentAngleDeg: number | null = null;
  let stableZone: StableZone | null = null;
  let candidateZone: StableZone | null = null;
  let candidateCount = 0;
  let hasReachedPeak = false;
  let feedback = getExerciseFeedback(exercise, phase, false, false);

  function buildSnapshot(): ExerciseSnapshot {
    return {
      exercise,
      reps,
      targetReps,
      currentAngleDeg,
      phase,
      feedback,
      completed: reps >= targetReps,
      hasReachedPeak,
    };
  }

  return {
    update(keypoints, settings) {
      const angle = getExerciseAngle(exercise, keypoints, settings);
      currentAngleDeg = angle;

      if (angle === null) {
        candidateZone = null;
        candidateCount = 0;
        if (stableZone === null) {
          phase = "esperando";
        }
        feedback = getMissingJointsFeedback(exercise);
        return buildSnapshot();
      }

      const zone = classifyZone(exercise, angle);
      if (zone === "transicion") {
        candidateZone = null;
        candidateCount = 0;
        phase = stableZone === null ? "esperando" : "transicion";
      } else {
        if (candidateZone === zone) {
          candidateCount += 1;
        } else {
          candidateZone = zone;
          candidateCount = 1;
        }

        if (candidateCount >= STABILITY_FRAMES) {
          const peakZone: StableZone = exercise === "squat" ? "abajo" : "arriba";
          const startZone: StableZone = exercise === "squat" ? "arriba" : "abajo";

          if (zone === peakZone) {
            hasReachedPeak = true;
          } else if (zone === startZone && hasReachedPeak) {
            reps += 1;
            hasReachedPeak = false;
          }

          stableZone = zone;
          phase = zone;
        } else {
          phase = stableZone === null ? "esperando" : stableZone === zone ? zone : "transicion";
        }
      }

      feedback = getExerciseFeedback(exercise, phase, hasReachedPeak, reps >= targetReps);
      return buildSnapshot();
    },

    reset(nextExercise?: ExerciseType, nextTargetReps?: number) {
      if (nextExercise !== undefined) {
        exercise = nextExercise;
      }
      if (nextTargetReps !== undefined) {
        targetReps = Math.max(1, Math.round(nextTargetReps));
      }
      reps = 0;
      phase = "esperando";
      currentAngleDeg = null;
      stableZone = null;
      candidateZone = null;
      candidateCount = 0;
      hasReachedPeak = false;
      feedback = getExerciseFeedback(exercise, phase, false, false);
      return buildSnapshot();
    },

    getSnapshot() {
      return buildSnapshot();
    },
  };
}
