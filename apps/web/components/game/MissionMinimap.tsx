"use client";

import { memo, useEffect, useId, useMemo, useState } from "react";
import {
  MISSION_MAP_RIVER_WIDTH,
  MISSION_MAP_ROAD_WIDTH,
  mapBearing,
  mapCardinalDirection,
  mapDistance,
  mapHeadingDegrees,
  mapProjectionScale,
  projectMapPoint,
  type MapPoint,
  type MissionMapGeometry,
  type MissionMapPose,
  type MissionMapTarget,
} from "../../lib/immersive-town/mission-minimap";
import styles from "./MissionMinimap.module.css";

export type MissionMinimapProps = {
  geometry: MissionMapGeometry;
  pose: MissionMapPose | null;
  /** A stable runtime reader avoids rerendering the entire city on movement. */
  readPose?: () => MissionMapPose | null;
  /** Keep mounted while obscured, but suspend runtime reads. */
  active?: boolean;
  target: MissionMapTarget | null;
  mode: "town" | "walk" | "indoors";
  status?: string;
  timeOfDay: "day" | "night";
  closedCrossing?: MapPoint | null;
  initiallyCollapsed?: boolean;
};

const MAP_WIDTH = 220;
const MAP_HEIGHT = 188;
const MAP_PADDING = 19;

function validPose(pose: MissionMapPose | null): MissionMapPose | null {
  return pose && Number.isFinite(pose.x) && Number.isFinite(pose.z)
    ? { ...pose, yaw: Number.isFinite(pose.yaw) ? pose.yaw : 0 }
    : null;
}

function useMapPose(
  pose: MissionMapPose | null,
  readPose: MissionMinimapProps["readPose"],
  mode: MissionMinimapProps["mode"],
  active: boolean,
) {
  const [livePose, setLivePose] = useState(() =>
    validPose(readPose ? readPose() : pose),
  );
  useEffect(() => {
    if (!readPose || !active) return;
    const update = () => {
      if (document.hidden) return;
      const next = validPose(readPose());
      setLivePose((previous) => {
        if (!next || !previous) return next === previous ? previous : next;
        const turn = Math.abs(
          Math.atan2(
            Math.sin(next.yaw - previous.yaw),
            Math.cos(next.yaw - previous.yaw),
          ),
        );
        return Math.hypot(next.x - previous.x, next.z - previous.z) < 0.04 &&
          turn < 0.01
          ? previous
          : { ...next };
      });
    };
    update();
    const timer = window.setInterval(update, 180);
    return () => window.clearInterval(timer);
  }, [readPose, mode, active]);
  return readPose ? livePose : validPose(pose);
}

const CityGeometry = memo(function CityGeometry({
  geometry,
}: {
  geometry: MissionMapGeometry;
}) {
  const map = useMemo(() => {
    const project = (point: MapPoint) =>
      projectMapPoint(
        point,
        geometry.bounds,
        MAP_WIDTH,
        MAP_HEIGHT,
        MAP_PADDING,
        false,
      );
    const points = (line: readonly MapPoint[]) =>
      line
        .map((point) => {
          const { x, y } = project(point);
          return `${x},${y}`;
        })
        .join(" ");
    return {
      road: points(geometry.road),
      river: points(geometry.river),
      scale: mapProjectionScale(
        geometry.bounds,
        MAP_WIDTH,
        MAP_HEIGHT,
        MAP_PADDING,
      ),
      buildings: geometry.buildings.map((building) => ({
        ...building,
        center: project(building.position),
      })),
    };
  }, [geometry]);

  return (
    <g aria-hidden="true">
      <polyline
        className={styles.river}
        points={map.river}
        strokeWidth={MISSION_MAP_RIVER_WIDTH * map.scale}
      />
      <polyline
        className={styles.roadEdge}
        points={map.road}
        strokeWidth={MISSION_MAP_ROAD_WIDTH * map.scale + 1.6}
      />
      <polyline
        className={styles.road}
        points={map.road}
        strokeWidth={MISSION_MAP_ROAD_WIDTH * map.scale}
      />
      {map.buildings.map(({ id, center, width, depth, rotation }) => (
        <rect
          key={id}
          className={styles.building}
          x={center.x - (width * map.scale) / 2}
          y={center.y - (depth * map.scale) / 2}
          width={width * map.scale}
          height={depth * map.scale}
          transform={`rotate(${mapHeadingDegrees(rotation ?? 0)} ${center.x} ${center.y})`}
          rx="0.7"
        />
      ))}
    </g>
  );
});

function HeadingArrow({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" aria-hidden="true">
      <path d="M10 2 17 17 10 13 3 17Z" fill="currentColor" />
    </svg>
  );
}

