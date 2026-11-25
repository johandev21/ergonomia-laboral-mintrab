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
      <WorkbenchTopbar mode={sessionState.mode} onModeChange={sessionState.setMode} />

      <main className="workbench-main">
        <PostureStage
          videoRef={sessionState.videoRef}
          canvasRef={sessionState.canvasRef}
          cameraActive={sessionState.cameraActive}
          photoActive={sessionState.photoActive}
          engineLoading={sessionState.engineLoading}
          photoFiles={sessionState.photoFiles}
          postureHistory={sessionState.session.postureHistory}
          statusMessage={sessionState.statusMessage}
          statusTone={sessionState.statusTone}
          statusFileName={sessionState.statusFileName}
          onStartCamera={() => void sessionState.handleStartCamera()}
          onStopCamera={sessionState.handleStopCamera}
          onSelectPhotos={(files) => void sessionState.handlePhotoSelection(files)}
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
          onCalibrationChange={sessionState.setCalibration}
          onModelVariantChange={(variant) => void sessionState.handleModelVariantChange(variant)}
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
  onCalibrationChange: Dispatch<SetStateAction<CalibrationSettings>>;
  onModelVariantChange: (variant: ModelVariant) => void;
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
  onCalibrationChange,
  onModelVariantChange,
}: ErgonomicsInspectorProps) {
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
          <KeypointsTable keypoints={keypoints} minConfidence={calibration.minConfidence} />
        </TabsPanel>
      </Tabs>
    </aside>
  );
}
