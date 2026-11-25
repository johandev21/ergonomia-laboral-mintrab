import { SKELETON_EDGES } from "../constants/ergonomics-options";
import type {
  AnalysisSide,
  AppMode,
  DrawPoseOptions,
  ExerciseType,
  PoseKeypoint,
  PostureStatus,
} from "../types/ergonomics.types";

const STAGE_TOKEN_FALLBACKS = {
  optima: "#9be22b",
  advertencia: "#f59e0b",
  riesgo: "#ef4444",
  "sin-pose": "#858d99",
  stageBg: "#15171a",
  jointSecondary: "#e8ebef",
  fontSans: '"Albert Sans", system-ui, -apple-system, sans-serif',
} as const;

function readCssToken(styles: CSSStyleDeclaration | null, name: string, fallback: string): string {
  const value = styles?.getPropertyValue(name).trim();
  return value || fallback;
}

function resolveStageTokens() {
  const styles =
    typeof document !== "undefined" && typeof getComputedStyle === "function"
      ? getComputedStyle(document.documentElement)
      : null;

  return {
    statusColors: {
      optima: readCssToken(styles, "--color-stage-success", STAGE_TOKEN_FALLBACKS.optima),
      advertencia: readCssToken(styles, "--color-stage-warning", STAGE_TOKEN_FALLBACKS.advertencia),
      riesgo: readCssToken(styles, "--color-stage-danger", STAGE_TOKEN_FALLBACKS.riesgo),
      "sin-pose": readCssToken(styles, "--color-stage-neutral", STAGE_TOKEN_FALLBACKS["sin-pose"]),
    } satisfies Record<PostureStatus, string>,
    stageBg: readCssToken(styles, "--color-bg-stage", STAGE_TOKEN_FALLBACKS.stageBg),
    jointSecondary: readCssToken(
      styles,
      "--color-stage-joint-secondary",
      STAGE_TOKEN_FALLBACKS.jointSecondary,
    ),
    fontSans: readCssToken(styles, "--font-sans", STAGE_TOKEN_FALLBACKS.fontSans),
  };
}

function getSourceDimensions(source: HTMLVideoElement | HTMLCanvasElement | HTMLImageElement): {
  srcW: number;
  srcH: number;
} {
  if ("videoWidth" in source) {
    return { srcW: source.videoWidth, srcH: source.videoHeight };
  }
  if ("naturalWidth" in source) {
    return {
      srcW: source.naturalWidth || source.width,
      srcH: source.naturalHeight || source.height,
    };
  }
  return { srcW: source.width, srcH: source.height };
}

function getPrimaryIndices(mode: AppMode, exercise: ExerciseType, side: AnalysisSide): Set<number> {
  if (mode === "postura") {
    if (side === "left") return new Set([3, 5, 11]);
    if (side === "right") return new Set([4, 6, 12]);
    return new Set([3, 4, 5, 6, 11, 12]);
  }
  if (exercise === "squat") {
    if (side === "left") return new Set([11, 13, 15]);
    if (side === "right") return new Set([12, 14, 16]);
    return new Set([11, 13, 15, 12, 14, 16]);
  }
  if (exercise === "arm-raise") {
    if (side === "left") return new Set([11, 5, 9]);
    if (side === "right") return new Set([12, 6, 10]);
    return new Set([11, 5, 9, 12, 6, 10]);
  }
  return new Set([3, 4, 5, 6]);
}

function isValidKeypoint(kp: PoseKeypoint | undefined, minConfidence: number): kp is PoseKeypoint {
  return Boolean(kp && kp.score >= minConfidence && Number.isFinite(kp.x) && Number.isFinite(kp.y));
}

function pickHigherSidePoint(
  left: PoseKeypoint | undefined,
  right: PoseKeypoint | undefined,
  side: AnalysisSide,
  minConfidence: number,
): PoseKeypoint | null {
  const validLeft = isValidKeypoint(left, minConfidence) ? left : null;
  const validRight = isValidKeypoint(right, minConfidence) ? right : null;
  if (side === "left") return validLeft;
  if (side === "right") return validRight;
  if (validLeft && validRight) {
    return validLeft.score >= validRight.score ? validLeft : validRight;
  }
  return validLeft ?? validRight;
}

function findAngleAnchor(
  keypoints: readonly PoseKeypoint[],
  mode: AppMode,
  exercise: ExerciseType,
  side: AnalysisSide,
  minConfidence: number,
): { x: number; y: number } | null {
  if (mode === "postura") {
    const leftShoulder = keypoints[5];
    const rightShoulder = keypoints[6];
    if (
      side === "auto" &&
      isValidKeypoint(leftShoulder, minConfidence) &&
      isValidKeypoint(rightShoulder, minConfidence)
    ) {
      return {
        x: (leftShoulder.x + rightShoulder.x) / 2,
        y: (leftShoulder.y + rightShoulder.y) / 2,
      };
    }
    return (
      pickHigherSidePoint(leftShoulder, rightShoulder, side, minConfidence) ??
      pickHigherSidePoint(keypoints[3], keypoints[4], side, minConfidence)
    );
  }

  if (exercise === "squat") {
    return pickHigherSidePoint(keypoints[13], keypoints[14], side, minConfidence);
  }
  if (exercise === "arm-raise") {
    return pickHigherSidePoint(keypoints[5], keypoints[6], side, minConfidence);
  }

  const leftEar = keypoints[3];
  const rightEar = keypoints[4];
  if (isValidKeypoint(leftEar, minConfidence) && isValidKeypoint(rightEar, minConfidence)) {
    return {
      x: (leftEar.x + rightEar.x) / 2,
      y: Math.min(leftEar.y, rightEar.y),
    };
  }
  return (
    pickHigherSidePoint(leftEar, rightEar, side, minConfidence) ??
    (isValidKeypoint(keypoints[0], minConfidence) ? keypoints[0] : null)
  );
}

