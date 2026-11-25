import { KEYPOINT_META } from "../constants/ergonomics-options";
import type { PoseKeypoint } from "../types/ergonomics.types";

export interface KeypointsTableProps {
  keypoints: readonly PoseKeypoint[];
  minConfidence: number;
}

export function KeypointsTable({ keypoints, minConfidence }: KeypointsTableProps) {
  const byIndex = new Map<number, PoseKeypoint>();
  for (const kp of keypoints) {
    byIndex.set(kp.index, kp);
  }

  return (
    <div className="panel-stack">
      <div className="table-scroll">
        <table
          className="keypoints-table"
          aria-label="Coordenadas de los 17 puntos anatómicos MoveNet"
        >
          <thead>
            <tr>
              <th scope="col">Punto anatómico</th>
              <th scope="col" className="num">
                X
              </th>
              <th scope="col" className="num">
                Y
              </th>
              <th scope="col" className="num">
                Confianza
              </th>
            </tr>
          </thead>
          <tbody>
            {KEYPOINT_META.map((meta) => {
              const point = byIndex.get(meta.index);
              const hasCoords =
                point !== undefined && Number.isFinite(point.x) && Number.isFinite(point.y);
              const isVisible = point !== undefined && hasCoords && point.score >= minConfidence;

              return (
                <tr key={meta.name} data-visible={isVisible ? "true" : "false"}>
                  <td>{meta.labelEs}</td>
                  <td className="num">{hasCoords ? Math.round(point.x) : "\u2013"}</td>
                  <td className="num">{hasCoords ? Math.round(point.y) : "\u2013"}</td>
                  <td className="num">{point ? `${Math.round(point.score * 100)}%` : "\u2013"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="privacy-note">
        Privacidad local garantizada: la inferencia de los 17 puntos anatómicos ocurre
        exclusivamente en su navegador sin almacenar ni enviar imágenes.
      </p>
    </div>
  );
}