/** A north-up street map: an honest bearing, never an invented walking route. */
export default function MissionMinimap({
  geometry,
  pose,
  readPose,
  active = true,
  target,
  mode,
  status,
  timeOfDay,
  closedCrossing,
  initiallyCollapsed = false,
}: MissionMinimapProps) {
  const [collapsed, setCollapsed] = useState(initiallyCollapsed);
  const contentId = useId();
  const titleId = useId();
  const descriptionId = useId();
  const currentPose = useMapPose(pose, readPose, mode, active);
  const project = (point: MapPoint) =>
    projectMapPoint(point, geometry.bounds, MAP_WIDTH, MAP_HEIGHT, MAP_PADDING);
  const playerPoint = currentPose ? project(currentPose) : null;
  const targetPoint = target ? project(target.position) : null;
  const crossingPoint = closedCrossing ? project(closedCrossing) : null;
  const distance =
    currentPose && target ? mapDistance(currentPose, target.position) : null;
  const nearby =
    distance !== null && target !== null && distance <= target.radius;
  const bearing =
    currentPose && target ? mapBearing(currentPose, target.position) : null;
  const direction = bearing === null ? null : mapCardinalDirection(bearing);
  const distanceLabel =
    mode === "indoors"
      ? "Street map"
      : nearby
        ? "Nearby"
        : distance === null
          ? ""
          : `${Math.max(1, Math.round(distance))} m away`;
  const instruction =
    mode === "indoors"
      ? status || "Exit building to continue."
      : target?.instruction || status || "Review your notebook.";
  const playerLabel =
    mode === "indoors"
      ? "Entrance"
      : mode === "town"
        ? "Street position"
        : "You";

  return (
    <section
      className={styles.root}
      aria-label="Mission navigation"
      data-collapsed={collapsed}
      data-time-of-day={timeOfDay}
      data-mode={mode}
    >
      <button
        className={styles.toggle}
        type="button"
        aria-label={collapsed ? "Expand mission map" : "Collapse mission map"}
        aria-expanded={!collapsed}
        aria-controls={contentId}
        onClick={() => setCollapsed((value) => !value)}
      >
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <path d="m2 5 5-2 6 2 5-2v12l-5 2-6-2-5 2Zm5-2v12m6-10v12" />
        </svg>
        <span>Mission map</span>
        <svg className={styles.chevron} viewBox="0 0 20 20" aria-hidden="true">
          <path d={collapsed ? "m6 8 4 4 4-4" : "m6 12 4-4 4 4"} />
        </svg>
      </button>

      <div id={contentId} hidden={collapsed}>
        {!collapsed && (
          <>
            <svg
              className={styles.map}
              viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
              role="img"
              aria-labelledby={`${titleId} ${descriptionId}`}
            >
              <title id={titleId}>Rivergate mission map</title>
              <desc id={descriptionId}>
                North is up.
                {currentPose
                  ? ` The arrow shows your ${mode === "indoors" ? "building entrance" : "street position"}.`
                  : " Player position is not available yet."}
                {target
                  ? ` The amber pin marks ${target.label}.`
                  : " No mission destination selected."}
                {closedCrossing
                  ? " East Bridge is closed; use the south crossing."
                  : ""}
              </desc>
              <CityGeometry geometry={geometry} />
              <g
                className={styles.north}
                transform="translate(12 13)"
                aria-hidden="true"
              >
                <path d="M0 11 3 4 6 11" />
                <text x="3" y="-1">
                  N
                </text>
              </g>
              {crossingPoint && (
                <g
                  className={styles.closure}
                  transform={`translate(${crossingPoint.x} ${crossingPoint.y})`}
                >
                  <title>East Bridge closed — use the south crossing</title>
                  <circle r="6" />
                  <path d="m-2.5-2.5 5 5m0-5-5 5" />
                </g>
              )}
              {targetPoint && target && (
                <g
                  className={styles.target}
                  transform={`translate(${targetPoint.x} ${targetPoint.y})`}
                  data-map-marker="mission"
                >
                  <title>{`Next mission: ${target.label}`}</title>
                  <circle className={styles.targetRing} r="11" />
                  <path d="M0 0C-2-3-7-7-7-12a7 7 0 0 1 14 0C7-7 2-3 0 0Z" />
                  <circle className={styles.targetCenter} cy="-12" r="2" />
                </g>
              )}
              {playerPoint && currentPose && (
                <g
                  className={styles.player}
                  transform={`translate(${playerPoint.x} ${playerPoint.y}) rotate(${mapHeadingDegrees(currentPose.yaw)})`}
                  data-map-marker="player"
                >
                  <title>{`${playerLabel}, facing ${mapCardinalDirection(currentPose.yaw)}`}</title>
                  <circle r="9" />
                  <path d="M0-7 5.5 5 0 2.5-5.5 5Z" />
                </g>
              )}
            </svg>
            <div className={styles.legend}>
              <span>
                <HeadingArrow />
                {playerLabel}
              </span>
              <span>North up</span>
            </div>
          </>
        )}
      </div>

      <div className={styles.destination}>
        {target ? (
          <>
            <div className={styles.targetName}>
              <svg viewBox="0 0 16 20" aria-hidden="true">
                <path d="M8 18S2 11 2 7a6 6 0 0 1 12 0c0 4-6 11-6 11Z" />
                <circle cx="8" cy="7" r="2" />
              </svg>
              <strong>
                <span className={styles.srOnly}>Next mission: </span>
                {target.label}
              </strong>
            </div>
            {distanceLabel && (
              <div className={styles.distance}>
                <span
                  title={
                    nearby
                      ? undefined
                      : "Straight-line distance, not a walking route"
                  }
                >
                  {distanceLabel}
                </span>
                {!nearby && direction && mode !== "indoors" && (
                  <span
                    className={styles.bearing}
                    title="Direction to mission, not a walking route"
                  >
                    <span
                      style={{
                        transform: `rotate(${mapHeadingDegrees(bearing ?? 0)}deg)`,
                      }}
                    >
                      <HeadingArrow />
                    </span>
                    <span className={styles.srOnly}>Direction </span>
                    {direction}
                  </span>
                )}
              </div>
            )}
          </>
        ) : (
          <strong className={styles.noTarget}>No pinned mission</strong>
        )}
        {!collapsed && <p className={styles.instruction}>{instruction}</p>}
      </div>
    </section>
  );
}
