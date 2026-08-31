"use client";

import { forwardRef } from "react";
import { GameIcon } from "./GameIcon";
import styles from "./LeoSpeechBubble.module.css";

type LeoSpeechBubbleProps = Readonly<{
  text: string;
  timeOfDay: "day" | "night";
  onDismiss: () => void;
}>;

/** Positioned above Leo by the existing world projection, never a modal. */
const LeoSpeechBubble = forwardRef<HTMLDivElement, LeoSpeechBubbleProps>(
  function LeoSpeechBubble({ text, timeOfDay, onDismiss }, ref) {
    return (
      <div
        className={`leo-world-bubble ${styles.root}`}
        ref={ref}
        data-time-of-day={timeOfDay}
      >
        <div className={styles.surface}>
          <div className={styles.heading}>
            <span className={styles.identity}>
              <span className={styles.mark} aria-hidden="true">
                <GameIcon name="paw" size={18} />
              </span>
              <strong>Leo</strong>
            </span>
            <button
              type="button"
              className={styles.dismiss}
              aria-label="Dismiss Leo's speech bubble"
              title="Dismiss Leo's speech bubble"
              onClick={onDismiss}
            >
              <GameIcon name="close" size={18} />
            </button>
          </div>
          <p
            className={styles.message}
            role="status"
            aria-live="polite"
            aria-atomic="true"
          >
            {text}
          </p>
        </div>
      </div>
    );
  },
);

export default LeoSpeechBubble;
