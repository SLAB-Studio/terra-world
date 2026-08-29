import type { CSSProperties } from "react";

import styles from "./LivingMapDecor.module.css";

type DecorStyle = CSSProperties & Record<`--${string}`, string | number>;

const TREES = [
  [52, 360, 0.78],
  [330, 334, 0.62],
  [575, 58, 0.72],
  [644, 468, 0.88],
  [905, 340, 0.62],
  [1190, 322, 0.8],
  [1540, 70, 0.67],
  [1665, 430, 0.82],
  [80, 735, 0.7],
  [560, 770, 0.84],
  [1110, 730, 0.64],
  [1650, 750, 0.74],
] as const;

/**
 * A purely decorative, pointer-inert neighborhood layer. Mount it inside the
 * map's scrollable content surface so the 1,800px-wide scene pans with the map.
 */
export default function LivingMapDecor() {
  return (
    <div className={styles.layer} aria-hidden="true">
      <span className={`${styles.path} ${styles.pathNorth}`} />
      <span className={`${styles.path} ${styles.pathSouth}`} />
      <span className={`${styles.path} ${styles.pathCross}`} />

      {TREES.map(([x, y, scale]) => (
        <span
          className={styles.tree}
          key={`${x}-${y}`}
          style={
            { "--x": `${x}px`, "--y": `${y}px`, "--scale": scale } as DecorStyle
          }
        >
          <i />
        </span>
      ))}

      <span className={`${styles.peopleScene} ${styles.chatNorth}`}>
        <Person shirt="#ffd24a" pose="chat" />
        <span className={styles.chatMarks}>
          <i />
          <i />
          <i />
        </span>
        <Person shirt="#be8de2" pose="chat" />
      </span>

      <span className={`${styles.peopleScene} ${styles.chatSouth}`}>
        <Person shirt="#62aef0" pose="chat" />
        <span className={styles.chatMarks}>
          <i />
          <i />
        </span>
        <Person shirt="#ff8d61" pose="chat" />
      </span>

      <span className={styles.playScene}>
        <Person shirt="#ffcf45" pose="play" />
        <span className={styles.ball} />
        <Person shirt="#75cf56" pose="play" />
      </span>
    </div>
  );
}

function Person({
  shirt,
  pose,
}: Readonly<{ shirt: string; pose: "chat" | "play" | "wave" }>) {
  return (
    <span
      className={`${styles.person} ${
        pose === "play"
          ? styles.personPlay
          : pose === "wave"
            ? styles.personWave
            : ""
      }`}
      style={{ "--shirt": shirt } as DecorStyle}
    >
      <i className={styles.head} />
      <i className={styles.body} />
      <i className={styles.armLeft} />
      <i className={styles.armRight} />
      <i className={styles.legLeft} />
      <i className={styles.legRight} />
    </span>
  );
}
