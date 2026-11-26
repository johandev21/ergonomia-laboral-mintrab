import { Tabs, TabsIndicator, TabsList, TabsPanel, TabsTab } from "@ui-sdk/react/tabs";
import { useState, type Dispatch, type SetStateAction } from "react";
import { createMoveNetEngine } from "../engine/movenet-engine";
import { useErgonomicsSession } from "../hooks/use-ergonomics-session";
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
} from "../types/ergonomics.types";
import { CalibrationPanel } from "./calibration-panel";
import { EvaluationPanel } from "./evaluation-panel";
import { HistoryPanel } from "./history-panel";
import { KeypointsTable } from "./keypoints-table";
import { PostureStage } from "./posture-stage";
import { WorkbenchTopbar } from "./workbench-topbar";

export interface ErgonomicsWorkbenchProps {
  engineFactory?: () => PoseEngine;
  initialAutoInit?: boolean;
}

export function ErgonomicsWorkbench({
  engineFactory = createMoveNetEngine,
  initialAutoInit = true,
}: ErgonomicsWorkbenchProps) {
  const [activeTab, setActiveTab] = useState<string>("evaluacion");
  const sessionState = useErgonomicsSession({ engineFactory, initialAutoInit });

  return (
    <div className="workbench-shell">
      <WorkbenchTopbar mode={sessionState.mode} onModeChange={sessionState.handleModeChange} />

      <main className="workbench-main">
        <PostureStage
          videoRef={sessionState.videoRef}
          canvasRef={sessionState.canvasRef}
          mode={sessionState.mode}
          exercise={sessionState.exercise}
          cameraActive={sessionState.cameraActive}
          photoActive={sessionState.photoActive}
          engineLoading={sessionState.engineLoading}
          photoFiles={sessionState.photoFiles}
          session={sessionState.session}
          statusMessage={sessionState.statusMessage}
          statusTone={sessionState.statusTone}
          statusFileName={sessionState.statusFileName}
          onStartCamera={() => void sessionState.handleStartCamera()}
          onStopCamera={sessionState.handleStopCamera}
          onSelectPhotos={(files) => void sessionState.handlePhotoSelection(files)}
          onSelectExercise={sessionState.handleExerciseChange}
          onResetSession={sessionState.handleResetSession}
          onClearRecords={sessionState.handleClearRecords}
        />

        <ErgonomicsInspector
          activeTab={activeTab}
          onTabChange={setActiveTab}
          mode={sessionState.mode}
          exercise={sessionState.exercise}
          calibration={sessionState.calibration}
          keypoints={sessionState.keypoints}
          postureMetrics={sessionState.postureMetrics}
          exerciseSnapshot={sessionState.exerciseSnapshot}
          session={sessionState.session}
          onExerciseChange={sessionState.handleExerciseChange}
          onTargetRepsChange={sessionState.handleTargetRepsChange}
          onNextExercise={sessionState.handleNextExercise}
          onRepeatExercise={sessionState.handleRepeatExercise}
          onCalibrationChange={sessionState.setCalibration}
          onModelVariantChange={(variant) => void sessionState.handleModelVariantChange(variant)}
          onExportHistoryCsv={sessionState.handleExportHistoryCsv}
        />
      </main>
    </div>
  );
}

interface ErgonomicsInspectorProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  mode: AppMode;
  exercise: ExerciseType;
  calibration: CalibrationSettings;
  keypoints: readonly PoseKeypoint[];
  postureMetrics: PostureMetrics;
  exerciseSnapshot: ExerciseSnapshot;
  session: SessionSummary;
  onExerciseChange: (exercise: ExerciseType) => void;
  onTargetRepsChange: (reps: number) => void;
  onNextExercise: () => void;
  onRepeatExercise: () => void;
  onCalibrationChange: Dispatch<SetStateAction<CalibrationSettings>>;
  onModelVariantChange: (variant: ModelVariant) => void;
  onExportHistoryCsv: () => void;
}

function ErgonomicsInspector({
  activeTab,
  onTabChange,
  mode,
  exercise,
  calibration,
  keypoints,
  postureMetrics,
  exerciseSnapshot,
  session,
  onExerciseChange,
  onTargetRepsChange,
  onNextExercise,
  onRepeatExercise,
  onCalibrationChange,
  onModelVariantChange,
  onExportHistoryCsv,
}: ErgonomicsInspectorProps) {
  const totalEvents = session.historyEvents.length;

  return (
    <aside className="inspector-panel" aria-label="Inspector ergonómico">
      <Tabs
        value={activeTab}
        onValueChange={(next) => {
          if (next) onTabChange(next);
        }}
      >
        <TabsList aria-label="Panel ergonómico">
          <TabsTab value="evaluacion">Evaluación</TabsTab>
          <TabsTab value="calibracion">Calibración</TabsTab>
          <TabsTab value="puntos">Puntos clave</TabsTab>
          <TabsTab value="historial">
            Historial
            {totalEvents > 0 ? (
              <span className="tab-count" aria-hidden="true">
                {totalEvents}
              </span>
            ) : null}
          </TabsTab>
          <TabsIndicator />
        </TabsList>

        <TabsPanel value="evaluacion">
          <EvaluationPanel
            mode={mode}
            postureMetrics={postureMetrics}
            exercise={exercise}
            exerciseSnapshot={exerciseSnapshot}
            targetReps={calibration.targetReps}
            session={session}
            onExerciseChange={onExerciseChange}
            onTargetRepsChange={onTargetRepsChange}
            onNextExercise={onNextExercise}
            onRepeatExercise={onRepeatExercise}
          />
        </TabsPanel>

        <TabsPanel value="calibracion">
          <CalibrationPanel
            calibration={calibration}
            onCalibrationChange={onCalibrationChange}
            onModelVariantChange={onModelVariantChange}
          />
        </TabsPanel>

        <TabsPanel value="puntos">
          {activeTab === "puntos" ? (
            <KeypointsTable keypoints={keypoints} minConfidence={calibration.minConfidence} />
          ) : null}
        </TabsPanel>

        <TabsPanel value="historial">
          {activeTab === "historial" ? (
            <HistoryPanel session={session} onExportCsv={onExportHistoryCsv} />
          ) : null}
        </TabsPanel>
      </Tabs>
    </aside>
  );
}
