// Design tokens as JS constants — mirrors globals.css :root values.
// Use only in components that need inline style={{}} props (e.g. toast borders, chart colors).
// Prefer Tailwind CSS variables for everything else.

export const tokens = {
  bg:            "#0C0C0C",
  surface:       "#111111",
  surfaceRaised: "#161616",
  border:        "#1C1C1C",
  borderSubtle:  "#161616",
  textPrimary:   "#FAFAFA",
  textSecondary: "#555555",
  textTertiary:  "#333333",
  textInverse:   "#0C0C0C",
  accent:        "#FAFAFA",
  danger:        "#FF4444",
  warningText:   "#888888",
} as const;

export type TokenKey = keyof typeof tokens;
