"use client";

import { useEffect, useReducer, useRef } from "react";
import styles from "./SyncCityControl.module.css";

export type CitySyncOutcome = Readonly<{
  root: string;
  status: "demo" | "stored" | "anchoring" | "synced";
}>;

export type CitySyncPhase =
  | "pending"
  | "syncing"
  | "demo"
  | "stored"
  | "anchoring"
  | "synced"
  | "offline-queued"
  | "retry";

export type CitySyncSnapshot = Readonly<{
  phase: CitySyncPhase;
  revision: string;
  requestedRevision: string | null;
  root: string | null;
}>;

export type CitySyncAction =
  | Readonly<{ type: "revision"; revision: string }>
  | Readonly<{ type: "start"; revision: string }>
  | Readonly<{ type: "offline"; revision: string }>
  | Readonly<{ type: "online" }>
  | Readonly<{
      type: "complete";
      outcome: CitySyncOutcome;
      requestedRevision: string;
    }>
  | Readonly<{ type: "fail"; requestedRevision: string }>;

const PHASE_COPY: Readonly<
  Record<CitySyncPhase, Readonly<{ label: string; detail: string }>>
> = {
  pending: { label: "Sync City", detail: "Changes waiting" },
  syncing: { label: "Syncing…", detail: "Keeping your city safe" },
  demo: {
    label: "Demo save ready",
    detail: "Local preview — not stored on 0G",
  },
  stored: { label: "Stored on 0G", detail: "Latest city checkpoint is safe" },
  anchoring: { label: "Anchoring…", detail: "Confirming your city save" },
  synced: { label: "All synced", detail: "Stored on 0G" },
  "offline-queued": {
    label: "Queued offline",
    detail: "City is safe on this device",
  },
  retry: { label: "Retry sync", detail: "Ready to try again" },
};

export function initialCitySyncSnapshot(revision: string): CitySyncSnapshot {
  return {
    phase: "pending",
    revision,
    requestedRevision: null,
    root: null,
  };
}

export function reduceCitySync(
  snapshot: CitySyncSnapshot,
  action: CitySyncAction,
): CitySyncSnapshot {
  switch (action.type) {
    case "revision":
      if (action.revision === snapshot.revision) return snapshot;
      if (snapshot.phase === "syncing") {
        return { ...snapshot, revision: action.revision };
      }
      return initialCitySyncSnapshot(action.revision);
    case "start":
      if (
        snapshot.phase === "syncing" ||
        snapshot.phase === "anchoring" ||
        ((snapshot.phase === "stored" || snapshot.phase === "synced") &&
          snapshot.revision === action.revision)
      ) {
        return snapshot;
      }
      return {
        phase: "syncing",
        revision: action.revision,
        requestedRevision: action.revision,
        root: null,
      };
    case "offline":
      return {
        phase: "offline-queued",
        revision: action.revision,
        requestedRevision: action.revision,
        root: null,
      };
    case "online":
      return snapshot.phase === "offline-queued"
        ? { ...snapshot, phase: "retry" }
        : snapshot;
    case "complete":
      if (snapshot.revision !== action.requestedRevision) {
        return initialCitySyncSnapshot(snapshot.revision);
      }
      return {
        phase: action.outcome.status,
        revision: snapshot.revision,
        requestedRevision: action.requestedRevision,
        root: action.outcome.root,
      };
    case "fail":
      if (snapshot.revision !== action.requestedRevision) {
        return initialCitySyncSnapshot(snapshot.revision);
      }
      return { ...snapshot, phase: "retry", root: null };
  }
}

export function citySyncCopy(phase: CitySyncPhase) {
  return PHASE_COPY[phase];
}

export default function SyncCityControl({
  revision,
  onSync,
  onStatusChange,
}: Readonly<{
  revision: string;
  onSync: (revision: string) => Promise<CitySyncOutcome>;
  onStatusChange?: (snapshot: CitySyncSnapshot) => void;
}>) {
  const [snapshot, dispatch] = useReducer(
    reduceCitySync,
    revision,
    initialCitySyncSnapshot,
  );
  const inFlightRef = useRef<Promise<void> | null>(null);
  const copy = citySyncCopy(snapshot.phase);
  const isBusy = snapshot.phase === "syncing" || snapshot.phase === "anchoring";
  const isSettled =
    snapshot.phase === "demo" ||
    snapshot.phase === "stored" ||
    snapshot.phase === "synced";
  const isUnavailable =
    isBusy || isSettled || snapshot.phase === "offline-queued";

  useEffect(() => {
    dispatch({ type: "revision", revision });
  }, [revision]);

  useEffect(() => {
    onStatusChange?.(snapshot);
  }, [onStatusChange, snapshot]);

  useEffect(() => {
    function handleOnline() {
      dispatch({ type: "online" });
    }
    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, []);

  function requestSync() {
    if (isUnavailable || inFlightRef.current !== null) return;
    if (!navigator.onLine) {
      dispatch({ type: "offline", revision });
      return;
    }

    const requestedRevision = revision;
    dispatch({ type: "start", revision: requestedRevision });
    const request = onSync(requestedRevision)
      .then((outcome) => {
        dispatch({ type: "complete", outcome, requestedRevision });
      })
      .catch(() => {
        dispatch({ type: "fail", requestedRevision });
      })
      .finally(() => {
        if (inFlightRef.current === request) inFlightRef.current = null;
      });
    inFlightRef.current = request;
  }

  return (
    <>
      <button
        aria-busy={isBusy || undefined}
        aria-disabled={isUnavailable || undefined}
        aria-label={`${copy.label}. ${copy.detail}.`}
        className={styles.control}
        data-phase={snapshot.phase}
        onClick={requestSync}
        type="button"
      >
        <span className={styles.marker} aria-hidden="true" />
        <span className={styles.copy}>
          <strong>{copy.label}</strong>
          <span>{copy.detail}</span>
        </span>
      </button>
      <span className={styles.liveStatus} role="status" aria-live="polite">
        {copy.label}. {copy.detail}.
      </span>
    </>
  );
}
