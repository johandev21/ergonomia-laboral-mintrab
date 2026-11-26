import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createAgent } from "@ui-sdk/react/agent";
import { beforeEach, describe, expect, test, vi } from "vite-plus/test";
import {
  ErgonomicsWorkbench,
  KEYPOINT_META,
  type ModelVariant,
  type PoseEngine,
  type PoseKeypoint,
} from "../features/ergonomics";

let approveConfirm = false;
const agent = createAgent({
  allow: (step) => !step.confirm || approveConfirm,
});

function createOptimalKeypoints(): PoseKeypoint[] {
  const coords: Array<[number, number, number]> = [
    [320, 120, 0.94],
    [332, 110, 0.92],
    [308, 110, 0.92],
    [348, 122, 0.91],
    [292, 122, 0.91],
    [370, 210, 0.95],
    [270, 210, 0.95],
    [395, 290, 0.9],
    [245, 290, 0.9],
    [390, 355, 0.89],
    [250, 355, 0.89],
    [355, 380, 0.93],
    [285, 380, 0.93],
    [355, 460, 0.88],
    [285, 460, 0.88],
    [355, 520, 0.86],
    [285, 520, 0.86],
  ];

  return KEYPOINT_META.map((meta, idx) => {
    const [x, y, score] = coords[idx] ?? [0, 0, 0];
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

function createMockEngine() {
  const init = vi.fn(async (_variant: ModelVariant) => ({ backend: "webgl" }));
  const switchVariant = vi.fn(async (_variant: ModelVariant) => ({
    backend: "webgl",
  }));
  const estimate = vi.fn(async () => ({
    keypoints: createOptimalKeypoints(),
    inferenceMs: 12.4,
  }));
  const reset = vi.fn();
  const dispose = vi.fn();

  const engine: PoseEngine = {
    init,
    switchVariant,
    estimate,
    reset,
    dispose,
  };

  return { engine, init, switchVariant, estimate, reset, dispose };
}

function installMockImage(): () => void {
  const OriginalImage = globalThis.Image;
  class MockImage {
    naturalWidth = 640;
    naturalHeight = 480;
    width = 640;
    height = 480;
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;

    set src(_value: string) {
      queueMicrotask(() => {
        this.onload?.();
      });
    }
  }
  Object.defineProperty(globalThis, "Image", {
    configurable: true,
    writable: true,
    value: MockImage,
  });
  return () => {
    Object.defineProperty(globalThis, "Image", {
      configurable: true,
      writable: true,
      value: OriginalImage,
    });
  };
}

describe("ErgonomicsWorkbench", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  test("an agent can inspect every control and drive mode, exercise, model and overlay", async () => {
    const mock = createMockEngine();
    render(<ErgonomicsWorkbench engineFactory={() => mock.engine} />);

    await screen.findByText(/Modelo MoveNet listo/i);

    const components = agent
      .snapshot()
      .filter((entry) => !entry.offPage && entry.component !== "more");
    for (const entry of components) {
      expect(entry.label, `${entry.component} ${entry.ref} has no name`).toBeTruthy();
    }

    const labels = components.map((entry) => entry.label);
    for (const expectedLabel of [
      "Modo de evaluación",
      "Guía ergonómica",
      "Activar cámara",
      "Detener cámara",
      "Analizar fotografía",
      "Reiniciar sesión",
      "Borrar registro",
      "Panel ergonómico",
      "Índice ergonómico",
    ]) {
      expect(labels, `${expectedLabel} is missing from snapshot`).toContain(expectedLabel);
    }

    const modeStep = await agent.act({
      steps: [{ ref: "Modo de evaluación", action: "setValue", args: ["Pausa activa"] }],
    });
    expect(modeStep.ok, modeStep.error?.message).toBe(true);

    const exerciseStep = await agent.act({
      steps: [
        {
          ref: "Ejercicio de pausa activa",
          action: "setValue",
          args: ["Elevación de brazos"],
        },
        { ref: "Panel ergonómico", action: "select", args: ["Calibración"] },
      ],
    });
    expect(exerciseStep.ok, exerciseStep.error?.message).toBe(true);

    const calibrationStep = await agent.act({
      steps: [
        {
          ref: "Modelo MoveNet",
          action: "setValue",
          args: ["MoveNet Thunder (precisión)"],
        },
        { ref: "Mostrar esqueleto y ángulos", action: "toggle" },
      ],
    });
    expect(calibrationStep.ok, calibrationStep.error?.message).toBe(true);

    expect(mock.switchVariant).toHaveBeenCalledWith("thunder");
    expect(
      screen
        .getByRole("switch", { name: /Mostrar esqueleto y ángulos/i })
        .getAttribute("aria-checked"),
    ).toBe("false");
    expect(screen.getByRole("combobox", { name: /Modelo MoveNet/i }).textContent).toContain(
      "MoveNet Thunder (precisión)",
    );

    const backToEval = await agent.act({
      steps: [{ ref: "Panel ergonómico", action: "select", args: ["Evaluación"] }],
    });
    expect(backToEval.ok, backToEval.error?.message).toBe(true);
    expect(
      screen.getByRole("combobox", { name: /Ejercicio de pausa activa/i }).textContent,
    ).toContain("Elevación de brazos");
  });

  test("confirmation gate refuses Borrar registro when denied and clears session when approved", async () => {
    const restoreImage = installMockImage();
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    const mock = createMockEngine();

    try {
      render(<ErgonomicsWorkbench engineFactory={() => mock.engine} />);
      await screen.findByText(/Modelo MoveNet listo/i);

      expect(screen.getByText(/Sin lecturas aún · historial de la sesión/i)).toBeTruthy();

      const fileInput = document.querySelector<HTMLInputElement>(
        '[data-slot="file-input"] input[type="file"]',
      );
      expect(fileInput).not.toBeNull();
      const photo = new File(["mock-png"], "postura.png", { type: "image/png" });
      await user.upload(fileInput!, photo);

      await waitFor(() => {
        expect(mock.estimate).toHaveBeenCalledTimes(1);
      });
      await waitFor(() => {
        expect(screen.getByRole("status", { name: "Estado del análisis" }).textContent).toContain(
          "Fotografía analizada: postura.png.",
        );
      });
      expect(screen.getByText(/100% óptima · 0 alertas · 1 lectura/i)).toBeTruthy();
      expect(document.querySelectorAll('.timeline-tick[data-status="optima"]')).toHaveLength(1);
      expect(document.querySelectorAll('.timeline-tick[data-status="idle"]')).toHaveLength(27);

      approveConfirm = false;
      const refused = await agent.act({
        steps: [
          {
            ref: "Borrar registro",
            action: "press",
            args: ["Confirmar borrado"],
          },
        ],
      });
      expect(refused.ok).toBe(false);
      expect(screen.getByText("1")).toBeTruthy();

      approveConfirm = true;
      const approved = await agent.act({
        steps: [
          {
            ref: "Borrar registro",
            action: "press",
            args: ["Confirmar borrado"],
          },
        ],
      });
      expect(approved.ok, approved.error?.message).toBe(true);
      expect(screen.getByRole("status", { name: "Estado del análisis" }).textContent).toContain(
        "Registro ergonómico borrado.",
      );
      expect(screen.getByText(/Sin lecturas aún · historial de la sesión/i)).toBeTruthy();
      expect(document.querySelectorAll('.timeline-tick[data-status="idle"]')).toHaveLength(28);
      expect(mock.reset).toHaveBeenCalled();
    } finally {
      approveConfirm = false;
      restoreImage();
    }
  });

  test("keyboard interactions toggle calibration switches, manage dialog focus with Escape, and analyze uploaded photos", async () => {
    const restoreImage = installMockImage();
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    const mock = createMockEngine();

    try {
      render(<ErgonomicsWorkbench engineFactory={() => mock.engine} />);
      await screen.findByText(/Modelo MoveNet listo/i);

      const guideTrigger = screen.getByRole("button", {
        name: "Guía ergonómica",
      });
      await user.click(guideTrigger);
      expect(
        await screen.findByRole("dialog", {
          name: /Guía técnica de ergonomía y privacidad/i,
        }),
      ).toBeTruthy();

      await user.keyboard("{Escape}");
      await waitFor(() => {
        expect(screen.queryByRole("dialog")).toBeNull();
      });
      expect(document.activeElement).toBe(guideTrigger);

      const calibrationTab = screen.getByRole("tab", { name: "Calibración" });
      await user.click(calibrationTab);

      const overlaySwitch = screen.getByRole("switch", {
        name: /Mostrar esqueleto y ángulos/i,
      });
      const mirrorSwitch = screen.getByRole("switch", {
        name: /Modo espejo de cámara/i,
      });

      expect(overlaySwitch.getAttribute("aria-checked")).toBe("true");
      expect(mirrorSwitch.getAttribute("aria-checked")).toBe("true");

      overlaySwitch.focus();
      await user.keyboard(" ");
      expect(overlaySwitch.getAttribute("aria-checked")).toBe("false");

      mirrorSwitch.focus();
      await user.keyboard(" ");
      expect(mirrorSwitch.getAttribute("aria-checked")).toBe("false");

      await user.click(screen.getByRole("tab", { name: "Evaluación" }));

      const fileInput = document.querySelector<HTMLInputElement>(
        '[data-slot="file-input"] input[type="file"]',
      );
      expect(fileInput).not.toBeNull();
      const photo = new File(["mock-jpeg"], "escritorio.jpg", {
        type: "image/jpeg",
      });
      await user.upload(fileInput!, photo);

      await waitFor(() => {
        expect(mock.estimate).toHaveBeenCalledTimes(1);
      });
      await waitFor(() => {
        expect(screen.getByRole("status", { name: "Estado del análisis" }).textContent).toContain(
          "Fotografía analizada: escritorio.jpg.",
        );
      });
      expect(
        screen.getByRole("meter", { name: "Índice ergonómico" }).getAttribute("aria-valuenow"),
      ).not.toBe("0");
    } finally {
      restoreImage();
    }
  });

  test("records bad-posture alert in Historial tab and preserves it after returning to optimal posture", async () => {
    const restoreImage = installMockImage();
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    const mock = createMockEngine();

    const riskKeypoints: PoseKeypoint[] = KEYPOINT_META.map((meta) => {
      const overrides: Record<number, [number, number, number]> = {
        3: [390, 150, 0.94],
        5: [300, 260, 0.95],
        11: [300, 420, 0.92],
      };
      const [x, y, score] = overrides[meta.index] ?? [0, 0, 0];
      return { index: meta.index, name: meta.name, labelEs: meta.labelEs, x, y, score };
    });

    mock.estimate
      .mockResolvedValueOnce({ keypoints: riskKeypoints, inferenceMs: 14.2 })
      .mockResolvedValueOnce({ keypoints: createOptimalKeypoints(), inferenceMs: 11.1 });

    try {
      render(<ErgonomicsWorkbench engineFactory={() => mock.engine} />);
      await screen.findByText(/Modelo MoveNet listo/i);

      const fileInput = document.querySelector<HTMLInputElement>(
        '[data-slot="file-input"] input[type="file"]',
      );
      expect(fileInput).not.toBeNull();

      await user.upload(fileInput!, new File(["bad"], "mala-postura.png", { type: "image/png" }));
      await waitFor(() => {
        expect(mock.estimate).toHaveBeenCalledTimes(1);
      });

      await user.upload(fileInput!, new File(["good"], "buena-postura.png", { type: "image/png" }));
      await waitFor(() => {
        expect(mock.estimate).toHaveBeenCalledTimes(2);
      });

      // Timeline still shows the 1 alert even after returning to optimal posture
      expect(screen.getByText(/50% óptima · 1 alerta · 2 cuadros/i)).toBeTruthy();

      // Open Historial tab and verify alert + CSV button
      await user.click(screen.getByRole("tab", { name: "Historial" }));
      expect(screen.getByText(/Sobrecarga cervical marcada/i)).toBeTruthy();
      expect(screen.getByText(/mala-postura\.png/i)).toBeTruthy();
      const exportBtn = screen.getByRole("button", { name: "Exportar CSV" });
      expect(exportBtn.hasAttribute("disabled")).toBe(false);
    } finally {
      restoreImage();
    }
  });

  test("Pausa activa hides bad-posture UI, shows 3-step guide + routine card, and avoids false posture alerts", async () => {
    const restoreImage = installMockImage();
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    const mock = createMockEngine();

    const riskKeypoints: PoseKeypoint[] = KEYPOINT_META.map((meta) => {
      const overrides: Record<number, [number, number, number]> = {
        3: [390, 150, 0.94],
        5: [300, 260, 0.95],
        11: [300, 420, 0.92],
      };
      const [x, y, score] = overrides[meta.index] ?? [0, 0, 0];
      return { index: meta.index, name: meta.name, labelEs: meta.labelEs, x, y, score };
    });

    mock.estimate.mockResolvedValueOnce({ keypoints: riskKeypoints, inferenceMs: 13.0 });

    try {
      render(<ErgonomicsWorkbench engineFactory={() => mock.engine} />);
      await screen.findByText(/Modelo MoveNet listo/i);

      // Switch to Pausa activa
      await user.click(screen.getByRole("radio", { name: "Pausa activa" }));

      // Posture meter and posture timeline must be hidden in Pausa activa
      expect(screen.queryByRole("meter", { name: "Índice ergonómico" })).toBeNull();
      expect(screen.queryByText(/Estabilidad postural de la sesión/i)).toBeNull();

      // Routine card and 3-step guide must be shown
      expect(screen.getByText(/Rutina de pausa activa/i)).toBeTruthy();
      expect(screen.getByText(/0\s*\/\s*3 ejercicios completados/i)).toBeTruthy();
      expect(screen.getByRole("list", { name: "Pasos del ejercicio" })).toBeTruthy();

      // Clicking a routine card item switches the active exercise
      await user.click(screen.getByRole("button", { name: /Elevación de brazos/i }));
      expect(
        screen.getByRole("combobox", { name: /Ejercicio de pausa activa/i }).textContent,
      ).toContain("Elevación de brazos");

      // Analyzing a bent/slouched photo during Pausa activa does NOT log a false posture alert
      const fileInput = document.querySelector<HTMLInputElement>(
        '[data-slot="file-input"] input[type="file"]',
      );
      await user.upload(fileInput!, new File(["break"], "pausa.png", { type: "image/png" }));
      await waitFor(() => {
        expect(mock.estimate).toHaveBeenCalledTimes(1);
      });

      await user.click(screen.getByRole("tab", { name: "Historial" }));
      expect(screen.getByText(/Aún no hay alertas posturales ni pausas completadas/i)).toBeTruthy();
    } finally {
      restoreImage();
    }
  });
});
