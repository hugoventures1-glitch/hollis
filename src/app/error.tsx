"use client";

import { useEffect } from "react";

export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html>
      <body
        style={{
          margin: 0,
          background: "var(--background)",
          color: "var(--text-primary)",
          fontFamily: "system-ui, sans-serif",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100vh",
          flexDirection: "column",
          gap: 16,
          textAlign: "center",
          padding: "0 24px",
        }}
      >
        <p style={{ fontSize: 14, color: "var(--text-secondary)", margin: 0 }}>
          Something went wrong. Please refresh the page.
        </p>
        <button
          onClick={reset}
          style={{
            height: 36,
            padding: "0 16px",
            borderRadius: 8,
            background: "var(--border)",
            color: "var(--text-primary)",
            border: "1px solid var(--border)",
            fontSize: 13,
            cursor: "pointer",
          }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