function drawAnglePill(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  angleDeg: number,
  accentColor: string,
  fontFamily: string,
  canvasWidth: number,
  canvasHeight: number,
): void {
  const label = `${Math.round(angleDeg)}°`;
  ctx.save();
  ctx.font = `700 18px ${fontFamily}`;
  const textWidth = ctx.measureText(label).width;
  const pillW = Math.max(56, Math.ceil(textWidth) + 22);
  const pillH = 32;
  const margin = 10;

  const clampedX = Math.max(pillW / 2 + margin, Math.min(canvasWidth - pillW / 2 - margin, x));
  const clampedY = Math.max(
    pillH / 2 + margin,
    Math.min(canvasHeight - pillH / 2 - margin, y - 26),
  );

  const left = clampedX - pillW / 2;
  const top = clampedY - pillH / 2;
  const radius = 9;

  ctx.beginPath();
  ctx.roundRect(left, top, pillW, pillH, radius);
  ctx.fillStyle = "rgba(21, 23, 26, 0.92)";
  ctx.fill();
  ctx.lineWidth = 1.75;
  ctx.strokeStyle = accentColor;
  ctx.stroke();

  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, clampedX, clampedY + 0.5);
  ctx.restore();
}

export function drawPoseFrame(
  ctx: CanvasRenderingContext2D,
  source: HTMLVideoElement | HTMLCanvasElement | HTMLImageElement,
  keypoints: readonly PoseKeypoint[],
  options: DrawPoseOptions,
): void {
  const {
    width,
    height,
    minConfidence,
    showOverlay,
    mirror,
    status,
    mode,
    exercise,
    side,
    highlightAngleDeg,
  } = options;

  const stageTokens = resolveStageTokens();

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = stageTokens.stageBg;
  ctx.fillRect(0, 0, width, height);

  const { srcW, srcH } = getSourceDimensions(source);
  if (srcW <= 0 || srcH <= 0 || width <= 0 || height <= 0) {
    return;
  }

  const scale = Math.min(width / srcW, height / srcH);
  const drawW = srcW * scale;
  const drawH = srcH * scale;
  const offsetX = (width - drawW) / 2;
  const offsetY = (height - drawH) / 2;

  const mapX = (x: number) => offsetX + x * scale;
  const mapY = (y: number) => offsetY + y * scale;
  const strokeColor = stageTokens.statusColors[status];

  ctx.save();
  if (mirror) {
    ctx.translate(width, 0);
    ctx.scale(-1, 1);
  }

  ctx.drawImage(source, offsetX, offsetY, drawW, drawH);

  if (showOverlay && keypoints.length > 0) {
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    const validEdges: Array<[PoseKeypoint, PoseKeypoint]> = [];
    for (const [idxA, idxB] of SKELETON_EDGES) {
      const a = keypoints[idxA];
      const b = keypoints[idxB];
      if (isValidKeypoint(a, minConfidence) && isValidKeypoint(b, minConfidence)) {
        validEdges.push([a, b]);
      }
    }

    ctx.strokeStyle = "rgba(21, 23, 26, 0.75)";
    ctx.lineWidth = 5;
    for (const [a, b] of validEdges) {
      ctx.beginPath();
      ctx.moveTo(mapX(a.x), mapY(a.y));
      ctx.lineTo(mapX(b.x), mapY(b.y));
      ctx.stroke();
    }

    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 3;
    for (const [a, b] of validEdges) {
      ctx.beginPath();
      ctx.moveTo(mapX(a.x), mapY(a.y));
      ctx.lineTo(mapX(b.x), mapY(b.y));
      ctx.stroke();
    }

    const primary = getPrimaryIndices(mode, exercise, side);
    for (const kp of keypoints) {
      if (!isValidKeypoint(kp, minConfidence)) {
        continue;
      }
      const isPrimary = primary.has(kp.index);
      const radius = isPrimary ? 6 : 4;
      const cx = mapX(kp.x);
      const cy = mapY(kp.y);

      ctx.beginPath();
      ctx.arc(cx, cy, radius + (isPrimary ? 2.2 : 1.6), 0, Math.PI * 2);
      ctx.fillStyle = "rgba(21, 23, 26, 0.85)";
      ctx.fill();

      ctx.beginPath();
      ctx.arc(cx, cy, radius + (isPrimary ? 1 : 0.7), 0, Math.PI * 2);
      ctx.fillStyle = "#ffffff";
      ctx.fill();

      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fillStyle = isPrimary ? strokeColor : stageTokens.jointSecondary;
      ctx.fill();
    }
  }

  ctx.restore();

  if (
    showOverlay &&
    highlightAngleDeg !== null &&
    highlightAngleDeg !== undefined &&
    Number.isFinite(highlightAngleDeg)
  ) {
    const anchor = findAngleAnchor(keypoints, mode, exercise, side, minConfidence);
    if (anchor) {
      const rawX = mapX(anchor.x);
      const screenX = mirror ? width - rawX : rawX;
      const screenY = mapY(anchor.y);
      drawAnglePill(
        ctx,
        screenX,
        screenY,
        highlightAngleDeg,
        strokeColor,
        stageTokens.fontSans,
        width,
        height,
      );
    }
  }
}
