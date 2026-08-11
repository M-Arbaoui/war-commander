import { useState } from "react";

export type GameIconSize = "xs" | "sm" | "md" | "lg";

const SIZE_PX: Record<GameIconSize, number> = {
  xs: 16,
  sm: 20,
  md: 28,
  lg: 40,
};

export interface GameIconProps {
  /** Real icon URL from the WarEra API (e.g. Item.iconImg), if one exists. */
  src?: string | null;
  /** Item code / name, used for alt text and the fallback glyph. */
  code: string;
  size?: GameIconSize;
  className?: string;
}

/**
 * Renders a real game icon when the API provides one. Per the brief: "Do
 * NOT replace available game icons with plain text" — so this only ever
 * falls back to a glyph when there genuinely is no icon URL, or the image
 * fails to load, never as a stylistic choice.
 */
export function GameIcon({ src, code, size = "md", className = "" }: GameIconProps) {
  const [failed, setFailed] = useState(false);
  const px = SIZE_PX[size];
  const showFallback = !src || failed;

  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-sm border border-line bg-panel-raised ${className}`}
      style={{ width: px, height: px }}
      title={code}
    >
      {showFallback ? (
        <span
          className="font-mono uppercase text-ink-faint"
          style={{ fontSize: Math.max(8, px * 0.34) }}
          aria-hidden="true"
        >
          {code.slice(0, 2)}
        </span>
      ) : (
        <img
          src={src}
          alt={code}
          width={px}
          height={px}
          loading="lazy"
          className="h-full w-full object-contain"
          onError={() => setFailed(true)}
        />
      )}
    </span>
  );
}
