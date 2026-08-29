"use client";

import { useEffect, useMemo, useRef } from "react";

import { GameIcon } from "./GameIcon";
import styles from "./HouseDiagnostics.module.css";

export type HouseId = "sunny" | "bluebell" | "mango";
export type HouseUpgradeId = "light" | "water" | "garden" | "recycle";
export type HouseDiagnosticId = "power" | "water" | "garden" | "clean-yard";
export type HouseDiagnosticStatus = "healthy" | "needs-fixing";

export type HouseProfile = Readonly<{
  id: HouseId;
  homeName: string;
  ownerName: string;
  gardenName: string;
  hello: string;
  defaultUpgrades: readonly HouseUpgradeId[];
  recommendedOrder: readonly HouseUpgradeId[];
}>;

export type HouseDiagnostic = Readonly<{
  id: HouseDiagnosticId;
  label: string;
  status: HouseDiagnosticStatus;
  message: string;
  fixUpgrade: HouseUpgradeId;
}>;

export type HouseHealth = Readonly<{
  diagnostics: readonly HouseDiagnostic[];
  healthyCount: number;
  totalCount: number;
  allHealthy: boolean;
  recommendedUpgrade: HouseUpgradeId | null;
}>;

export type HouseDiagnosticsProps = Readonly<{
  open: boolean;
  houseId: HouseId;
  /** When omitted, the selected profile's example starting upgrades are used. */
  upgrades?: readonly HouseUpgradeId[];
  onClose: () => void;
  onChooseUpgrade: (houseId: HouseId, upgradeId: HouseUpgradeId) => void;
}>;

export const HOUSE_PROFILES: Readonly<Record<HouseId, HouseProfile>> = {
  sunny: {
    id: "sunny",
    homeName: "Sunny House",
    ownerName: "Ayo",
    gardenName: "flower garden",
    hello:
      "Our rooms are bright and the flowers are growing. Could you help clean water reach our home next?",
    defaultUpgrades: ["light", "garden"],
    recommendedOrder: ["water", "recycle", "light", "garden"],
  },
  bluebell: {
    id: "bluebell",
    homeName: "Bluebell House",
    ownerName: "Mina",
    gardenName: "vegetable garden",
    hello:
      "We save water and keep the yard tidy. Could you help us make clean power for the lights?",
    defaultUpgrades: ["water", "recycle"],
    recommendedOrder: ["light", "garden", "water", "recycle"],
  },
  mango: {
    id: "mango",
    homeName: "Mango House",
    ownerName: "Tomi",
    gardenName: "fruit garden",
    hello:
      "Our home is nearly humming happily. One sorting bin would help us keep the yard clean too!",
    defaultUpgrades: ["light", "water", "garden"],
    recommendedOrder: ["recycle", "water", "garden", "light"],
  },
} as const;

const UPGRADE_DETAILS: Readonly<
  Record<
    HouseUpgradeId,
    Readonly<{
      label: string;
      action: string;
      benefit: string;
      icon: Parameters<typeof GameIcon>[0]["name"];
    }>
  >
> = {
  light: {
    label: "Sun light",
    action: "Add sun light",
    benefit: "Uses sunshine to make clean power for the rooms.",
    icon: "energy",
  },
  water: {
    label: "Clean water",
    action: "Add clean water",
    benefit: "Helps water reach the taps and garden safely.",
    icon: "water",
  },
  garden: {
    label: "Home garden",
    action: "Grow a home garden",
    benefit: "Makes a green place for food, flowers, and tiny visitors.",
    icon: "nature",
  },
  recycle: {
    label: "Recycle bin",
    action: "Add a recycle bin",
    benefit: "Sorts useful things so the yard stays clean.",
    icon: "recycle",
  },
};

