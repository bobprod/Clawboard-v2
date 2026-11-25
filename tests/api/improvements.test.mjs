/**
 * Auto-amélioration des agents — tests du contrat API.
 *
 * Boucle testée : capture → analysis → détection → approbation → application
 * signée → provenance → modes → pause globale.
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setup, teardown } from '../setup/server.mjs';

const BASE = 'http://localhost:4000';

const AGENT = `test-agent-${Date.now()}`;
const AGENT_AUTO = `${AGENT}-auto`;
const AGENT_SAFE = `${AGENT}-safe`;

const post = (path, body) =>
  fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });

const get = (path) => fetch(`${BASE}${path}`);

async function capture(agentId, eventType, entityId, payload = {}) {
  const r = await post('/api/improvements/capture', {
    event_type: eventType,
    agent_id: agentId,
    entity_type: 'task',
    entity_id: entityId,
    payload,
  });
  assert.equal(r.status, 201, 'capture doit répondre 201');
  return (await r.json()).event;
}

async function cleanup() {
  try {
    // Le process de test n'hérite pas forcément du .env du serveur
    if (!process.env.DATABASE_URL) {
      try {
        process.loadEnvFile(new URL('../../.env', import.meta.url));
      } catch {
        /* pas de .env → rien à nettoyer */
      }
    }
    const { default: pool } = await import('../../src/db/client.js');
    const ids = [AGENT, AGENT_AUTO, AGENT_SAFE];
    await pool.query('DELETE FROM agent_events WHERE agent_id = ANY($1)', [ids]);
    await pool.query('DELETE FROM improvement_proposals WHERE agent_id = ANY($1)', [ids]);
    await pool.query('DELETE FROM improvement_provenance WHERE agent_id = ANY($1)', [ids]);
    await pool.query('DELETE FROM agent_improvement_modes WHERE agent_id = ANY($1)', [ids]);
    await pool.query('DELETE FROM agent_skills WHERE agent_id = ANY($1)', [ids]);
    await pool.query('DELETE FROM agent_rules WHERE agent_id = ANY($1)', [ids]);
    // Ferme le pool : sinon le process node --test ne se termine pas
    await pool.end();
  } catch (_) {
    /* nettoyage best-effort */
  }
}

