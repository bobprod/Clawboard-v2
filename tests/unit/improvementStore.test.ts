/**
 * ImprovementStore — tests des backends (Git / Vault / SQL) et de la provenance.
 */
import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, rm, readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

import { createGitStore } from '../../src/lib/store/store_git.mjs';
import { createVaultStore } from '../../src/lib/store/store_vault.mjs';
import {
  sha256,
  signAgentProvenance,
  verifySignedSource,
  canonicalize,
} from '../../src/lib/store/provenance.mjs';

let dir: string;
let repo: string;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'clawboard-store-'));
  repo = join(dir, 'repo');
  execFileSync('git', ['init', '-q', repo], { stdio: 'ignore' });
  execFileSync('git', ['-C', repo, 'config', 'user.email', 'test@clawboard.local']);
  execFileSync('git', ['-C', repo, 'config', 'user.name', 'ClawBoard Test']);
  execFileSync('git', ['-C', repo, 'commit', '--allow-empty', '-qm', 'init'], {
    stdio: 'ignore',
  });
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('provenance', () => {
  test('canonicalize est stable quel que soit l’ordre des clés', () => {
    expect(canonicalize({ b: 1, a: 2 })).toBe(canonicalize({ a: 2, b: 1 }));
  });

  test('sha256 produit 64 caractères hexadécimaux', () => {
    expect(sha256('x')).toMatch(/^[a-f0-9]{64}$/);
  });

  test('une signature valide se vérifie, une signature truquée non', () => {
    const { signature, doc } = signAgentProvenance(
      { sourceId: 's1', sourceType: 'agent_fix', agentId: 'a1', body: 'hello' },
      'tester',
      'sql',
    );
    expect(verifySignedSource(doc, signature)).toBe(true);
    expect(verifySignedSource(doc, 'faux')).toBe(false);
    expect(verifySignedSource({ ...doc, body: 'modifié' }, signature)).toBe(false);
  });
});

describe('backend Vault', () => {
  test('écrit une compétence et la relit', async () => {
    const store = createVaultStore({ root: join(dir, 'vault') });
    await store.saveSkill('agent-a', 'ma-competence', '# Contenu', { origin: 'test' });

    const skills = await store.getSkills({ agentId: 'agent-a' });
    expect(skills).toHaveLength(1);
    expect(skills[0].name).toBe('ma-competence');
    expect(skills[0].content).toBe('# Contenu');
    expect(skills[0].hash).toBe(sha256('# Contenu'));
  });

  test('écrit une directive dans SOUL.md (idempotent)', async () => {
    const store = createVaultStore({ root: join(dir, 'vault') });
    await store.saveDirective('agent-b', 'Toujours vérifier les tests', {
      proposalId: 'p1',
      actor: 'tester',
    });
    await store.saveDirective('agent-b', 'Toujours vérifier les tests (v2)', {
      proposalId: 'p1',
      actor: 'tester',
    });

    const soul = await readFile(join(dir, 'vault', 'agents', 'agent-b', 'SOUL.md'), 'utf8');
    expect(soul).toContain('improvement:p1');
    expect(soul).toContain('Toujours vérifier les tests (v2)');
    expect(soul.match(/improvement:p1/g)?.length).toBe(1);
  });

  test('stocke une règle et la relit', async () => {
    const store = createVaultStore({ root: join(dir, 'vault') });
    await store.setRule('directive:agent-c', { text: 'règle' });
    const rule = await store.getRule('directive:agent-c');
    expect(rule?.value.text).toBe('règle');
  });

  test('neutralise les traversées de chemin', async () => {
    const store = createVaultStore({ root: join(dir, 'vault') });
    await store.saveSkill('../../evil', 'x', 'contenu', {});
    const files = await readdir(join(dir, 'vault', 'agents'));
    expect(files.every((f) => !f.includes('..'))).toBe(true);
    expect(existsSync(join(dir, 'evil'))).toBe(false);
    expect(existsSync(join(dir, 'vault', '..', 'evil'))).toBe(false);
  });
});

describe('backend Git', () => {
  test('écrit une compétence et crée un commit', async () => {
    const store = createGitStore({ gitRepo: repo });
    const res = await store.saveSkill('agent-git', 'skill-git', '# Git', { origin: 'test' });

    expect(res.commitSha).toBeTruthy();
    expect(res.versioned).toBe(true);

    const log = execFileSync('git', ['-C', repo, 'log', '--oneline'], {
      encoding: 'utf8',
    });
    expect(log).toContain('compétence skill-git');
  });

  test('la compétence est versionnée et relisible', async () => {
    const store = createGitStore({ gitRepo: repo });
    const skill = await store.getSkill('skill-git', { agentId: 'agent-git' });
    expect(skill?.content).toBe('# Git');

    const status = execFileSync('git', ['-C', repo, 'status', '--porcelain'], {
      encoding: 'utf8',
    });
    expect(status.trim()).toBe('');
  });

  test('la directive est écrite dans SOUL.md et commitée', async () => {
    const store = createGitStore({ gitRepo: repo });
    const res = await store.saveDirective('agent-git', 'Directive test', {
      proposalId: 'p-git',
    });
    expect(res.commitSha).toBeTruthy();
    const soul = await readFile(res.file, 'utf8');
    expect(soul).toContain('Directive test');
  });

  test('repli propre si le dossier n’est pas un dépôt git', async () => {
    const store = createGitStore({ gitRepo: join(dir, 'pas-un-repo') });
    const res = await store.saveSkill('agent-x', 's', 'c', {});
    expect(res.commitSha).toBeNull();
    expect(res.versioned).toBe(false);
  });
});
