/**
 * skill-loader.mjs — Skill loader for Clawboard.
 *
 * Scans skills/ directory for skill.json files, loads definitions,
 * validates format, hot-reloads on file change.
 */
import { readdir, readFile, stat, watch } from "fs/promises";
import { join, resolve } from "path";
import { existsSync } from "fs";

// ─── Validation ──────────────────────────────────────────────────────────────

const REQUIRED_FIELDS = ["name", "version", "description"];

function validateSkill(skill, filePath) {
  const errors = [];
  for (const field of REQUIRED_FIELDS) {
    if (!skill[field] || typeof skill[field] !== "string") {
      errors.push(`Missing or invalid required field: ${field}`);
    }
  }
  if (skill.tools && !Array.isArray(skill.tools)) {
    errors.push("tools must be an array");
  }
  if (skill.prompt_template && typeof skill.prompt_template !== "string") {
    errors.push("prompt_template must be a string");
  }
  if (skill.inputs && !Array.isArray(skill.inputs)) {
    errors.push("inputs must be an array");
  }
  if (skill.outputs && !Array.isArray(skill.outputs)) {
    errors.push("outputs must be an array");
  }
  if (errors.length > 0) {
    return { valid: false, errors, filePath };
  }
  return { valid: true };
}

// ─── Skill Loader ────────────────────────────────────────────────────────────

export class SkillLoader {
  /**
   * @param {Object} opts
   * @param {string} opts.skillsDir - path to skills directory
   * @param {boolean} opts.hotReload - enable file watching (default: true)
   */
  constructor(opts = {}) {
    this.skillsDir = resolve(opts.skillsDir || "skills");
    this.hotReload = opts.hotReload !== false;
    this.skills = new Map(); // name -> skill definition
    this.errors = []; // loading errors
    this._watcher = null;
    this._debounceTimer = null;
    this._listeners = new Set();
  }

  /**
   * Load all skills from disk.
   */
  async load() {
    this.skills.clear();
    this.errors = [];

    if (!existsSync(this.skillsDir)) {
      return { skills: [], errors: [] };
    }

    const entries = await readdir(this.skillsDir, { withFileTypes: true });
    const loadPromises = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const skillJsonPath = join(this.skillsDir, entry.name, "skill.json");
      if (existsSync(skillJsonPath)) {
        loadPromises.push(this._loadOne(skillJsonPath, entry.name));
      }
    }

    await Promise.all(loadPromises);

    if (this.hotReload && !this._watcher) {
      this._startWatcher();
    }

    return { skills: this.list(), errors: this.errors };
  }

  async _loadOne(filePath, dirName) {
    try {
      const raw = await readFile(filePath, "utf-8");
      const skill = JSON.parse(raw);

      const validation = validateSkill(skill, filePath);
      if (!validation.valid) {
        this.errors.push({
          file: filePath,
          errors: validation.errors,
        });
        return;
      }

      // Normalize and enrich
      const normalized = {
        name: skill.name,
        version: skill.version || "1.0.0",
        description: skill.description || "",
        type: skill.type || "builtin",
        tools: skill.tools || [],
        prompt_template: skill.prompt_template || "",
        inputs: skill.inputs || [],
        outputs: skill.outputs || [],
        tags: skill.tags || [],
        author: skill.author || "clawboard",
        enabled: skill.enabled !== false,
        dirName,
        filePath,
        loadedAt: new Date().toISOString(),
      };

      this.skills.set(normalized.name, normalized);
    } catch (err) {
      this.errors.push({
        file: filePath,
        errors: [`Failed to parse: ${err.message}`],
      });
    }
  }

  /**
   * Get list of all loaded skills.
   * @returns {Array<Object>}
   */
  list() {
    return Array.from(this.skills.values());
  }

  /**
   * Get a skill by name.
   * @param {string} name
   * @returns {Object|undefined}
   */
  get(name) {
    return this.skills.get(name);
  }

  /**
   * Get enabled skills only.
   * @returns {Array<Object>}
   */
  listEnabled() {
    return this.list().filter((s) => s.enabled);
  }

  /**
   * Enable/disable a skill by name.
   * @param {string} name
   * @param {boolean} enabled
   * @returns {boolean} success
   */
  setEnabled(name, enabled) {
    const skill = this.skills.get(name);
    if (!skill) return false;
    skill.enabled = enabled;
    this._notify("change", { name, enabled });
    return true;
  }

  /**
   * Subscribe to loader events.
   * @param {Function} fn - (event, data) => void
   * @returns {Function} unsubscribe
   */
  onChange(fn) {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }

  _notify(event, data) {
    for (const fn of this._listeners) {
      try { fn(event, data); } catch { /* ignore */ }
    }
  }

  async _startWatcher() {
    try {
      this._watcher = watch(this.skillsDir, { recursive: true }, () => {
        // Debounce rapid changes
        clearTimeout(this._debounceTimer);
        this._debounceTimer = setTimeout(async () => {
          await this.load();
          this._notify("reload", { count: this.skills.size });
        }, 300);
      });
    } catch {
      // Watch not supported on this platform, skip
    }
  }

  /**
   * Stop watching and clean up.
   */
  async close() {
    if (this._watcher) {
      this._watcher.close();
      this._watcher = null;
    }
    clearTimeout(this._debounceTimer);
    this._listeners.clear();
  }
}

// ─── Singleton convenience ───────────────────────────────────────────────────

let _defaultLoader = null;

/**
 * Get or create the default skill loader.
 * @param {Object} opts
 * @returns {SkillLoader}
 */
export function getSkillLoader(opts = {}) {
  if (!_defaultLoader) {
    _defaultLoader = new SkillLoader(opts);
  }
  return _defaultLoader;
}