describe('Auto-amélioration — API', () => {
  before(setup);
  after(async () => {
    await cleanup();
    await teardown();
  });

  test('POST /api/improvements/capture → 201 + source_hash calculée', async () => {
    const event = await capture(AGENT, 'tool_error', 'e1', { tool: 'exec' });
    assert.ok(event.id, 'id généré');
    assert.equal(event.agent_id, AGENT);
    assert.ok(event.source_hash && event.source_hash.length === 64, 'sha256 de la source');
    assert.ok(event.created_at, 'horodatage');
  });

  test('POST /api/improvements/capture → 400 si event_type invalide', async () => {
    const r = await post('/api/improvements/capture', {
      event_type: 'not_a_type',
      agent_id: AGENT,
    });
    assert.equal(r.status, 400);
  });

  test('POST /api/improvements/capture → 400 si agent_id absent', async () => {
    const r = await post('/api/improvements/capture', { event_type: 'tool_error' });
    assert.equal(r.status, 400);
  });

  test('GET /api/improvements/analysis → compteurs par type', async () => {
    await capture(AGENT, 'tool_error', 'e2', { tool: 'exec' });
    const r = await get(`/api/improvements/analysis?agent_id=${AGENT}`);
    assert.equal(r.status, 200);
    const body = await r.json();
    assert.ok(body.counts.tool_error >= 1, 'tool_error compté');
    assert.ok(Array.isArray(body.recent));
    assert.ok(Array.isArray(body.provenance));
  });

  test('POST /api/improvements/scan → détecte ≥3 occurrences et crée une proposition', async () => {
    await capture(AGENT, 'tool_error', 'repeat', { tool: 'exec' });
    await capture(AGENT, 'tool_error', 'repeat', { tool: 'exec' });
    await capture(AGENT, 'tool_error', 'repeat', { tool: 'exec' });

    const r = await post('/api/improvements/scan', {});
    assert.equal(r.status, 200);
    const body = await r.json();
    assert.ok(body.created >= 1, 'au moins une proposition créée');

    const list = await (await get(`/api/improvements/proposals?agent_id=${AGENT}`)).json();
    assert.ok(list.total >= 1);
    const proposal = list.proposals.find((p) => p.trigger_pattern.includes('repeat'));
    assert.ok(proposal, 'proposition liée au pattern répété');
    assert.equal(proposal.status, 'pending');
    assert.equal(proposal.counts.occurrences, 3);
    assert.equal(proposal.kind, 'agent_fix');
  });

  test('POST /api/improvements/proposals/:id/status → approbation', async () => {
    const list = await (await get(`/api/improvements/proposals?agent_id=${AGENT}`)).json();
    const proposal = list.proposals[0];
    const r = await post(`/api/improvements/proposals/${proposal.id}/status`, {
      status: 'approved',
      actor: 'tester',
    });
    assert.equal(r.status, 200);
    const body = await r.json();
    assert.equal(body.proposal.status, 'approved');
    assert.equal(body.proposal.approved_by, 'tester');
  });

  test('POST /api/improvements/proposals/:id/status → 400 statut invalide', async () => {
    const list = await (await get(`/api/improvements/proposals?agent_id=${AGENT}`)).json();
    const proposal = list.proposals[0];
    const r = await post(`/api/improvements/proposals/${proposal.id}/status`, {
      status: 'nimporte',
    });
    assert.equal(r.status, 400);
  });

  test('POST /api/improvements/proposals/:id/apply → applique + signe la provenance', async () => {
    const list = await (await get(`/api/improvements/proposals?agent_id=${AGENT}`)).json();
    const proposal = list.proposals.find((p) => p.kind === 'agent_fix');
    const r = await post(`/api/improvements/proposals/${proposal.id}/apply`, {
      actor: 'tester',
    });
    assert.equal(r.status, 200);
    const body = await r.json();
    assert.equal(body.applied, true);
    assert.ok(body.signature && body.signature.length === 64, 'signature HMAC');
    assert.equal(body.doc.sourceId, proposal.id);
    assert.equal(body.doc.actor, 'tester');

    const after = await (await get(`/api/improvements/proposals?agent_id=${AGENT}`)).json();
    const updated = after.proposals.find((p) => p.id === proposal.id);
    assert.equal(updated.status, 'applied');
    assert.ok(updated.provenance?.signature, 'provenance persistée');
  });

  test('POST /api/improvements/record-provenance → idempotent et vérifiable', async () => {
    const r1 = await post('/api/improvements/record-provenance', {
      source_id: `${AGENT}-src`,
      type: 'agent_fix',
      agent_id: AGENT,
      content: 'contenu de test',
    });
    assert.equal(r1.status, 200);
    const b1 = await r1.json();
    assert.equal(b1.verified, true);

    const r2 = await post('/api/improvements/record-provenance', {
      source_id: `${AGENT}-src`,
      type: 'agent_fix',
      agent_id: AGENT,
      content: 'contenu de test',
    });
    assert.equal(r2.status, 200);
    const b2 = await r2.json();
    assert.equal(b2.verified, true);
    assert.equal(b2.provenance.source_id, `${AGENT}-src`);
  });

  test('GET /api/improvements/control → pause globale + modes', async () => {
    const r = await get('/api/improvements/control');
    assert.equal(r.status, 200);
    const body = await r.json();
    assert.equal(typeof body.paused, 'boolean');
    assert.equal(body.default_mode, 'human');
    assert.ok(Array.isArray(body.modes));
  });

  test('POST /api/improvements/control → mode par agent + pause/reprise', async () => {
    const rMode = await post('/api/improvements/control', {
      agent_id: AGENT_AUTO,
      mode: 'auto',
    });
    assert.equal(rMode.status, 200);
    assert.equal((await rMode.json()).mode, 'auto');

    await post('/api/improvements/control', { action: 'pause' });
    let c = await (await get('/api/improvements/control')).json();
    assert.equal(c.paused, true);

    await post('/api/improvements/control', { action: 'resume' });
    c = await (await get('/api/improvements/control')).json();
    assert.equal(c.paused, false);
  });

  test('Mode auto → le scan auto-applique les propositions en attente', async () => {
    await capture(AGENT_AUTO, 'task_failed', 'auto-1', { err: 'x' });
    await capture(AGENT_AUTO, 'task_failed', 'auto-1', { err: 'x' });
    await capture(AGENT_AUTO, 'task_failed', 'auto-1', { err: 'x' });

    await post('/api/improvements/control', { agent_id: AGENT_AUTO, mode: 'auto' });
    await post('/api/improvements/scan', {});

    const list = await (await get(`/api/improvements/proposals?agent_id=${AGENT_AUTO}`)).json();
    const proposal = list.proposals.find((p) => p.trigger_pattern.includes('auto-1'));
    assert.ok(proposal, 'proposition détectée');
    assert.equal(proposal.status, 'applied', 'appliquée automatiquement en mode auto');
  });

  test('Mode human → aucune auto-application', async () => {
    await capture(AGENT_SAFE, 'task_failed', 'safe-1', { err: 'x' });
    await capture(AGENT_SAFE, 'task_failed', 'safe-1', { err: 'x' });
    await capture(AGENT_SAFE, 'task_failed', 'safe-1', { err: 'x' });

    await post('/api/improvements/control', { agent_id: AGENT_SAFE, mode: 'human' });
    await post('/api/improvements/scan', {});

    const list = await (await get(`/api/improvements/proposals?agent_id=${AGENT_SAFE}`)).json();
    const proposal = list.proposals.find((p) => p.trigger_pattern.includes('safe-1'));
    assert.ok(proposal);
    assert.equal(proposal.status, 'pending', 'reste en attente sans accord humain');
  });

  test('Pause globale → bloque toute auto-application', async () => {
    await post('/api/improvements/control', { agent_id: AGENT_AUTO, mode: 'auto' });
    await post('/api/improvements/control', { action: 'pause' });

    await capture(AGENT_AUTO, 'tool_error', 'paused-1', { tool: 'x' });
    await capture(AGENT_AUTO, 'tool_error', 'paused-1', { tool: 'x' });
    await capture(AGENT_AUTO, 'tool_error', 'paused-1', { tool: 'x' });
    await post('/api/improvements/scan', {});

    const list = await (await get(`/api/improvements/proposals?agent_id=${AGENT_AUTO}`)).json();
    const proposal = list.proposals.find((p) => p.trigger_pattern.includes('paused-1'));
    assert.ok(proposal);
    assert.equal(proposal.status, 'pending', 'rien ne s’applique pendant la pause');

    await post('/api/improvements/control', { action: 'resume' });
  });

  test('GET /api/improvements/proposals → liste normalisée', async () => {
    const r = await get(`/api/improvements/proposals?agent_id=${AGENT}`);
    assert.equal(r.status, 200);
    const body = await r.json();
    assert.ok(Array.isArray(body.proposals));
    assert.equal(typeof body.total, 'number');
    for (const p of body.proposals) {
      assert.ok(p.id);
      assert.ok(typeof p.counts.occurrences === 'number', 'occurrences numérique');
      assert.ok(['pending', 'approved', 'applied', 'rejected', 'escalated'].includes(p.status));
    }
  });
});
