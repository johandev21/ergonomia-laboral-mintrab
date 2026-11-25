import {
  SegmentedControl,
  SegmentedControlIndicator,
  SegmentedControlItem,
} from "@ui-sdk/react/segmented-control";
import type { AppMode } from "../types/ergonomics.types";
import { GuideDialog } from "./guide-dialog";

export interface WorkbenchTopbarProps {
  mode: AppMode;
  onModeChange: (mode: AppMode) => void;
}

export function WorkbenchTopbar({ mode, onModeChange }: WorkbenchTopbarProps) {
  return (
    <header className="topbar">
      <div className="topbar-inner">
        <div className="brand-group">
          <h1 className="brand-wordmark">Ergonomía laboral</h1>
        </div>

        <div className="topbar-actions">
          <SegmentedControl
            aria-label="Modo de evaluación"
            value={mode}
            onValueChange={(next) => {
              if (next === "postura" || next === "pausa") {
                onModeChange(next);
              }
            }}
          >
            <SegmentedControlIndicator />
            <SegmentedControlItem value="postura">Postura en escritorio</SegmentedControlItem>
            <SegmentedControlItem value="pausa">Pausa activa</SegmentedControlItem>
          </SegmentedControl>

          <GuideDialog />
        </div>
      </div>
    </header>
  );
}
