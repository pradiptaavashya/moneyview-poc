import { useState, useEffect, useCallback } from "react";

interface RetryOptions {
  maxRetries?: number;
  baseDelay?: number;
  maxDelay?: number;
}

export function useNetworkRecovery() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [recovering, setRecovering] = useState(false);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  const fetchWithRetry = useCallback(
    async (
      url: string,
      options?: RequestInit,
      retryOptions?: RetryOptions
    ): Promise<Response> => {
      const { maxRetries = 3, baseDelay = 1000, maxDelay = 8000 } =
        retryOptions ?? {};
      let lastError: Error | null = null;

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          if (!navigator.onLine) {
            await waitForOnline();
          }
          setRecovering(attempt > 0);
          const res = await fetch(url, options);
          setRecovering(false);
          return res;
        } catch (err) {
          lastError = err instanceof Error ? err : new Error("Network error");
          if (attempt < maxRetries) {
            const delay = Math.min(baseDelay * 2 ** attempt, maxDelay);
            await sleep(delay);
          }
        }
      }
      setRecovering(false);
      throw lastError ?? new Error("Network request failed");
    },
    []
  );

  return { isOnline, recovering, fetchWithRetry };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function waitForOnline(): Promise<void> {
  if (navigator.onLine) return Promise.resolve();
  return new Promise((resolve) => {
    const handler = () => {
      window.removeEventListener("online", handler);
      resolve();
    };
    window.addEventListener("online", handler);
  });
}

export function NetworkBanner({ isOnline, recovering }: { isOnline: boolean; recovering: boolean }) {
  if (isOnline && !recovering) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-50 px-4 py-2 text-center text-sm font-medium bg-yellow-900/90 text-yellow-200 backdrop-blur-sm">
      {!isOnline
        ? "You are offline. Waiting for connection..."
        : "Reconnecting..."}
    </div>
  );
}
