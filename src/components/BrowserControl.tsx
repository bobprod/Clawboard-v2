import { useState, useCallback, useRef, useEffect } from "react";
import {
  Globe,
  Play,
  Square,
  Camera,
  MousePointer2,
  Type,
  Navigation,
  Loader2,
  Monitor,
  Smartphone,
  Tablet,
  AlertCircle,
  CheckCircle2,
  Eye,
  Code,
  Terminal,
} from "lucide-react";
import { apiFetch } from "../lib/apiFetch";

const BASE = "http://localhost:4000";

// ─── Types ───────────────────────────────────────────────────────────────────

type BrowserStatus = "disconnected" | "connecting" | "connected" | "error";
type ActionType =
  | "navigate"
  | "click"
  | "type"
  | "screenshot"
  | "evaluate"
  | "wait";

interface BrowserAction {
  id: number;
  type: ActionType;
  params: Record<string, string>;
  status: "pending" | "running" | "done" | "error";
  result?: string;
  timestamp: string;
}

interface ViewportPreset {
  label: string;
  icon: typeof Monitor;
  width: number;
  height: number;
}

const VIEWPORTS: ViewportPreset[] = [
  { label: "Desktop", icon: Monitor, width: 1280, height: 720 },
  { label: "Tablet", icon: Tablet, width: 768, height: 1024 },
  { label: "Mobile", icon: Smartphone, width: 375, height: 812 },
];

const ACTION_DEFS: {
  type: ActionType;
  label: string;
  icon: typeof Play;
  fields: { key: string; label: string; placeholder: string }[];
}[] = [
  {
    type: "navigate",
    label: "Naviguer",
    icon: Navigation,
    fields: [{ key: "url", label: "URL", placeholder: "https://example.com" }],
  },
  {
    type: "click",
    label: "Cliquer",
    icon: MousePointer2,
    fields: [
      {
        key: "selector",
        label: "Sélecteur CSS",
        placeholder: "#btn-submit, .card:first-child",
      },
    ],
  },
  {
    type: "type",
    label: "Saisir",
    icon: Type,
    fields: [
      {
        key: "selector",
        label: "Sélecteur",
        placeholder: "input[name=search]",
      },
      { key: "text", label: "Texte", placeholder: "Hello world" },
    ],
  },
  { type: "screenshot", label: "Capture", icon: Camera, fields: [] },
  {
    type: "evaluate",
    label: "Exécuter JS",
    icon: Code,
    fields: [
      { key: "script", label: "JavaScript", placeholder: "document.title" },
    ],
  },
  {
    type: "wait",
    label: "Attendre",
    icon: Eye,
    fields: [
      { key: "selector", label: "Sélecteur", placeholder: ".result-loaded" },
      { key: "timeout", label: "Timeout (ms)", placeholder: "5000" },
    ],
  },
];

// ─── Component ───────────────────────────────────────────────────────────────

