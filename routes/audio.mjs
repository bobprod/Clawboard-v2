// ─── Audio Routes ────────────────────────────────────────────────────────────
// Liste des périphériques audio du système (cartes son + endpoints capture/render).
// Indépendant du navigateur : utile quand la permission micro masque les noms.

import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

let cache = { ts: 0, data: null };
const TTL_MS = 5000;

// PowerShell : liste les endpoints audio actifs et les cartes son.
const PS_SCRIPT = [
  "$ErrorActionPreference = 'SilentlyContinue'",
  "[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false",
  "$OutputEncoding = [Console]::OutputEncoding",
  "$eps = Get-PnpDevice -Class AudioEndpoint -Status OK | ForEach-Object {",
  "  $dir = 'output'",
  "  if ($_.InstanceId -like '*{0.0.1.*') { $dir = 'input' }",
  "  [pscustomobject]@{ name = $_.FriendlyName; direction = $dir }",
  "}",
  "$cards = Get-CimInstance Win32_SoundDevice | ForEach-Object {",
  "  [pscustomobject]@{ name = $_.Name; status = $_.Status }",
  "}",
  "[pscustomobject]@{ endpoints = @($eps); cards = @($cards) } | ConvertTo-Json -Depth 4 -Compress",
].join("\n");

function asArray(value) {
  if (Array.isArray(value)) return value;
  return value ? [value] : [];
}

async function readSystemAudio() {
  if (process.platform !== "win32") {
    return { supported: false, inputs: [], outputs: [], cards: [], platform: process.platform };
  }

  const now = Date.now();
  if (cache.data && now - cache.ts < TTL_MS) return cache.data;

  const { stdout } = await execFileAsync(
    "powershell.exe",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", PS_SCRIPT],
    { timeout: 10000, maxBuffer: 2 * 1024 * 1024, windowsHide: true },
  );

  const parsed = JSON.parse((stdout || "").trim() || "{}");
  const endpoints = asArray(parsed.endpoints);
  const cards = asArray(parsed.cards);

  const data = {
    supported: true,
    platform: process.platform,
    inputs: endpoints.filter((e) => e.direction === "input").map((e) => e.name),
    outputs: endpoints.filter((e) => e.direction === "output").map((e) => e.name),
    cards: cards.map((c) => c.name),
    ts: now,
  };

  cache = { ts: now, data };
  return data;
}

export function register(router) {
  router.get("/api/audio/devices", async ({ json }) => {
    try {
      const data = await readSystemAudio();
      json(200, data);
    } catch (err) {
      json(200, {
        supported: false,
        platform: process.platform,
        inputs: [],
        outputs: [],
        cards: [],
        error: err.message,
      });
    }
  });
}
