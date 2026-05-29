import { useSyncExternalStore, useCallback, useRef } from "react";

const BASE = "http://localhost:4000";
const BACKOFF_BASE = 1000;
const BACKOFF_MAX = 30000;

/** Shared SSE connection entry */
interface SSEConnection<T> {
  es: EventSource | null;
  data: T;
  connected: boolean;
  listeners: Set<() => void>;
  retryCount: number;
  retryTimeout: ReturnType<typeof setTimeout> | null;
  disposed: boolean;
  /** Stable snapshot reference — only replaced when data actually changes */
  snapshot: { data: T; connected: boolean };
}

/** Module-level cache: one connection per URL */
const connections = new Map<string, SSEConnection<unknown>>();

function getConnection<T>(url: string, initialValue: T): SSEConnection<T> {
  if (!connections.has(url)) {
    const snapshot = { data: initialValue, connected: false };
    const conn: SSEConnection<T> = {
      es: null,
      data: initialValue,
      connected: false,
      listeners: new Set(),
      retryCount: 0,
      retryTimeout: null,
      disposed: false,
      snapshot,
    };
    connections.set(url, conn as SSEConnection<unknown>);
    startConnection(url, conn);
  }
  return connections.get(url) as SSEConnection<T>;
}

function startConnection<T>(url: string, conn: SSEConnection<T>) {
  const connect = () => {
    if (conn.disposed) return;
    conn.es = new EventSource(url);

    conn.es.onopen = () => {
      conn.retryCount = 0;
      conn.connected = true;
      notifyListeners(conn);
    };

    conn.es.onmessage = (e) => {
      try {
        conn.data = JSON.parse(e.data);
        notifyListeners(conn);
      } catch (_) {}
    };

    conn.es.onerror = () => {
      conn.connected = false;
      conn.es?.close();
      notifyListeners(conn);
      if (conn.disposed) return;
      const delay = Math.min(
        BACKOFF_BASE * 2 ** conn.retryCount,
        BACKOFF_MAX,
      );
      conn.retryCount++;
      conn.retryTimeout = setTimeout(connect, delay);
    };
  };

  connect();
}

function notifyListeners<T>(conn: SSEConnection<T>) {
  // Create a new snapshot object so useSyncExternalStore detects the change
  conn.snapshot = { data: conn.data as T, connected: conn.connected };
  conn.listeners.forEach((cb) => cb());
}

function subscribe<T>(url: string, initialValue: T, callback: () => void) {
  const conn = getConnection(url, initialValue);
  conn.listeners.add(callback);
  return () => {
    conn.listeners.delete(callback);
    // If no more listeners, close connection after a short grace period
    if (conn.listeners.size === 0) {
      setTimeout(() => {
        const current = connections.get(url);
        if (current && current.listeners.size === 0) {
          current.disposed = true;
          if (current.retryTimeout) clearTimeout(current.retryTimeout);
          current.es?.close();
          connections.delete(url);
        }
      }, 5000);
    }
  };
}

function getSnapshot<T>(url: string, initialValue: T): { data: T; connected: boolean } {
  const conn = getConnection(url, initialValue);
  // Return the cached snapshot — same reference if nothing changed,
  // new reference only when notifyListeners created a fresh one.
  return conn.snapshot as { data: T; connected: boolean };
}

/** Singleton SSE hook — shares one EventSource per URL across all components */
export function useSSE<T>(
  path: string,
  initialValue: T,
): { data: T; connected: boolean } {
  const url = `${BASE}${path}`;

  // Stable refs so the callbacks passed to useSyncExternalStore never change
  // reference between renders (avoids spurious re-subscriptions).
  const urlRef = useRef(url);
  const initialRef = useRef(initialValue);

  const subscribeStable = useCallback(
    (callback: () => void) => subscribe(urlRef.current, initialRef.current, callback),
    [],
  );
  const snapshotStable = useCallback(
    () => getSnapshot(urlRef.current, initialRef.current),
    [],
  );

  return useSyncExternalStore(subscribeStable, snapshotStable, snapshotStable);
}
