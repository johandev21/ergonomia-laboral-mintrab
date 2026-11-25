import type * as PoseDetectionModule from "@tensorflow-models/pose-detection";
import type * as TfModule from "@tensorflow/tfjs";
import type { ModelVariant, PoseEngine, PoseInferenceResult } from "../types/ergonomics.types";
import { normalizeKeypoints } from "./evaluate-posture";

interface RuntimeModules {
  tf: typeof TfModule;
  poseDetection: typeof PoseDetectionModule;
}

let runtimePromise: Promise<RuntimeModules> | null = null;

function loadRuntime(): Promise<RuntimeModules> {
  if (!runtimePromise) {
    runtimePromise = Promise.all([
      import("@tensorflow/tfjs"),
      import("@tensorflow-models/pose-detection"),
    ]).then(([tf, poseDetection]) => ({ tf, poseDetection }));
  }
  return runtimePromise;
}

export function createMoveNetEngine(): PoseEngine {
  let detector: PoseDetectionModule.PoseDetector | null = null;
  let currentVariant: ModelVariant | null = null;
  let backendName = "cpu";
  let backendInitialized = false;

  async function ensureBackend(tf: typeof TfModule): Promise<string> {
    if (backendInitialized) {
      return backendName;
    }

    let webglReady = false;
    try {
      webglReady = await tf.setBackend("webgl");
      if (webglReady) {
        await tf.ready();
      }
    } catch {
      webglReady = false;
    }

    if (!webglReady) {
      await tf.setBackend("cpu");
      await tf.ready();
    }

    backendName = tf.getBackend() || (webglReady ? "webgl" : "cpu");
    backendInitialized = true;
    return backendName;
  }

  async function loadDetector(variant: ModelVariant): Promise<{ backend: string }> {
    const { tf, poseDetection } = await loadRuntime();
    const backend = await ensureBackend(tf);
    if (detector) {
      detector.dispose();
      detector = null;
    }

    const modelType =
      variant === "thunder"
        ? poseDetection.movenet.modelType.SINGLEPOSE_THUNDER
        : poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING;

    detector = await poseDetection.createDetector(poseDetection.SupportedModels.MoveNet, {
      modelType,
      enableSmoothing: true,
    });
    currentVariant = variant;
    return { backend };
  }

  return {
    async init(variant: ModelVariant) {
      return loadDetector(variant);
    },

    async switchVariant(variant: ModelVariant) {
      if (detector && currentVariant === variant) {
        const { tf } = await loadRuntime();
        const backend = await ensureBackend(tf);
        return { backend };
      }
      return loadDetector(variant);
    },

    async estimate(
      source: HTMLVideoElement | HTMLCanvasElement | HTMLImageElement,
    ): Promise<PoseInferenceResult> {
      if (!detector) {
        throw new Error("El motor MoveNet aún no está inicializado.");
      }

      if ("readyState" in source && source.readyState < 2) {
        return {
          keypoints: normalizeKeypoints([]),
          inferenceMs: 0,
        };
      }

      const startedAt = performance.now();
      const poses = await detector.estimatePoses(source, {
        flipHorizontal: false,
      });
      const inferenceMs = Math.max(0, Math.round((performance.now() - startedAt) * 10) / 10);
      const rawKeypoints = poses[0]?.keypoints ?? [];
      return {
        keypoints: normalizeKeypoints(rawKeypoints),
        inferenceMs,
      };
    },

    reset() {
      detector?.reset();
    },

    dispose() {
      if (detector) {
        detector.dispose();
        detector = null;
      }
      currentVariant = null;
    },
  };
}
