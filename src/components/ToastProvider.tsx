import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
} from "react";
import { CheckCircle2, AlertTriangle, Info, XCircle, X } from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

type ToastType = "success" | "error" | "warning" | "info";

interface Toast {
  id: string;
  message: string;
  type: ToastType;
  detail?: string;
  timestamp: number;
}

interface ToastContextValue {
  addToast: (message: string, type?: ToastType, detail?: string) => void;
}

const ToastContext = createContext<ToastContextValue>({ addToast: () => {} });
export const useToast = () => useContext(ToastContext);

// ─── SSE event listener for auto-toasts ──────────────────────────────────────

const BASE = "http://localhost:4000";

function useSSENotifications(addToast: ToastContextValue["addToast"]) {
  const connectedRef = useRef(false);

  useEffect(() => {
    if (connectedRef.current) return;
    connectedRef.current = true;

    let es: EventSource | null = null;
    try {
      es = new EventSource(`${BASE}/api/tasks?stream=1`);
      es.onerror = () => {
        es?.close();
        es = null;
        connectedRef.current = false;
      };
      es.onmessage = (ev) => {
        try {
          const tasks = JSON.parse(ev.data);
          if (!Array.isArray(tasks)) return;

          // Check for newly completed/failed tasks
          const stored = sessionStorage.getItem("_toast_task_states");
          const prevStates: Record<string, string> = stored
            ? JSON.parse(stored)
            : {};

          const newStates: Record<string, string> = {};
          for (const t of tasks) {
            newStates[t.id] = t.status;
            const prev = prevStates[t.id];
            if (!prev) continue;
            if (prev === "running" && t.status === "completed") {
              addToast(`Tâche terminée : ${t.title}`, "success");
            } else if (prev === "running" && t.status === "failed") {
              addToast(
                `Tâche échouée : ${t.title}`,
                "error",
                t.error || undefined,
              );
            }
          }
          sessionStorage.setItem(
            "_toast_task_states",
            JSON.stringify(newStates),
          );
        } catch {
          /* ignore parse errors */
        }
      };
    } catch {
      /* SSE not available */
    }

    return () => {
      connectedRef.current = false;
      es?.close();
    };
  }, [addToast]);
}

// ─── Provider ────────────────────────────────────────────────────────────────

const TOAST_DURATION = 5000;
const MAX_TOASTS = 5;

const ICONS: Record<ToastType, typeof CheckCircle2> = {
  success: CheckCircle2,
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
};

const COLORS: Record<ToastType, string> = {
  success: "#10b981",
  error: "#ef4444",
  warning: "#f59e0b",
  info: "#3b82f6",
};

export const ToastProvider = ({ children }: { children: React.ReactNode }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback(
    (message: string, type: ToastType = "info", detail?: string) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      setToasts((prev) => [
        ...prev.slice(-(MAX_TOASTS - 1)),
        { id, message, type, detail, timestamp: Date.now() },
      ]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, TOAST_DURATION);
    },
    [],
  );

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Listen to SSE for automatic notifications
  useSSENotifications(addToast);

  return (
    <ToastContext.Provider value={{ addToast }}>
      {children}

      {/* Toast container */}
      {toasts.length > 0 && (
        <div
          style={{
            position: "fixed",
            bottom: 20,
            right: 20,
            zIndex: 10000,
            display: "flex",
            flexDirection: "column-reverse",
            gap: 8,
            maxWidth: 380,
            pointerEvents: "none",
          }}
        >
          {toasts.map((toast, i) => {
            const Icon = ICONS[toast.type];
            const color = COLORS[toast.type];
            return (
              <div
                key={toast.id}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 10,
                  padding: "12px 16px",
                  borderRadius: 12,
                  background: "var(--bg-surface-elevated)",
                  border: `1px solid ${color}33`,
                  borderLeft: `4px solid ${color}`,
                  boxShadow: `0 8px 24px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.04)`,
                  animation: "toastSlideIn 0.3s ease",
                  pointerEvents: "all",
                  opacity: i === 0 ? 1 : 0.95,
                }}
              >
                <div style={{ color, flexShrink: 0, marginTop: 1 }}>
                  <Icon size={18} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontWeight: 600,
                      fontSize: "0.85rem",
                      color: "var(--text-primary)",
                      lineHeight: 1.3,
                    }}
                  >
                    {toast.message}
                  </div>
                  {toast.detail && (
                    <div
                      style={{
                        fontSize: "0.75rem",
                        color: "var(--text-muted)",
                        marginTop: 3,
                        lineHeight: 1.4,
                      }}
                    >
                      {toast.detail}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => dismiss(toast.id)}
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    color: "var(--text-muted)",
                    padding: 2,
                    flexShrink: 0,
                    display: "flex",
                  }}
                >
                  <X size={14} />
                </button>
              </div>
            );
          })}
        </div>
      )}
      <style>{`
        @keyframes toastSlideIn {
          from { opacity: 0; transform: translateX(20px); }
          to   { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </ToastContext.Provider>
  );
};
