import { describe, expect, it } from "vite-plus/test";
import {
  DEFAULT_CALIBRATION,
  KEYPOINT_META,
  SKELETON_EDGES,
  calculateAngle,
  createExerciseTracker,
  evaluateDeskPosture,
  normalizeKeypoints,
  type PoseKeypoint,
} from "../features/ergonomics";

function makePose(
  overrides: Partial<Record<number, { x: number; y: number; score?: number }>>,
): PoseKeypoint[] {
  const raw = KEYPOINT_META.map((meta) => {
    const patch = overrides[meta.index];
    return {
      name: meta.name,
      x: patch?.x ?? 0,
      y: patch?.y ?? 0,
      score: patch?.score ?? 0,
    };
  });
  return normalizeKeypoints(raw);
}

describe("ergonomics constants and normalization", () => {
  it("defines 17 keypoints, 16 skeleton edges, and default calibration", () => {
    expect(KEYPOINT_META).toHaveLength(17);
    expect(SKELETON_EDGES).toHaveLength(16);
    expect(DEFAULT_CALIBRATION.modelVariant).toBe("lightning");
    expect(DEFAULT_CALIBRATION.minConfidence).toBe(0.45);
    expect(DEFAULT_CALIBRATION.neckThresholdDeg).toBe(15);
  });

  it("normalizes partial raw keypoints cleanly", () => {
    const normalized = normalizeKeypoints([
      { name: "left_shoulder", x: 120, y: 240, score: 0.91 },
      { name: "nose", x: 200, y: 100, score: 0.85 },
    ]);
    expect(normalized).toHaveLength(17);
    expect(normalized[0]).toMatchObject({
      index: 0,
      name: "nose",
      labelEs: "Nariz",
      x: 200,
      y: 100,
      score: 0.85,
    });
    expect(normalized[5]).toMatchObject({
      index: 5,
      name: "left_shoulder",
      labelEs: "Hombro izquierdo",
      x: 120,
      y: 240,
      score: 0.91,
    });
    expect(normalized[16].score).toBe(0);
  });
});

