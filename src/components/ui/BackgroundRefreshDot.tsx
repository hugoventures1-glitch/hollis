"use client";

/**
 * BackgroundRefreshDot — a barely-visible teal pulse in the corner of the
 * viewport that appears while the Hollis store is doing a background refresh.
 * Renders nothing when not refreshing.
 */

interface Props {
  visible: boolean;
}

export function BackgroundRefreshDot({ visible }: Props) {
  if (!visible) return null;
  return (
    <div
      aria-hidden
      style={{
        position: "fixed",
        top: 10,
        right: 10,
        zIndex: 9999,
        width: 5,
        height: 5,
        borderRadius: "50%",
        background: "rgba(250,250,250,0.3)",
        opacity: 0.45,
        animation: "hollis-pulse 1.2s ease-in-out infinite",
        pointerEvents: "none",
      }}
    />
  );
}
