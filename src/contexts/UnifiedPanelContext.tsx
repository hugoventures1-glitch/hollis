"use client";

import { createContext, useContext, useCallback, useRef } from "react";

interface UnifiedPanelContextValue {
  openPanel: () => void;
  openPanelWithQuery: (text: string) => void;
  registerOpenHandler: (fn: () => void) => void;
  registerOpenWithQueryHandler: (fn: (text: string) => void) => void;
}

const UnifiedPanelContext = createContext<UnifiedPanelContextValue | null>(null);

export function UnifiedPanelProvider({ children }: { children: React.ReactNode }) {
  const handlerRef      = useRef<() => void>(() => {});
  const queryHandlerRef = useRef<(text: string) => void>(() => {});

  const registerOpenHandler = useCallback((fn: () => void) => {
    handlerRef.current = fn;
  }, []);

  const registerOpenWithQueryHandler = useCallback((fn: (text: string) => void) => {
    queryHandlerRef.current = fn;
  }, []);

  const openPanel = useCallback(() => {
    handlerRef.current();
  }, []);

  const openPanelWithQuery = useCallback((text: string) => {
    queryHandlerRef.current(text);
  }, []);

  return (
    <UnifiedPanelContext.Provider
      value={{ openPanel, openPanelWithQuery, registerOpenHandler, registerOpenWithQueryHandler }}
    >
      {children}
    </UnifiedPanelContext.Provider>
  );
}

export function useUnifiedPanel() {
  const ctx = useContext(UnifiedPanelContext);
  if (!ctx) {
    return {
      openPanel: () => {},
      openPanelWithQuery: (_text: string) => {},
      registerOpenHandler: (_fn: () => void) => {},
      registerOpenWithQueryHandler: (_fn: (text: string) => void) => {},
    };
  }
  return ctx;
}