describe("calculateAngle", () => {
  it("computes 90, 180, and 45 degree angles accurately", () => {
    expect(calculateAngle({ x: 0, y: 10 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBeCloseTo(90, 5);
    expect(calculateAngle({ x: -10, y: 0 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBeCloseTo(180, 5);
    expect(calculateAngle({ x: 10, y: 0 }, { x: 0, y: 0 }, { x: 10, y: 10 })).toBeCloseTo(45, 5);
  });

  it("returns null for degenerate zero-length or non-finite vectors", () => {
    expect(calculateAngle({ x: 5, y: 5 }, { x: 5, y: 5 }, { x: 10, y: 5 })).toBeNull();
    expect(calculateAngle({ x: 0, y: 0 }, { x: 5, y: 5 }, { x: 5, y: 5 })).toBeNull();
    expect(calculateAngle({ x: Number.NaN, y: 0 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBeNull();
  });
});

describe("evaluateDeskPosture", () => {
  const baseSettings = {
    side: "auto" as const,
    minConfidence: 0.45,
    neckThresholdDeg: 15,
  };

  it("returns sin-pose when neither shoulders nor neck can be measured", () => {
    const pose = makePose({
      0: { x: 320, y: 120, score: 0.9 },
      5: { x: 240, y: 260, score: 0.2 },
      6: { x: 400, y: 260, score: 0.2 },
    });
    const metrics = evaluateDeskPosture(pose, baseSettings);
    expect(metrics.status).toBe("sin-pose");
    expect(metrics.score).toBe(0);
    expect(metrics.visibleCount).toBe(1);
    expect(metrics.neckAngleDeg).toBeNull();
    expect(metrics.shoulderTiltDeg).toBeNull();
  });

  it("evaluates aligned frontal webcam posture as optima", () => {
    const pose = makePose({
      0: { x: 320, y: 150, score: 0.95 },
      3: { x: 275, y: 150, score: 0.9 },
      4: { x: 365, y: 150, score: 0.9 },
      5: { x: 230, y: 270, score: 0.95 },
      6: { x: 410, y: 270, score: 0.95 },
      11: { x: 250, y: 430, score: 0.9 },
      12: { x: 390, y: 430, score: 0.9 },
    });
    const metrics = evaluateDeskPosture(pose, baseSettings);
    expect(metrics.status).toBe("optima");
    expect(metrics.score).toBe(100);
    expect(metrics.neckAngleDeg).toBeCloseTo(0, 1);
    expect(metrics.shoulderTiltDeg).toBeCloseTo(0, 1);
    expect(metrics.torsoLeanDeg).toBeCloseTo(0, 1);
  });

  it("flags forward neck inclination as advertencia and then riesgo in side profile", () => {
    const mildForward = makePose({
      3: { x: 344, y: 160, score: 0.92 },
      5: { x: 300, y: 260, score: 0.95 },
      11: { x: 300, y: 420, score: 0.9 },
    });
    const mildMetrics = evaluateDeskPosture(mildForward, baseSettings);
    expect(mildMetrics.neckAngleDeg).toBeGreaterThan(22);
    expect(mildMetrics.status).toBe("advertencia");
    expect(mildMetrics.score).toBeGreaterThanOrEqual(55);
    expect(mildMetrics.score).toBeLessThan(80);

    const severeForward = makePose({
      3: { x: 380, y: 160, score: 0.92 },
      5: { x: 300, y: 260, score: 0.95 },
      11: { x: 300, y: 420, score: 0.9 },
    });
    const severeMetrics = evaluateDeskPosture(severeForward, baseSettings);
    expect(severeMetrics.neckAngleDeg).toBeGreaterThan(35);
    expect(severeMetrics.status).toBe("riesgo");
    expect(severeMetrics.score).toBeLessThan(55);
  });

  it("detects shoulder asymmetry even when head is centered", () => {
    const tilted = makePose({
      3: { x: 275, y: 150, score: 0.9 },
      4: { x: 365, y: 150, score: 0.9 },
      5: { x: 230, y: 245, score: 0.95 },
      6: { x: 410, y: 310, score: 0.95 },
    });
    const metrics = evaluateDeskPosture(tilted, baseSettings);
    expect(metrics.shoulderTiltDeg).toBeGreaterThan(18);
    expect(metrics.status).toBe("riesgo");
    expect(metrics.score).toBeLessThan(55);
  });
});

describe("createExerciseTracker", () => {
  const settings = { side: "auto" as const, minConfidence: 0.45 };

  function makeSquatPose(kneeDeg: "up" | "down" | "mid"): PoseKeypoint[] {
    if (kneeDeg === "up") {
      return makePose({
        11: { x: 300, y: 240, score: 0.95 },
        13: { x: 300, y: 340, score: 0.95 },
        15: { x: 300, y: 440, score: 0.95 },
      });
    }
    if (kneeDeg === "down") {
      return makePose({
        11: { x: 230, y: 340, score: 0.95 },
        13: { x: 320, y: 340, score: 0.95 },
        15: { x: 320, y: 440, score: 0.95 },
      });
    }
    return makePose({
      11: { x: 260, y: 270, score: 0.95 },
      13: { x: 310, y: 340, score: 0.95 },
      15: { x: 310, y: 440, score: 0.95 },
    });
  }

  function makeArmRaisePose(state: "down" | "up"): PoseKeypoint[] {
    if (state === "down") {
      return makePose({
        12: { x: 360, y: 360, score: 0.95 },
        6: { x: 360, y: 220, score: 0.95 },
        10: { x: 380, y: 350, score: 0.95 },
      });
    }
    return makePose({
      12: { x: 360, y: 360, score: 0.95 },
      6: { x: 360, y: 220, score: 0.95 },
      10: { x: 365, y: 90, score: 0.95 },
    });
  }

  function makeNeckTiltPose(state: "neutral" | "stretch"): PoseKeypoint[] {
    if (state === "neutral") {
      return makePose({
        3: { x: 280, y: 150, score: 0.92 },
        4: { x: 360, y: 150, score: 0.92 },
        5: { x: 230, y: 270, score: 0.95 },
        6: { x: 410, y: 270, score: 0.95 },
      });
    }
    return makePose({
      3: { x: 335, y: 135, score: 0.92 },
      4: { x: 395, y: 185, score: 0.92 },
      5: { x: 230, y: 270, score: 0.95 },
      6: { x: 410, y: 270, score: 0.95 },
    });
  }

  it("enforces 3-frame stability debouncing and counts squat reps + completion", () => {
    const tracker = createExerciseTracker("squat", 2);

    const standing = makeSquatPose("up");
    const squatting = makeSquatPose("down");

    tracker.update(standing, settings);
    tracker.update(standing, settings);
    expect(tracker.update(standing, settings).phase).toBe("arriba");

    // 2 frames of squat should not latch yet
    tracker.update(squatting, settings);
    tracker.update(squatting, settings);
    tracker.update(standing, settings);
    tracker.update(standing, settings);
    expect(tracker.update(standing, settings).reps).toBe(0);

    // Full rep 1
    tracker.update(squatting, settings);
    tracker.update(squatting, settings);
    expect(tracker.update(squatting, settings).phase).toBe("abajo");
    tracker.update(standing, settings);
    tracker.update(standing, settings);
    const rep1 = tracker.update(standing, settings);
    expect(rep1.reps).toBe(1);
    expect(rep1.completed).toBe(false);

    // Full rep 2 reaches targetReps
    tracker.update(squatting, settings);
    tracker.update(squatting, settings);
    tracker.update(squatting, settings);
    tracker.update(standing, settings);
    tracker.update(standing, settings);
    const rep2 = tracker.update(standing, settings);
    expect(rep2.reps).toBe(2);
    expect(rep2.completed).toBe(true);

    const resetSnapshot = tracker.reset("arm-raise", 3);
    expect(resetSnapshot.exercise).toBe("arm-raise");
    expect(resetSnapshot.reps).toBe(0);
    expect(resetSnapshot.targetReps).toBe(3);
    expect(resetSnapshot.completed).toBe(false);
    expect(resetSnapshot.phase).toBe("esperando");
  });

  it("counts arm-raise reps when raising up and returning down", () => {
    const tracker = createExerciseTracker("arm-raise", 1);
    const down = makeArmRaisePose("down");
    const up = makeArmRaisePose("up");

    for (let i = 0; i < 3; i += 1) tracker.update(down, settings);
    expect(tracker.getSnapshot().phase).toBe("abajo");
    expect(tracker.getSnapshot().reps).toBe(0);

    for (let i = 0; i < 3; i += 1) tracker.update(up, settings);
    expect(tracker.getSnapshot().phase).toBe("arriba");
    expect(tracker.getSnapshot().reps).toBe(0);

    for (let i = 0; i < 3; i += 1) tracker.update(down, settings);
    expect(tracker.getSnapshot().reps).toBe(1);
    expect(tracker.getSnapshot().completed).toBe(true);
  });

  it("counts neck-tilt reps when holding stretch and returning to neutral", () => {
    const tracker = createExerciseTracker("neck-tilt", 1);
    const neutral = makeNeckTiltPose("neutral");
    const stretch = makeNeckTiltPose("stretch");

    for (let i = 0; i < 3; i += 1) tracker.update(neutral, settings);
    expect(tracker.getSnapshot().phase).toBe("abajo");

    for (let i = 0; i < 3; i += 1) tracker.update(stretch, settings);
    expect(tracker.getSnapshot().phase).toBe("arriba");
    expect(tracker.getSnapshot().reps).toBe(0);

    for (let i = 0; i < 3; i += 1) tracker.update(neutral, settings);
    expect(tracker.getSnapshot().reps).toBe(1);
    expect(tracker.getSnapshot().completed).toBe(true);
  });
});
