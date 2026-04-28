"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  greeting: string;
  firstName: string | null;
  today: string;
}

export function SplashScreen({ greeting, firstName, today }: Props) {
  const router = useRouter();
  const [opacity, setOpacity] = useState(0);

  useEffect(() => {
    // Fade in
    const fadeIn = requestAnimationFrame(() => setOpacity(1));

    // Hold then fade out and redirect
    const fadeOut = setTimeout(() => setOpacity(0), 2400);
    const nav     = setTimeout(() => router.replace("/inbox"), 3100);

    return () => {
      cancelAnimationFrame(fadeIn);
      clearTimeout(fadeOut);
      clearTimeout(nav);
    };
  }, [router]);

  return (
    <div
      className="flex flex-col items-center justify-center h-full antialiased select-none"
      style={{
        background: "var(--background)",
        color:      "var(--text-primary)",
        opacity,
        transition: "opacity 600ms ease",
      }}
    >
      <div className="flex flex-col items-center gap-3 text-center">
        <p
          className="text-[13px] tracking-widest uppercase"
          style={{ color: "var(--text-tertiary)", letterSpacing: "0.15em" }}
        >
          {today}
        </p>

        <h1 className="text-[52px] leading-tight tracking-tight">
          <span style={{ fontWeight: 300 }}>{greeting}</span>
          {firstName && (
            <>
              <span style={{ fontWeight: 300 }}>, </span>
              <span style={{ fontWeight: 600 }}>{firstName}</span>
            </>
          )}
        </h1>
      </div>
    </div>
  );
}