const DIAGNOSTIC_DETAILS: readonly Readonly<{
  id: HouseDiagnosticId;
  label: string;
  upgrade: HouseUpgradeId;
  healthyMessage: string;
  fixingMessage: string;
}>[] = [
  {
    id: "power",
    label: "Power",
    upgrade: "light",
    healthyMessage: "Clean power is ready for the lights.",
    fixingMessage: "The rooms need a clean way to make light.",
  },
  {
    id: "water",
    label: "Water",
    upgrade: "water",
    healthyMessage: "Clean water reaches the home and plants.",
    fixingMessage: "The taps and plants need clean water.",
  },
  {
    id: "garden",
    label: "Garden",
    upgrade: "garden",
    healthyMessage: "Plants have a green place to grow.",
    fixingMessage: "There is room to grow food and flowers.",
  },
  {
    id: "clean-yard",
    label: "Clean yard",
    upgrade: "recycle",
    healthyMessage: "Useful things are sorted and the yard is tidy.",
    fixingMessage: "The yard needs a place to sort useful things.",
  },
] as const;

export function getHouseHealth(
  houseId: HouseId,
  upgrades: readonly HouseUpgradeId[],
): HouseHealth {
  const installed = new Set(upgrades);
  const profile = HOUSE_PROFILES[houseId];
  const diagnostics = DIAGNOSTIC_DETAILS.map<HouseDiagnostic>((item) => {
    const healthy = installed.has(item.upgrade);
    return {
      id: item.id,
      label: item.label,
      status: healthy ? "healthy" : "needs-fixing",
      message: healthy ? item.healthyMessage : item.fixingMessage,
      fixUpgrade: item.upgrade,
    };
  });
  const healthyCount = diagnostics.filter(
    (item) => item.status === "healthy",
  ).length;
  const recommendedUpgrade =
    profile.recommendedOrder.find((upgrade) => !installed.has(upgrade)) ?? null;

  return {
    diagnostics,
    healthyCount,
    totalCount: diagnostics.length,
    allHealthy: healthyCount === diagnostics.length,
    recommendedUpgrade,
  };
}

