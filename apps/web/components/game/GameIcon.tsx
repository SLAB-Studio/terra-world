type GameIconProps = {
  readonly name:
    | "home"
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
    | "layers";
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
    </svg>
  );
}
