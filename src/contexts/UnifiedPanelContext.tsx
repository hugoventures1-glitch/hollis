"use client";

import { createContext, useContext, useCallback, useRef } from "react";

interface UnifiedPanelContextValue {
  openPanel: () => void;
  registerOpenHandler: (fn: () => void) => void;
}

const UnifiedPanelContext = createContext<UnifiedPanelContextValue | null>(null);

export function UnifiedPanelProvider({ children }: { children: React.ReactNode }) {
  const handlerRef = useRef<() => void>(() => {});

  const registerOpenHandler = useCallback((fn: () => void) => {
    handlerRef.current = fn;
  }, []);

  const openPanel = useCallback(() => {
    handlerRef.current();
  }, []);

  return (
    <UnifiedPanelContext.Provider value={{ openPanel, registerOpenHandler }}>
      {children}
    </UnifiedPanelContext.Provider>
  );
}

export function useUnifiedPanel() {
  const ctx = useContext(UnifiedPanelContext);
  if (!ctx) {
    return { openPanel: () => {}, registerOpenHandler: () => {} };
  }
  return ctx;
}