export default function HouseDiagnostics({
  open,
  houseId,
  upgrades,
  onClose,
  onChooseUpgrade,
}: HouseDiagnosticsProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const profile = HOUSE_PROFILES[houseId];
  const activeUpgrades = upgrades ?? profile.defaultUpgrades;
  const health = useMemo(
    () => getHouseHealth(houseId, activeUpgrades),
    [activeUpgrades, houseId],
  );
  const missingUpgrades = health.diagnostics
    .filter((item) => item.status === "needs-fixing")
    .map((item) => item.fixUpgrade);
  const recommended =
    health.recommendedUpgrade === null
      ? null
      : UPGRADE_DETAILS[health.recommendedUpgrade];
  const ownerMessage = health.allHealthy
    ? "Everything feels happy and healthy now. Thank you for caring for our home!"
    : `Could you help us with ${recommended?.label.toLowerCase() ?? "one small fix"} next?`;
  const titleId = `house-diagnostics-title-${houseId}`;
  const descriptionId = `house-diagnostics-description-${houseId}`;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) return;

    if (open && !dialog.open) {
      dialog.showModal();
      closeButtonRef.current?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  return (
    <dialog
      aria-describedby={descriptionId}
      aria-labelledby={titleId}
      className={styles.dialog}
      data-house={houseId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      ref={dialogRef}
    >
      <div className={styles.sheet}>
        <header className={styles.header}>
          <div className={styles.homeMark} aria-hidden="true">
            <GameIcon name="home" size={34} />
          </div>
          <div className={styles.headingCopy}>
            <h2 id={titleId}>
              {profile.ownerName}&apos;s {profile.homeName}
            </h2>
            <p id={descriptionId}>
              A friendly home check-up: see what feels good and what could use a
              hand.
            </p>
          </div>
          <button
            aria-label={`Close ${profile.homeName} check-up`}
            className={styles.closeButton}
            onClick={onClose}
            ref={closeButtonRef}
            type="button"
          >
            <GameIcon name="close" size={25} />
          </button>
        </header>

        <div className={styles.content}>
          <aside className={styles.ownerPanel} aria-label="Message from home">
            <div className={styles.ownerRow}>
              <span className={styles.ownerAvatar} aria-hidden="true">
                {profile.ownerName.slice(0, 1)}
              </span>
              <p className={styles.ownerBubble}>
                <strong>{profile.ownerName} says:</strong>
                {ownerMessage}
              </p>
            </div>

            <div className={styles.homeSnapshot} aria-hidden="true">
              <span className={styles.snapshotSun} />
              <GameIcon name="home" size={86} />
              <span className={styles.snapshotGarden} />
            </div>
            <p className={styles.gardenLabel}>{profile.gardenName}</p>

            <div className={styles.progressBlock} aria-live="polite">
              <div className={styles.progressLabel}>
                <strong>Home check-up</strong>
                <span>
                  {health.healthyCount} of {health.totalCount} feeling good
                </span>
              </div>
              <progress
                aria-label={`${health.healthyCount} of ${health.totalCount} parts of the home feel good`}
                max={health.totalCount}
                value={health.healthyCount}
              />
            </div>
          </aside>

          <div className={styles.diagnosticsPanel}>
            <section aria-labelledby={`${titleId}-status`}>
              <div className={styles.sectionHeading}>
                <h3 id={`${titleId}-status`}>How this home is doing</h3>
                <span className={styles.statusKey}>
                  {health.allHealthy ? "Everything feels good" : "Let’s help"}
                </span>
              </div>
              <ul className={styles.diagnosticList}>
                {health.diagnostics.map((diagnostic) => {
                  const upgrade = UPGRADE_DETAILS[diagnostic.fixUpgrade];
                  const healthy = diagnostic.status === "healthy";
                  return (
                    <li
                      className={`${styles.diagnosticItem} ${
                        healthy ? styles.healthy : styles.needsFixing
                      }`}
                      key={diagnostic.id}
                    >
                      <span
                        className={styles.diagnosticIcon}
                        aria-hidden="true"
                      >
                        <GameIcon
                          name={healthy ? "shield" : upgrade.icon}
                          size={27}
                        />
                      </span>
                      <span className={styles.diagnosticCopy}>
                        <span className={styles.diagnosticTitleRow}>
                          <strong>{diagnostic.label}</strong>
                          <span>{healthy ? "Healthy" : "Needs a hand"}</span>
                        </span>
                        <span>{diagnostic.message}</span>
                        {!healthy && (
                          <small>Fix it with: {upgrade.label}</small>
                        )}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>

            <section
              aria-labelledby={`${titleId}-next`}
              className={styles.nextStep}
            >
              <div className={styles.nextStepHeading}>
                <div>
                  <h3 id={`${titleId}-next`}>
                    {health.allHealthy ? "This home is happy" : "Choose a fix"}
                  </h3>
                  <p>
                    {health.allHealthy
                      ? "Every part of this home is working well. Nice caring!"
                      : "Pick one helpful change. You can come back for the others."}
                  </p>
                </div>
                {recommended !== null && (
                  <span className={styles.recommendedNote}>
                    River&apos;s next idea: {recommended.label}
                  </span>
                )}
              </div>

              {missingUpgrades.length > 0 ? (
                <div className={styles.upgradeChoices}>
                  {missingUpgrades.map((upgradeId) => {
                    const upgrade = UPGRADE_DETAILS[upgradeId];
                    const isRecommended =
                      health.recommendedUpgrade === upgradeId;
                    return (
                      <button
                        aria-label={`${upgrade.action} at ${profile.homeName}. ${upgrade.benefit}`}
                        className={`${styles.upgradeButton} ${
                          isRecommended ? styles.recommendedUpgrade : ""
                        }`}
                        key={upgradeId}
                        onClick={() => onChooseUpgrade(houseId, upgradeId)}
                        type="button"
                      >
                        <span className={styles.upgradeIcon} aria-hidden="true">
                          <GameIcon name={upgrade.icon} size={31} />
                        </span>
                        <span className={styles.upgradeCopy}>
                          <strong>{upgrade.action}</strong>
                          <span>{upgrade.benefit}</span>
                        </span>
                        <GameIcon name="arrow" size={23} />
                      </button>
                    );
                  })}
                </div>
              ) : (
                <button
                  className={styles.doneButton}
                  onClick={onClose}
                  type="button"
                >
                  Back to the neighborhood
                  <GameIcon name="arrow" size={23} />
                </button>
              )}
            </section>
          </div>
        </div>
      </div>
    </dialog>
  );
}