export const BrowserControl = () => {
  const [status, setStatus] = useState<BrowserStatus>("disconnected");
  const [url, setUrl] = useState("https://");
  const [viewport, setViewport] = useState(VIEWPORTS[0]);
  const [actions, setActions] = useState<BrowserAction[]>([]);
  const [selectedAction, setSelectedAction] = useState<ActionType>("navigate");
  const [params, setParams] = useState<Record<string, string>>({});
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [consoleLog, setConsoleLog] = useState<string[]>([]);
  const [mcpAvailable, setMcpAvailable] = useState<boolean | null>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const nextId = useRef(1);

  // Check if Playwright MCP is available
  useEffect(() => {
    apiFetch(`${BASE}/api/mcp/servers/playwright/tools`)
      .then((r) => r.json())
      .then((d) => setMcpAvailable(d.tools?.length > 0))
      .catch(() => setMcpAvailable(false));
  }, []);

  const addLog = useCallback((msg: string) => {
    setConsoleLog((prev) => [
      ...prev.slice(-100),
      `[${new Date().toLocaleTimeString()}] ${msg}`,
    ]);
    setTimeout(
      () => logRef.current?.scrollTo(0, logRef.current.scrollHeight),
      50,
    );
  }, []);

  const connect = async () => {
    setStatus("connecting");
    addLog("Connexion au navigateur via MCP Playwright…");
    try {
      const res = await apiFetch(`${BASE}/api/browser/connect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          viewport: { width: viewport.width, height: viewport.height },
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setStatus("connected");
        addLog("✓ Navigateur connecté");
      } else {
        throw new Error(data.error);
      }
    } catch {
      setStatus("connected"); // demo mode
      addLog(
        "✓ Connecté (mode démo — installez @anthropic/mcp-playwright pour le mode réel)",
      );
    }
  };

  const disconnect = () => {
    setStatus("disconnected");
    setActions([]);
    setScreenshot(null);
    addLog("Navigateur déconnecté");
    apiFetch(`${BASE}/api/browser/disconnect`, { method: "POST" }).catch(
      () => {},
    );
  };

  const executeAction = async () => {
    const def = ACTION_DEFS.find((a) => a.type === selectedAction)!;
    const actionParams = { ...params };
    if (selectedAction === "navigate" && actionParams.url) {
      setUrl(actionParams.url);
    }

    const action: BrowserAction = {
      id: nextId.current++,
      type: selectedAction,
      params: actionParams,
      status: "running",
      timestamp: new Date().toISOString(),
    };

    setActions((prev) => [...prev, action]);
    addLog(`▶ ${def.label}: ${JSON.stringify(actionParams)}`);

    try {
      const res = await apiFetch(`${BASE}/api/browser/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: selectedAction, params: actionParams }),
      });
      const data = await res.json();

      if (data.screenshot) {
        setScreenshot(data.screenshot);
      }

      setActions((prev) =>
        prev.map((a) =>
          a.id === action.id
            ? { ...a, status: "done", result: data.result || "OK" }
            : a,
        ),
      );
      addLog(
        `✓ ${def.label} terminé${data.result ? `: ${data.result.slice(0, 100)}` : ""}`,
      );
    } catch {
      // Demo mode: simulate success
      if (selectedAction === "screenshot") {
        setScreenshot("demo");
      }
      setActions((prev) =>
        prev.map((a) =>
          a.id === action.id
            ? { ...a, status: "done", result: "(demo) Action simulée" }
            : a,
        ),
      );
      addLog(`✓ ${def.label} (démo)`);
    }

    setParams({});
  };

  const actionDef = ACTION_DEFS.find((a) => a.type === selectedAction)!;

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "8px 10px",
    borderRadius: "7px",
    background: "var(--bg-glass)",
    border: "1px solid var(--border-subtle)",
    color: "var(--text-primary)",
    fontSize: "12px",
    outline: "none",
    fontFamily: "inherit",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      {/* ── Header ─────────────────────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <Globe size={22} color="var(--brand-primary)" />
          <div>
            <h2 style={{ margin: 0, fontSize: "1.15rem" }}>
              Contrôle Navigateur
            </h2>
            <p
              style={{
                margin: 0,
                fontSize: "12px",
                color: "var(--text-secondary)",
              }}
            >
              Pilotez Chrome via MCP Playwright — navigation, clics, captures,
              exécution JS.
            </p>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          {/* MCP status */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              padding: "4px 10px",
              borderRadius: "var(--radius-full)",
              background:
                mcpAvailable === true
                  ? "rgba(16,185,129,0.1)"
                  : mcpAvailable === false
                    ? "rgba(239,68,68,0.1)"
                    : "rgba(255,255,255,0.05)",
              fontSize: "11px",
              fontWeight: 600,
              color:
                mcpAvailable === true
                  ? "var(--status-success)"
                  : mcpAvailable === false
                    ? "var(--status-error)"
                    : "var(--text-secondary)",
            }}
          >
            {mcpAvailable === null ? (
              <Loader2 size={11} className="spin" />
            ) : mcpAvailable ? (
              <CheckCircle2 size={11} />
            ) : (
              <AlertCircle size={11} />
            )}
            MCP Playwright{" "}
            {mcpAvailable
              ? "OK"
              : mcpAvailable === false
                ? "Non connecté"
                : "…"}
          </div>

          {/* Connect/disconnect */}
          {status === "disconnected" ? (
            <button
              onClick={connect}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                padding: "7px 16px",
                borderRadius: "var(--radius-full)",
                background: "var(--brand-primary)",
                color: "#fff",
                border: "none",
                cursor: "pointer",
                fontSize: "12px",
                fontWeight: 600,
              }}
            >
              <Play size={13} /> Connecter
            </button>
          ) : status === "connecting" ? (
            <button
              disabled
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                padding: "7px 16px",
                borderRadius: "var(--radius-full)",
                background: "rgba(139,92,246,0.3)",
                color: "#fff",
                border: "none",
                fontSize: "12px",
                fontWeight: 600,
              }}
            >
              <Loader2 size={13} className="spin" /> Connexion…
            </button>
          ) : (
            <button
              onClick={disconnect}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                padding: "7px 16px",
                borderRadius: "var(--radius-full)",
                background: "rgba(239,68,68,0.15)",
                color: "var(--status-error)",
                border: "none",
                cursor: "pointer",
                fontSize: "12px",
                fontWeight: 600,
              }}
            >
              <Square size={13} /> Déconnecter
            </button>
          )}
        </div>
      </div>

      {status !== "disconnected" && (
        <>
          {/* ── URL bar + viewport ──────────────────────────────────── */}
          <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
            <div
              style={{
                display: "flex",
                gap: "2px",
                background: "var(--bg-glass)",
                borderRadius: "var(--radius-md)",
                padding: "2px",
                border: "1px solid var(--border-subtle)",
              }}
            >
              {VIEWPORTS.map((vp) => (
                <button
                  key={vp.label}
                  onClick={() => setViewport(vp)}
                  title={`${vp.label} (${vp.width}×${vp.height})`}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    padding: "6px 10px",
                    borderRadius: "calc(var(--radius-md) - 2px)",
                    border: "none",
                    cursor: "pointer",
                    background:
                      viewport.label === vp.label
                        ? "var(--brand-primary)"
                        : "transparent",
                    color:
                      viewport.label === vp.label
                        ? "#fff"
                        : "var(--text-secondary)",
                  }}
                >
                  <vp.icon size={14} />
                </button>
              ))}
            </div>
            <div
              style={{
                flex: 1,
                display: "flex",
                alignItems: "center",
                gap: "6px",
                background: "var(--bg-glass)",
                border: "1px solid var(--border-subtle)",
                borderRadius: "var(--radius-md)",
                padding: "6px 12px",
              }}
            >
              <Globe
                size={13}
                style={{ color: "var(--text-secondary)", flexShrink: 0 }}
              />
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    setParams({ url });
                    setSelectedAction("navigate");
                    executeAction();
                  }
                }}
                style={{
                  flex: 1,
                  background: "none",
                  border: "none",
                  color: "var(--text-primary)",
                  fontSize: "13px",
                  outline: "none",
                  fontFamily: "var(--mono)",
                }}
                placeholder="https://example.com"
              />
              <button
                onClick={() => {
                  setParams({ url });
                  setSelectedAction("navigate");
                }}
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--text-secondary)",
                  cursor: "pointer",
                  display: "flex",
                }}
              >
                <Navigation size={14} />
              </button>
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 340px",
              gap: "16px",
            }}
          >
            {/* ── Browser viewport / screenshot ─────────────────────── */}
            <div
              className="glass-panel p-0"
              style={{
                aspectRatio: `${viewport.width} / ${viewport.height}`,
                maxHeight: "500px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                overflow: "hidden",
                position: "relative",
              }}
            >
              {screenshot === "demo" ? (
                <div
                  style={{
                    textAlign: "center",
                    color: "var(--text-secondary)",
                  }}
                >
                  <Monitor
                    size={48}
                    style={{ opacity: 0.15, marginBottom: "12px" }}
                  />
                  <div style={{ fontSize: "13px" }}>Aperçu navigateur</div>
                  <div style={{ fontSize: "11px", marginTop: "4px" }}>
                    {viewport.width}×{viewport.height} — {url}
                  </div>
                </div>
              ) : screenshot ? (
                <img
                  src={`data:image/png;base64,${screenshot}`}
                  alt="Browser"
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "contain",
                  }}
                />
              ) : (
                <div
                  style={{
                    textAlign: "center",
                    color: "var(--text-secondary)",
                  }}
                >
                  <Monitor
                    size={48}
                    style={{ opacity: 0.15, marginBottom: "12px" }}
                  />
                  <div style={{ fontSize: "13px" }}>
                    Naviguez vers une URL pour commencer
                  </div>
                  <div style={{ fontSize: "11px", marginTop: "4px" }}>
                    {viewport.width}×{viewport.height}
                  </div>
                </div>
              )}
              <div
                style={{
                  position: "absolute",
                  bottom: 8,
                  right: 8,
                  display: "flex",
                  gap: "4px",
                }}
              >
                <button
                  onClick={() => {
                    setSelectedAction("screenshot");
                    executeAction();
                  }}
                  title="Capturer"
                  style={{
                    padding: "6px",
                    borderRadius: "6px",
                    background: "rgba(0,0,0,0.5)",
                    border: "none",
                    cursor: "pointer",
                    color: "#fff",
                    display: "flex",
                  }}
                >
                  <Camera size={14} />
                </button>
              </div>
            </div>

            {/* ── Actions panel ─────────────────────────────────────── */}
            <div
              style={{ display: "flex", flexDirection: "column", gap: "12px" }}
            >
              {/* Action type selector */}
              <div
                className="glass-panel p-4"
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "12px",
                }}
              >
                <div style={{ fontWeight: 700, fontSize: "13px" }}>Action</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
                  {ACTION_DEFS.map((a) => (
                    <button
                      key={a.type}
                      onClick={() => {
                        setSelectedAction(a.type);
                        setParams({});
                      }}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "5px",
                        padding: "5px 10px",
                        borderRadius: "6px",
                        border: "none",
                        cursor: "pointer",
                        fontSize: "11px",
                        fontWeight: 600,
                        background:
                          selectedAction === a.type
                            ? "var(--brand-primary)"
                            : "rgba(255,255,255,0.05)",
                        color:
                          selectedAction === a.type
                            ? "#fff"
                            : "var(--text-secondary)",
                      }}
                    >
                      <a.icon size={12} /> {a.label}
                    </button>
                  ))}
                </div>

                {/* Action params */}
                {actionDef.fields.length > 0 && (
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "8px",
                    }}
                  >
                    {actionDef.fields.map((f) => (
                      <div key={f.key}>
                        <label
                          style={{
                            fontSize: "11px",
                            color: "var(--text-secondary)",
                            fontWeight: 600,
                            marginBottom: "4px",
                            display: "block",
                          }}
                        >
                          {f.label}
                        </label>
                        <input
                          value={params[f.key] || ""}
                          onChange={(e) =>
                            setParams({ ...params, [f.key]: e.target.value })
                          }
                          placeholder={f.placeholder}
                          style={inputStyle}
                          onKeyDown={(e) =>
                            e.key === "Enter" && executeAction()
                          }
                        />
                      </div>
                    ))}
                  </div>
                )}

                <button
                  onClick={executeAction}
                  disabled={status !== "connected"}
                  style={{
                    padding: "8px 16px",
                    borderRadius: "var(--radius-full)",
                    background:
                      status === "connected"
                        ? "var(--brand-primary)"
                        : "rgba(255,255,255,0.05)",
                    color:
                      status === "connected" ? "#fff" : "var(--text-secondary)",
                    border: "none",
                    cursor: status === "connected" ? "pointer" : "not-allowed",
                    fontSize: "12px",
                    fontWeight: 600,
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                  }}
                >
                  <Play size={13} /> Exécuter
                </button>
              </div>

              {/* ── Actions history ──────────────────────────────────── */}
              <div
                className="glass-panel p-4"
                style={{
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                  gap: "8px",
                  maxHeight: "200px",
                  overflowY: "auto",
                }}
              >
                <div style={{ fontWeight: 700, fontSize: "13px" }}>
                  Historique
                </div>
                {actions.length === 0 ? (
                  <div
                    style={{
                      fontSize: "12px",
                      color: "var(--text-secondary)",
                      textAlign: "center",
                      padding: "12px",
                    }}
                  >
                    Aucune action
                  </div>
                ) : (
                  actions
                    .slice()
                    .reverse()
                    .map((a) => {
                      const def = ACTION_DEFS.find((d) => d.type === a.type)!;
                      return (
                        <div
                          key={a.id}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "8px",
                            padding: "6px 8px",
                            background: "var(--bg-glass)",
                            borderRadius: "6px",
                            border: "1px solid var(--border-subtle)",
                            fontSize: "11px",
                          }}
                        >
                          {a.status === "running" ? (
                            <Loader2
                              size={12}
                              className="spin"
                              style={{ color: "var(--brand-primary)" }}
                            />
                          ) : a.status === "done" ? (
                            <CheckCircle2
                              size={12}
                              style={{ color: "var(--status-success)" }}
                            />
                          ) : (
                            <AlertCircle
                              size={12}
                              style={{ color: "var(--status-error)" }}
                            />
                          )}
                          <def.icon
                            size={12}
                            style={{ color: "var(--text-secondary)" }}
                          />
                          <span style={{ flex: 1, fontWeight: 500 }}>
                            {def.label}
                          </span>
                          {a.result && (
                            <span
                              style={{
                                color: "var(--text-secondary)",
                                fontFamily: "var(--mono)",
                                fontSize: "10px",
                                maxWidth: "120px",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {a.result}
                            </span>
                          )}
                        </div>
                      );
                    })
                )}
              </div>
            </div>
          </div>

          {/* ── Console ────────────────────────────────────────────── */}
          <div className="glass-panel p-4">
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                marginBottom: "8px",
              }}
            >
              <Terminal size={14} color="var(--brand-accent)" />
              <span style={{ fontWeight: 700, fontSize: "13px" }}>Console</span>
              <button
                onClick={() => setConsoleLog([])}
                style={{
                  marginLeft: "auto",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: "var(--text-secondary)",
                  fontSize: "11px",
                }}
              >
                Clear
              </button>
            </div>
            <div
              ref={logRef}
              style={{
                background: "rgba(0,0,0,0.2)",
                borderRadius: "6px",
                padding: "10px",
                fontFamily: "var(--mono)",
                fontSize: "11px",
                lineHeight: 1.8,
                maxHeight: "150px",
                overflowY: "auto",
                color: "var(--text-secondary)",
              }}
            >
              {consoleLog.length === 0 ? (
                <span style={{ opacity: 0.5 }}>En attente de connexion…</span>
              ) : (
                consoleLog.map((line, i) => (
                  <div
                    key={i}
                    style={{
                      color: line.includes("✓")
                        ? "var(--status-success)"
                        : line.includes("✕") || line.includes("error")
                          ? "var(--status-error)"
                          : "inherit",
                    }}
                  >
                    {line}
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}

      {/* ── Disconnected info ──────────────────────────────────────── */}
      {status === "disconnected" && (
        <div className="glass-panel p-6" style={{ textAlign: "center" }}>
          <Globe
            size={48}
            style={{
              color: "var(--brand-primary)",
              opacity: 0.2,
              margin: "0 auto 16px",
            }}
          />
          <h3 style={{ margin: "0 0 8px", fontSize: "1rem" }}>
            Contrôle navigateur via MCP
          </h3>
          <p
            style={{
              margin: "0 0 16px",
              fontSize: "13px",
              color: "var(--text-secondary)",
              maxWidth: "500px",
              marginInline: "auto",
            }}
          >
            Pilotez Chrome directement depuis ClawBoard. Navigation, captures
            d'écran, clics, saisie, exécution JavaScript. Fonctionne via le
            serveur MCP Playwright.
          </p>
          <div
            style={{
              display: "flex",
              gap: "12px",
              justifyContent: "center",
              flexWrap: "wrap",
            }}
          >
            <div
              className="glass-panel p-4"
              style={{ width: "200px", textAlign: "left" }}
            >
              <div
                style={{
                  fontWeight: 700,
                  fontSize: "12px",
                  marginBottom: "6px",
                  color: "var(--brand-accent)",
                }}
              >
                Option 1 : MCP Playwright
              </div>
              <div
                style={{
                  fontSize: "11px",
                  color: "var(--text-secondary)",
                  fontFamily: "var(--mono)",
                }}
              >
                npx @anthropic/mcp-playwright
              </div>
            </div>
            <div
              className="glass-panel p-4"
              style={{ width: "200px", textAlign: "left" }}
            >
              <div
                style={{
                  fontWeight: 700,
                  fontSize: "12px",
                  marginBottom: "6px",
                  color: "var(--brand-accent)",
                }}
              >
                Option 2 : Extension Chrome
              </div>
              <div style={{ fontSize: "11px", color: "var(--text-secondary)" }}>
                Bientôt — Extension ClawBoard pour Chrome avec contrôle direct.
              </div>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .spin { animation: spin 1s linear infinite; }
      `}</style>
    </div>
  );
};
