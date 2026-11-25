// ─── Provenance cryptographique des améliorations (SOUL ID) ────────────────────
//
// Chaque amélioration appliquée porte un manifeste de provenance signé (HMAC
// SHA-256) : source, auteur, hash du contenu, moment, backend d'écriture.
//
// Garde-fous :
//   - signature nonForgeable sans la clé (CLAWBOARD_PROVENANCE_KEY)
//   - comparaison à temps constant (timingSafeEqual)
//   - canonicalisation déterministe (JSON trié) → signature reproductible
//
// OWASP ASI06 (Memory Poisoning) : on conserve la trace de l'origine exacte
// d'un savoir pour pouvoir remonter jusqu'au document ou à l'outil source.

import { createHash, createHmac, timingSafeEqual } from "crypto";

const FALLBACK_KEY = "clawboard-provenance-dev";

/** Clé de signature (jamais exposée au front). */
export function getProvenanceKey() {
  return (
    process.env.CLAWBOARD_PROVENANCE_KEY ||
    process.env.CLAWBOARD_SECRET ||
    FALLBACK_KEY
  );
}

/** SHA-256 hexadécimal d'un contenu. */
export function sha256(input) {
  return createHash("sha256")
    .update(String(input ?? ""), "utf8")
    .digest("hex");
}

/** JSON canonique (clés triées, récursif) → signature stable. */
export function canonicalize(doc) {
  if (doc === null || doc === undefined) return "null";
  if (typeof doc !== "object") return JSON.stringify(doc);
  if (Array.isArray(doc)) return `[${doc.map(canonicalize).join(",")}]`;
  const keys = Object.keys(doc).sort();
  return `{${keys
    .map((k) => `${JSON.stringify(k)}:${canonicalize(doc[k])}`)
    .join(",")}}`;
}

/** Signature d'un document de provenance. */
export function getSourceSignature(doc) {
  return createHmac("sha256", getProvenanceKey())
    .update(canonicalize(doc))
    .digest("hex");
}

/**
 * Signe un document de provenance.
 *
 * @param {object} doc  { sourceId, sourceType, sourceUrl, sourceHash, agentId, body, createdAt }
 * @param {string} actor  qui a produit/appliqué l'amélioration
 * @param {string|null} store  backend d'écriture (sql|git|vault)
 * @returns {{ signature: string, doc: object }}
 */
export function signAgentProvenance(doc = {}, actor = "system", store = null) {
  const body = doc.body ?? doc.content ?? null;
  const payload = {
    sourceId: doc.sourceId ?? doc.id ?? null,
    sourceType: doc.sourceType ?? doc.type ?? "improvement",
    sourceUrl: doc.sourceUrl ?? null,
    sourceHash: doc.sourceHash ?? (body ? sha256(body) : null),
    agentId: doc.agentId ?? null,
    actor: String(actor ?? "system"),
    store: store ?? null,
    createdAt: doc.createdAt ?? new Date().toISOString(),
    body,
  };
  return { signature: getSourceSignature(payload), doc: payload };
}

/**
 * Vérifie une signature existante contre un document sérialisé.
 *
 * @param {string|object} text  JSON stringifié ou objet
 * @param {string} sig  signature attendue
 * @returns {boolean}
 */
export function verifySignedSource(text, sig) {
  try {
    if (!sig) return false;
    const doc = typeof text === "string" ? JSON.parse(text) : text;
    if (!doc || typeof doc !== "object") return false;
    const expected = getSourceSignature(doc);
    const a = Buffer.from(expected, "utf8");
    const b = Buffer.from(String(sig), "utf8");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/**
 * Vérifie une provenance stockée en base (payload JSONB { doc, signature }).
 */
export function verifyStoredProvenance(row) {
  if (!row) return false;
  const doc = row.doc ?? row.payload ?? null;
  const sig = row.signature ?? null;
  if (!doc || !sig) return false;
  return verifySignedSource(doc, sig);
}
