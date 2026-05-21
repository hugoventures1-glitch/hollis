"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { driver } from "driver.js";
import "driver.js/dist/driver.css";
import { TOUR_PAGES } from "./tour-steps";

// ── Context ───────────────────────────────────────────────────────────────────

interface TourContextValue {
  isActive: boolean;
  signalReady: () => void;
  startTour: () => void;
}

const TourContext = createContext<TourContextValue>({
  isActive: false,
  signalReady: () => {},
  startTour: () => {},
});

export function useTour() {
  return useContext(TourContext);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function markComplete() {
  try {
    await fetch("/api/tour/complete", { method: "POST" });
  } catch {
    // non-critical
  }
}

function waitForElement(selector: string, timeout = 5000): Promise<Element | null> {
  return new Promise((resolve) => {
    const el = document.querySelector(selector);
    if (el) return resolve(el);

    const observer = new MutationObserver(() => {
      const found = document.querySelector(selector);
      if (found) {
        observer.disconnect();
        resolve(found);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => {
      observer.disconnect();
      resolve(null);
    }, timeout);
  });
}

// ── Provider ──────────────────────────────────────────────────────────────────

export function TourProvider({
  tutorialCompleted,
  children,
}: {
  tutorialCompleted: boolean;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [isActive, setIsActive] = useState(false);
  const pageIndexRef = useRef(0);
  const driverRef = useRef<ReturnType<typeof driver> | null>(null);
  // Resolved when the current page signals it's ready
  const readyResolveRef = useRef<(() => void) | null>(null);

  const signalReady = useCallback(() => {
    readyResolveRef.current?.();
    readyResolveRef.current = null;
  }, []);

  const runPageGroup = useCallback(
    async (pageIndex: number) => {
      const page = TOUR_PAGES[pageIndex];
      if (!page) {
        // Tour finished
        await markComplete();
        setIsActive(false);
        return;
      }

      // Navigate to the page if not already there
      if (!window.location.pathname.startsWith(page.path)) {
        router.push(page.path);
        // Wait for the page to signal it's ready
        await new Promise<void>((resolve) => {
          readyResolveRef.current = resolve;
          // Fallback: resolve after 3s even if signal never fires
          setTimeout(resolve, 3000);
        });
        // Extra tick to let DOM settle after signal
        await new Promise((r) => setTimeout(r, 120));
      }

      // Wait for the first step's element to appear
      const firstSelector = page.steps[0]?.element;
      if (firstSelector) {
        await waitForElement(firstSelector, 4000);
      }

      const isLastPage = pageIndex === TOUR_PAGES.length - 1;

      const driverInstance = driver({
        animate: true,
        overlayColor: "rgba(0,0,0,0.82)",
        overlayOpacity: 0.82,
        stagePadding: 8,
        stageRadius: 12,
        smoothScroll: true,
        allowClose: true,
        showProgress: true,
        progressText: `Step {{current}} of {{total}}`,
        doneBtnText: "Finish tour",
        nextBtnText: "Next →",
        prevBtnText: "← Back",
        steps: page.steps.map((step, i) => ({
          element: step.element,
          popover: {
            ...step.popover,
            // On the last step of the last page, show "Finish" button
            // On the last step of a non-final page, show "Next page →"
            ...(i === page.steps.length - 1 && !isLastPage
              ? { nextBtnText: "Next page →" }
              : {}),
          },
        })),
        onDestroyStarted: async () => {
          driverRef.current = null;
          await markComplete();
          setIsActive(false);
          driverInstance.destroy();
        },
        onNextClick: () => {
          const current = driverInstance.getActiveIndex() ?? 0;
          const isLastStep = current === page.steps.length - 1;

          if (isLastStep && !isLastPage) {
            // Move to next page group
            driverInstance.destroy();
            driverRef.current = null;
            pageIndexRef.current = pageIndex + 1;
            runPageGroup(pageIndex + 1);
          } else {
            driverInstance.moveNext();
          }
        },
        onPrevClick: () => {
          const current = driverInstance.getActiveIndex() ?? 0;
          if (current === 0 && pageIndex > 0) {
            // Go back to last step of previous page
            driverInstance.destroy();
            driverRef.current = null;
            runPageGroupReverse(pageIndex - 1);
          } else {
            driverInstance.movePrevious();
          }
        },
      });

      driverRef.current = driverInstance;
      driverInstance.drive();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [router]
  );

  const runPageGroupReverse = useCallback(
    async (pageIndex: number) => {
      const page = TOUR_PAGES[pageIndex];
      if (!page) return;

      if (!window.location.pathname.startsWith(page.path)) {
        router.push(page.path);
        await new Promise<void>((resolve) => {
          readyResolveRef.current = resolve;
          setTimeout(resolve, 3000);
        });
        await new Promise((r) => setTimeout(r, 120));
      }

      const lastSelector = page.steps[page.steps.length - 1]?.element;
      if (lastSelector) await waitForElement(lastSelector, 4000);

      const isLastPage = pageIndex === TOUR_PAGES.length - 1;

      const driverInstance = driver({
        animate: true,
        overlayColor: "rgba(0,0,0,0.82)",
        overlayOpacity: 0.82,
        stagePadding: 8,
        stageRadius: 12,
        smoothScroll: true,
        allowClose: true,
        showProgress: true,
        progressText: `Step {{current}} of {{total}}`,
        doneBtnText: "Finish tour",
        nextBtnText: "Next →",
        prevBtnText: "← Back",
        steps: page.steps.map((step, i) => ({
          element: step.element,
          popover: {
            ...step.popover,
            ...(i === page.steps.length - 1 && !isLastPage
              ? { nextBtnText: "Next page →" }
              : {}),
          },
        })),
        onDestroyStarted: async () => {
          driverRef.current = null;
          await markComplete();
          setIsActive(false);
          driverInstance.destroy();
        },
        onNextClick: () => {
          const current = driverInstance.getActiveIndex() ?? 0;
          const isLastStep = current === page.steps.length - 1;
          if (isLastStep && !isLastPage) {
            driverInstance.destroy();
            driverRef.current = null;
            pageIndexRef.current = pageIndex + 1;
            runPageGroup(pageIndex + 1);
          } else {
            driverInstance.moveNext();
          }
        },
        onPrevClick: () => {
          const current = driverInstance.getActiveIndex() ?? 0;
          if (current === 0 && pageIndex > 0) {
            driverInstance.destroy();
            driverRef.current = null;
            runPageGroupReverse(pageIndex - 1);
          } else {
            driverInstance.movePrevious();
          }
        },
      });

      driverRef.current = driverInstance;
      // Start on the last step
      driverInstance.drive(page.steps.length - 1);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [router, runPageGroup]
  );

  useEffect(() => {
    if (tutorialCompleted) return;
    // Small delay so the page renders before the tour overlays anything
    const t = setTimeout(() => {
      setIsActive(true);
      pageIndexRef.current = 0;
      runPageGroup(0);
    }, 800);
    return () => clearTimeout(t);
  }, [tutorialCompleted, runPageGroup]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      driverRef.current?.destroy();
    };
  }, []);

  const startTour = useCallback(() => {
    // Destroy any running instance first
    driverRef.current?.destroy();
    driverRef.current = null;
    setIsActive(true);
    pageIndexRef.current = 0;
    runPageGroup(0);
  }, [runPageGroup]);

  return (
    <TourContext.Provider value={{ isActive, signalReady, startTour }}>
      {children}
    </TourContext.Provider>
  );
}
