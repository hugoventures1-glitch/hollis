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
          background: "#0C0C0C",
          color: "#FAFAFA",
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
        <p style={{ fontSize: 14, color: "#666666", margin: 0 }}>
          Something went wrong. Please refresh the page.
        </p>
        <button
          onClick={reset}
          style={{
            height: 36,
            padding: "0 16px",
            borderRadius: 8,
            background: "#1C1C1C",
            color: "#FAFAFA",
            border: "1px solid #2A2A2A",
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
