"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

export function NavProgressBar() {
  const pathname = usePathname();
  const [phase, setPhase] = useState<"idle" | "done">("idle");
  const prevPath = useRef(pathname);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (pathname !== prevPath.current) {
      prevPath.current = pathname;
      setPhase("done");
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setPhase("idle"), 500);
    }
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [pathname]);

  if (phase === "idle") return null;

  return (
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, height: 2, zIndex: 9999, pointerEvents: "none" }}>
      <div style={{
        height: "100%",
        background: "var(--accent)",
        width: "100%",
        animation: "hollis-progress 500ms cubic-bezier(0.16,1,0.3,1) forwards",
      }} />
    </div>
  );
}
