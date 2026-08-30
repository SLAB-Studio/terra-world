type GameIconProps = {
  readonly name:
    | "home"
    | "sun"
    | "moon"
    | "road"
    | "water"
    | "energy"
    | "school"
    | "clinic"
    | "bus"
    | "recycle"
    | "nature"
    | "rotate"
    | "undo"
    | "remove"
    | "play"
    | "layers"
    | "spark"
    | "arrow"
    | "shield"
    | "close"
    | "volume"
    | "contrast"
    | "text"
    | "rain"
    | "compost"
    | "tree"
    | "bike"
    | "warm"
    | "bird"
    | "first-aid"
    | "tools";
  readonly size?: number;
};

export function GameIcon({ name, size = 22 }: GameIconProps) {
  const common = {
    fill: "none",
    stroke: "currentColor",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    strokeWidth: 1.8,
  };
  return (
    <svg
      aria-hidden="true"
      height={size}
      viewBox="0 0 24 24"
      width={size}
      {...common}
    >
      {name === "home" && (
        <>
          <path d="m3 11 9-7 9 7" />
          <path d="M5 10v10h14V10M9 20v-6h6v6" />
        </>
      )}
      {name === "sun" && (
        <>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" />
        </>
      )}
      {name === "moon" && (
        <path d="M20.5 14A8.8 8.8 0 0 1 10 3.5 8.8 8.8 0 1 0 20.5 14Z" />
      )}
      {name === "road" && (
        <>
          <path d="M8 3 6 21M16 3l2 18M12 4v3m0 3v4m0 3v3" />
        </>
      )}
      {name === "water" && (
        <>
          <path d="M12 3S6.5 9.4 6.5 14a5.5 5.5 0 0 0 11 0C17.5 9.4 12 3 12 3Z" />
          <path d="M9.5 15.5c.7 1.3 1.6 1.8 3 1.8" />
        </>
      )}
      {name === "energy" && <path d="m13.5 2-7 12h5l-1 8 7-12h-5l1-8Z" />}
      {name === "school" && (
        <>
          <path d="m3 9 9-5 9 5-9 5-9-5Z" />
          <path d="M7 12v5c3 2 7 2 10 0v-5M21 9v7" />
        </>
      )}
      {name === "clinic" && (
        <>
          <path d="M8 3h8v5h5v8h-5v5H8v-5H3V8h5V3Z" />
        </>
      )}
      {name === "bus" && (
        <>
          <rect height="14" rx="2" width="16" x="4" y="4" />
          <path d="M7 8h10M7 15h10M8 18v2m8-2v2" />
        </>
      )}
      {name === "recycle" && (
        <>
          <path d="m9 4 3-2 3 5M7 8l2-4M5 10l-3 5 5 1M7 20l-2-4M17 19H7m10 0 3-5-4-3" />
        </>
      )}
      {name === "nature" && (
        <>
          <path d="M12 21V9" />
          <path d="M12 14C5 14 4 8 4 4c6 0 10 3 8 10ZM12 17c6 0 8-4 8-8-5 0-8 2-8 8Z" />
        </>
      )}
      {name === "rotate" && (
        <>
          <path d="M20 7v5h-5" />
          <path d="M18.5 15A8 8 0 1 1 20 9l-3-3" />
        </>
      )}
      {name === "undo" && (
        <>
          <path d="m9 8-5 4 5 4" />
          <path d="M5 12h8a6 6 0 0 1 6 6" />
        </>
      )}
      {name === "remove" && (
        <>
          <path d="M4 7h16M9 7V4h6v3m3 0-1 14H7L6 7m4 4v6m4-6v6" />
        </>
      )}
      {name === "play" && <path d="m8 5 11 7-11 7V5Z" />}
      {name === "layers" && (
        <>
          <path d="m12 2 9 5-9 5-9-5 9-5Z" />
          <path d="m3 12 9 5 9-5M3 17l9 5 9-5" />
        </>
      )}
      {name === "spark" && (
        <>
          <path d="M12 2c.7 4.1 2.9 6.3 7 7-4.1.7-6.3 2.9-7 7-.7-4.1-2.9-6.3-7-7 4.1-.7 6.3-2.9 7-7Z" />
          <path d="M19 16c.3 1.7 1.3 2.7 3 3-1.7.3-2.7 1.3-3 3-.3-1.7-1.3-2.7-3-3 1.7-.3 2.7-1.3 3-3Z" />
        </>
      )}
      {name === "arrow" && <path d="M5 12h14m-5-5 5 5-5 5" />}
      {name === "shield" && (
        <>
          <path d="M12 3 5 6v5c0 4.6 2.8 8.2 7 10 4.2-1.8 7-5.4 7-10V6l-7-3Z" />
          <path d="m9 12 2 2 4-5" />
        </>
      )}
      {name === "close" && <path d="m6 6 12 12M18 6 6 18" />}
      {name === "volume" && (
        <>
          <path d="M5 10v4h3l4 4V6L8 10H5Z" />
          <path d="M16 9c1.5 1.5 1.5 4.5 0 6M19 6c3.5 3.5 3.5 8.5 0 12" />
        </>
      )}
      {name === "contrast" && (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 3v18M12 7a5 5 0 0 1 0 10" />
        </>
      )}
      {name === "text" && (
        <>
          <path d="M4 5h11M9.5 5v14M6 19h7M15 10h5m-2.5 0v9M15 19h5" />
        </>
      )}
      {name === "rain" && (
        <>
          <path d="M7 15h10a4 4 0 0 0 .5-8A5.5 5.5 0 0 0 7 8.5 3.3 3.3 0 0 0 7 15Z" />
          <path d="m8 18-1 2m5-2-1 2m5-2-1 2" />
        </>
      )}
      {name === "compost" && (
        <>
          <path d="M5 8h14l-1 13H6L5 8Zm-1-3h16M9 5V3h6v2" />
          <path d="M12 17v-5m0 3c-3 0-4-2-4-4 3 0 5 1 4 4Zm0 2c3 0 4-2 4-4-3 0-4 1-4 4Z" />
        </>
      )}
      {name === "tree" && (
        <>
          <path d="M12 13v8m-3 0h6" />
          <path d="M7.5 13.5A4 4 0 0 1 8 6a4.5 4.5 0 0 1 8.5 2A3.5 3.5 0 0 1 16 15H8.5a3 3 0 0 1-1-1.5Z" />
        </>
      )}
      {name === "bike" && (
        <>
          <circle cx="6" cy="17" r="3.5" />
          <circle cx="18" cy="17" r="3.5" />
          <path d="m6 17 4-7 3 7H6Zm4-7h5l3 7m-8-7-1.5-3H6m8 0h3" />
        </>
      )}
      {name === "warm" && (
        <>
          <path d="m4 11 8-7 8 7v9H4v-9Z" />
          <path d="M8 16c1-1 1-2 0-3m4 3c1-1 1-2 0-3m4 3c1-1 1-2 0-3" />
        </>
      )}
      {name === "bird" && (
        <>
          <path d="M4 15c4-1 5-5 8-7 1 3 3 4 7 4-2 5-7 7-12 6" />
          <path d="M12 8c-3-2-6-1-8 2 3 0 5 1 7 3m8-1 2-1" />
        </>
      )}
      {name === "first-aid" && (
        <>
          <rect height="15" rx="2" width="18" x="3" y="6" />
          <path d="M9 6V3h6v3m-3 4v7m-3.5-3.5h7" />
        </>
      )}
      {name === "tools" && (
        <>
          <path d="M14 6a4 4 0 0 0-5-4l2.4 2.4-3 3L6 5a4 4 0 0 0 4 5L20 20l2-2-10-10" />
          <path d="m8 13-6 6 3 3 6-6" />
        </>
      )}
    </svg>
  );
}
