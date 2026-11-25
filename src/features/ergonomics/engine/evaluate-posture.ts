import { KEYPOINT_META } from "../constants/ergonomics-options";
import type {
  AnalysisSide,
  CalibrationSettings,
  PoseKeypoint,
  PostureMetrics,
  PostureStatus,
} from "../types/ergonomics.types";

export interface Point2D {
  x: number;
  y: number;
}

export function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

export function validPoint(
  kp: PoseKeypoint | undefined,
  minConfidence: number,
): PoseKeypoint | null {
  if (!kp || kp.score < minConfidence || !Number.isFinite(kp.x) || !Number.isFinite(kp.y)) {
    return null;
  }
  return kp;
}

export function midpoint(a: Point2D, b: Point2D): Point2D {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

export function verticalAngle(top: Point2D, bottom: Point2D): number | null {
  const angle = calculateAngle(top, bottom, { x: bottom.x, y: bottom.y - 100 });
  return angle === null ? null : round1(angle);
}

export function selectAnalysisSide(
  keypoints: readonly PoseKeypoint[],
  side: AnalysisSide,
): "left" | "right" {
  if (side === "left" || side === "right") {
    return side;
  }
  const leftScore =
    (keypoints[3]?.score ?? 0) + (keypoints[5]?.score ?? 0) + (keypoints[11]?.score ?? 0);
  const rightScore =
    (keypoints[4]?.score ?? 0) + (keypoints[6]?.score ?? 0) + (keypoints[12]?.score ?? 0);
  return leftScore >= rightScore ? "left" : "right";
}

export function normalizeKeypoints(
  raw: ReadonlyArray<{ x: number; y: number; score?: number; name?: string }>,
): PoseKeypoint[] {
  const byName = new Map<string, { x: number; y: number; score?: number }>();
  for (const kp of raw) {
    if (kp.name) {
      byName.set(kp.name, kp);
    }
  }

  return KEYPOINT_META.map((meta) => {
    const candidate = byName.get(meta.name) ?? raw[meta.index];
    const x = candidate && Number.isFinite(candidate.x) ? candidate.x : 0;
    const y = candidate && Number.isFinite(candidate.y) ? candidate.y : 0;
    const score =
      candidate && typeof candidate.score === "number" && Number.isFinite(candidate.score)
        ? candidate.score
        : 0;

    return {
      index: meta.index,
      name: meta.name,
      labelEs: meta.labelEs,
      x,
      y,
      score,
    };
  });
}

export function calculateAngle(a: Point2D, b: Point2D, c: Point2D): number | null {
  if (
    !Number.isFinite(a.x) ||
    !Number.isFinite(a.y) ||
    !Number.isFinite(b.x) ||
    !Number.isFinite(b.y) ||
    !Number.isFinite(c.x) ||
    !Number.isFinite(c.y)
  ) {
    return null;
  }

  const bax = a.x - b.x;
  const bay = a.y - b.y;
  const bcx = c.x - b.x;
  const bcy = c.y - b.y;

  const magBA = Math.hypot(bax, bay);
  const magBC = Math.hypot(bcx, bcy);
  if (magBA < 1e-6 || magBC < 1e-6) {
    return null;
  }

  const cosTheta = Math.max(-1, Math.min(1, (bax * bcx + bay * bcy) / (magBA * magBC)));
  return (Math.acos(cosTheta) * 180) / Math.PI;
}

function buildDiagnosisAndRecommendation(
  status: PostureStatus,
  neckAngleDeg: number | null,
  shoulderTiltDeg: number | null,
  torsoLeanDeg: number | null,
  neckThresholdDeg: number,
): { diagnosis: string; recommendation: string } {
  if (status === "sin-pose") {
    return {
      diagnosis: "No se detectan hombros ni cuello con suficiente confianza.",
      recommendation:
        "Ubícate frente o de costado a la cámara con buena iluminación y deja visibles cabeza y hombros.",
    };
  }

  if (status === "optima") {
    return {
      diagnosis: "Postura cervical y dorsal alineada dentro de rangos ergonómicos.",
      recommendation:
        "Mantén la pantalla a la altura de los ojos, los hombros relajados y realiza una pausa activa cada 45 minutos.",
    };
  }

  const neckExcess =
    neckAngleDeg !== null && neckAngleDeg > neckThresholdDeg ? neckAngleDeg - neckThresholdDeg : 0;
  const shoulderExcess = shoulderTiltDeg !== null && shoulderTiltDeg > 6 ? shoulderTiltDeg - 6 : 0;
  const torsoExcess = torsoLeanDeg !== null && torsoLeanDeg > 12 ? torsoLeanDeg - 12 : 0;

  if (neckExcess >= shoulderExcess && neckExcess >= torsoExcess && neckAngleDeg !== null) {
    return {
      diagnosis:
        status === "riesgo"
          ? `Sobrecarga cervical marcada (${Math.round(neckAngleDeg)}° de adelantamiento cefálico).`
          : `Inclinación cervical leve (${Math.round(neckAngleDeg)}° sobre el eje vertical).`,
      recommendation:
        "Lleva el mentón suavemente hacia atrás, sube el monitor a la altura de los ojos y relaja los hombros.",
    };
  }

  if (shoulderExcess >= torsoExcess && shoulderTiltDeg !== null) {
    return {
      diagnosis:
        status === "riesgo"
          ? `Desnivel marcado de hombros (${Math.round(shoulderTiltDeg)}° de inclinación lateral).`
          : `Asimetría leve en la altura de los hombros (${Math.round(shoulderTiltDeg)}°).`,
      recommendation:
        "Nivela ambos hombros, apoya los antebrazos de forma simétrica y evita cargar el peso hacia un lado.",
    };
  }

  const torsoValue = torsoLeanDeg ?? 0;
  return {
    diagnosis:
      status === "riesgo"
        ? `Inclinación pronunciada del tronco (${Math.round(torsoValue)}° fuera de eje).`
        : `Inclinación leve del tronco respecto a la vertical (${Math.round(torsoValue)}°).`,
    recommendation:
      "Apoya la zona lumbar en el respaldo de la silla y acerca el teclado para no inclinarte hacia adelante.",
  };
}

export function evaluateDeskPosture(
  keypoints: readonly PoseKeypoint[],
  settings: Pick<CalibrationSettings, "side" | "minConfidence" | "neckThresholdDeg">,
): PostureMetrics {
  const { side, minConfidence, neckThresholdDeg } = settings;
  const visibleCount = keypoints.filter(
    (kp) => kp.score >= minConfidence && Number.isFinite(kp.x) && Number.isFinite(kp.y),
  ).length;

  const nose = validPoint(keypoints[0], minConfidence);
  const leftEar = validPoint(keypoints[3], minConfidence);
  const rightEar = validPoint(keypoints[4], minConfidence);
  const leftShoulder = validPoint(keypoints[5], minConfidence);
  const rightShoulder = validPoint(keypoints[6], minConfidence);
  const leftHip = validPoint(keypoints[11], minConfidence);
  const rightHip = validPoint(keypoints[12], minConfidence);

  const chosenSide = selectAnalysisSide(keypoints, side);
  const sideEar = chosenSide === "left" ? leftEar : rightEar;
  const sideShoulder = chosenSide === "left" ? leftShoulder : rightShoulder;
  const sideHip = chosenSide === "left" ? leftHip : rightHip;

  const refLen =
    sideEar && sideShoulder
      ? Math.hypot(sideEar.x - sideShoulder.x, sideEar.y - sideShoulder.y)
      : leftEar && leftShoulder
        ? Math.hypot(leftEar.x - leftShoulder.x, leftEar.y - leftShoulder.y)
        : rightEar && rightShoulder
          ? Math.hypot(rightEar.x - rightShoulder.x, rightEar.y - rightShoulder.y)
          : null;

  let shoulderTiltDeg: number | null = null;
  let frontalShoulders = false;

  if (leftShoulder && rightShoulder) {
    const dx = Math.abs(rightShoulder.x - leftShoulder.x);
    const dy = Math.abs(rightShoulder.y - leftShoulder.y);
    const span = Math.hypot(dx, dy);
    // Avoid treating overlapping side-profile shoulders as a horizontal tilt.
    const overlappingProfile = refLen !== null && refLen > 1e-6 && span < refLen * 0.25;
    if (span >= 1e-6 && !overlappingProfile) {
      shoulderTiltDeg = round1((Math.atan2(dy, dx) * 180) / Math.PI);
      frontalShoulders = true;
    }
  }

  let neckAngleDeg: number | null = null;
  let torsoLeanDeg: number | null = null;

  if (side === "auto" && frontalShoulders && leftShoulder && rightShoulder) {
    const midShoulder = midpoint(leftShoulder, rightShoulder);
    if (leftEar && rightEar) {
      neckAngleDeg = verticalAngle(midpoint(leftEar, rightEar), midShoulder);
    } else if (nose) {
      neckAngleDeg = verticalAngle(nose, midShoulder);
    } else if (sideEar && sideShoulder) {
      neckAngleDeg = verticalAngle(sideEar, sideShoulder);
    }

    if (leftHip && rightHip) {
      torsoLeanDeg = verticalAngle(midShoulder, midpoint(leftHip, rightHip));
    } else if (sideHip && sideShoulder) {
      torsoLeanDeg = verticalAngle(sideShoulder, sideHip);
    }
  } else {
    if (sideEar && sideShoulder) {
      neckAngleDeg = verticalAngle(sideEar, sideShoulder);
    }
    if (sideHip && sideShoulder) {
      torsoLeanDeg = verticalAngle(sideShoulder, sideHip);
    }
  }

  if (neckAngleDeg === null && shoulderTiltDeg === null) {
    const { diagnosis, recommendation } = buildDiagnosisAndRecommendation(
      "sin-pose",
      null,
      null,
      torsoLeanDeg,
      neckThresholdDeg,
    );
    return {
      status: "sin-pose",
      score: 0,
      neckAngleDeg: null,
      shoulderTiltDeg: null,
      torsoLeanDeg,
      diagnosis,
      recommendation,
      visibleCount,
    };
  }

  let penalty = 0;
  if (neckAngleDeg !== null && neckAngleDeg > neckThresholdDeg) {
    penalty += (neckAngleDeg - neckThresholdDeg) * 2.8;
  }
  if (shoulderTiltDeg !== null && shoulderTiltDeg > 6) {
    penalty += (shoulderTiltDeg - 6) * 3.5;
  }
  if (torsoLeanDeg !== null && torsoLeanDeg > 12) {
    penalty += (torsoLeanDeg - 12) * 2.8;
  }

  const score = Math.round(Math.max(0, Math.min(100, 100 - penalty)));
  const status: PostureStatus = score >= 80 ? "optima" : score >= 55 ? "advertencia" : "riesgo";

  const { diagnosis, recommendation } = buildDiagnosisAndRecommendation(
    status,
    neckAngleDeg,
    shoulderTiltDeg,
    torsoLeanDeg,
    neckThresholdDeg,
  );

  return {
    status,
    score,
    neckAngleDeg,
    shoulderTiltDeg,
    torsoLeanDeg,
    diagnosis,
    recommendation,
    visibleCount,
  };
}
