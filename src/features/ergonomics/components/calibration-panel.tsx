import { Field, FieldDescription, FieldLabel } from "@ui-sdk/react/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectItemIndicator,
  SelectTrigger,
  SelectValue,
} from "@ui-sdk/react/select";
import {
  Slider,
  SliderControl,
  SliderIndicator,
  SliderThumb,
  SliderTrack,
  SliderValue,
} from "@ui-sdk/react/slider";
import { Switch, SwitchThumb } from "@ui-sdk/react/switch";
import type { Dispatch, SetStateAction } from "react";
import { MODEL_OPTIONS, SIDE_OPTIONS } from "../constants/ergonomics-options";
import type { CalibrationSettings, ModelVariant } from "../types/ergonomics.types";

export interface CalibrationPanelProps {
  calibration: CalibrationSettings;
  onCalibrationChange: Dispatch<SetStateAction<CalibrationSettings>>;
  onModelVariantChange: (variant: ModelVariant) => void;
}

export function CalibrationPanel({
  calibration,
  onCalibrationChange,
  onModelVariantChange,
}: CalibrationPanelProps) {
  return (
    <div className="panel-stack">
      <div className="panel-group">
        <Field>
          <FieldLabel>Modelo MoveNet</FieldLabel>
          <Select
            items={MODEL_OPTIONS}
            value={calibration.modelVariant}
            onValueChange={(next) => {
              if (next === "lightning" || next === "thunder") {
                onModelVariantChange(next);
              }
            }}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MODEL_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                  <SelectItemIndicator />
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldDescription>
            Lightning prioriza fluidez en tiempo real; Thunder mejora la precisión anatómica.
          </FieldDescription>
        </Field>

        <Field>
          <FieldLabel>Perfil analizado</FieldLabel>
          <Select
            items={SIDE_OPTIONS}
            value={calibration.side}
            onValueChange={(next) => {
              if (next === "auto" || next === "left" || next === "right") {
                onCalibrationChange((prev) => ({ ...prev, side: next }));
              }
            }}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SIDE_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                  <SelectItemIndicator />
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field>
          <Slider
            min={20}
            max={90}
            step={5}
            value={Math.round(calibration.minConfidence * 100)}
            onValueChange={(next) => {
              onCalibrationChange((prev) => ({
                ...prev,
                minConfidence: next / 100,
              }));
            }}
            format={(v) => `${v}%`}
          >
            <div className="slider-header">
              <FieldLabel>Confianza mínima</FieldLabel>
              <SliderValue />
            </div>
            <SliderControl>
              <SliderTrack>
                <SliderIndicator />
                <SliderThumb />
              </SliderTrack>
            </SliderControl>
          </Slider>
        </Field>

        <Field>
          <Slider
            min={8}
            max={30}
            step={1}
            value={calibration.neckThresholdDeg}
            onValueChange={(next) => {
              onCalibrationChange((prev) => ({
                ...prev,
                neckThresholdDeg: next,
              }));
            }}
            format={(v) => `${v}°`}
          >
            <div className="slider-header">
              <FieldLabel>Umbral de inclinación cervical</FieldLabel>
              <SliderValue />
            </div>
            <SliderControl>
              <SliderTrack>
                <SliderIndicator />
                <SliderThumb />
              </SliderTrack>
            </SliderControl>
          </Slider>
        </Field>
      </div>

      <div className="panel-group">
        <Field data-layout="switch-row">
          <div className="field-copy">
            <FieldLabel>Mostrar esqueleto y ángulos</FieldLabel>
            <FieldDescription>
              Dibuja los segmentos anatómicos sobre la imagen analizada.
            </FieldDescription>
          </div>
          <Switch
            checked={calibration.showOverlay}
            onCheckedChange={(checked) => {
              onCalibrationChange((prev) => ({
                ...prev,
                showOverlay: checked,
              }));
            }}
          >
            <SwitchThumb />
          </Switch>
        </Field>

        <Field data-layout="switch-row">
          <div className="field-copy">
            <FieldLabel>Modo espejo de cámara</FieldLabel>
            <FieldDescription>
              Invierte horizontalmente la vista previa de la cámara web.
            </FieldDescription>
          </div>
          <Switch
            checked={calibration.mirrorCamera}
            onCheckedChange={(checked) => {
              onCalibrationChange((prev) => ({
                ...prev,
                mirrorCamera: checked,
              }));
            }}
          >
            <SwitchThumb />
          </Switch>
        </Field>
      </div>
    </div>
  );
}
