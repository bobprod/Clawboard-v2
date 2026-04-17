import { useState, useEffect, useRef } from "react";

const BASE = "http://localhost:4000";
const BACKOFF_BASE = 1000;
const BACKOFF_MAX = 30000;

export function useSSE<T>(
  path: string,
  initialValue: T,
): { data: T; connected: boolean } {
  const [data, setData] = useState<T>(initialValue);
  const [connected, setConnected] = useState(false);
  const retryCount = useRef(0);

  useEffect(() => {
    const url = `${BASE}${path}`;
    let es: EventSource;
    let retryTimeout: ReturnType<typeof setTimeout>;
    let disposed = false;

    const connect = () => {
      if (disposed) return;
      es = new EventSource(url);

      es.onopen = () => {
        retryCount.current = 0;
        setConnected(true);
      };

      es.onmessage = (e) => {
        try {
          setData(JSON.parse(e.data));
        } catch (_) {}
      };

      es.onerror = () => {
        setConnected(false);
        es.close();
        if (disposed) return;
        const delay = Math.min(
          BACKOFF_BASE * 2 ** retryCount.current,
          BACKOFF_MAX,
        );
        retryCount.current++;
        retryTimeout = setTimeout(connect, delay);
      };
    };

    connect();

    return () => {
      disposed = true;
      clearTimeout(retryTimeout);
      es?.close();
    };
  }, [path]);

  return { data, connected };
}
