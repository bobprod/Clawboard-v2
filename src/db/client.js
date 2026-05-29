// src/db/client.js
// Pool de connexions PostgreSQL — partagé par tout le backend.
//
// Configuration via la variable d'environnement DATABASE_URL :
//   postgresql://user:password@localhost:5432/clawboard
//
// Si DATABASE_URL est absent → mode "no-DB" : toutes les queries renvoient
// des résultats vides sans crasher le serveur.

import pg from 'pg';

const { Pool } = pg;

const DB_URL = process.env.DATABASE_URL;

if (!DB_URL) {
  console.warn('[DB] DATABASE_URL non configuré — mode no-DB activé (données en mémoire uniquement).');
}

// ─── Mock pool (no-DB mode) ───────────────────────────────────────────────────
// Toutes les méthodes renvoient des résultats vides sans lancer d'exception.
const mockPool = {
  query:   async () => ({ rows: [], rowCount: 0 }),
  connect: async () => ({
    query:   async () => ({ rows: [], rowCount: 0 }),
    release: () => {},
  }),
  end:     async () => {},
  on:      () => {},
};

// ─── Vrai pool PostgreSQL ─────────────────────────────────────────────────────
const realPool = DB_URL
  ? new Pool({
      connectionString: DB_URL,
      min: 2,
      max: 10,
      idleTimeoutMillis:     30_000,
      connectionTimeoutMillis: 5_000,
    })
  : null;

if (realPool) {
  realPool.on('error', (err) => {
    console.error('[DB] Erreur inattendue sur une connexion idle :', err.message);
  });
}

// Pool exporté : réel si DATABASE_URL présent, sinon mock
const pool = realPool ?? mockPool;

/**
 * Teste la connexion à la base.
 * - Si DATABASE_URL absent  → log warning, retourne sans exception (mode no-DB)
 * - Si DATABASE_URL présent → tente la connexion, throw si inaccessible
 */
export async function checkConnection() {
  if (!DB_URL) {
    console.warn('[DB] Pas de DATABASE_URL — serveur démarré en mode no-DB (mock).');
    return;
  }
  const client = await pool.connect();
  try {
    await client.query('SELECT 1');
    console.log('[DB] Connexion PostgreSQL établie.');
  } finally {
    client.release();
  }
}

export default pool;
