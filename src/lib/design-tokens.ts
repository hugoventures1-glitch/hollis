// Design tokens as JS constants — mirrors globals.css :root values.
// Use only in components that need inline style={{}} props (e.g. toast borders, chart colors).
// Prefer Tailwind CSS variables for everything else.

export const tokens = {
  bg:            "var(--background)",
  surface:       "var(--surface)",
  surfaceRaised: "var(--surface-raised)",
  border:        "var(--border)",
  borderSubtle:  "var(--border-subtle)",
  textPrimary:   "var(--text-primary)",
  textSecondary: "var(--text-secondary)",
  textTertiary:  "var(--text-tertiary)",
  textInverse:   "var(--text-inverse)",
  accent:        "var(--accent)",
  danger:        "var(--danger)",
  warningText:   "var(--warning-text)",
} as const;

export type TokenKey = keyof typeof tokens;
