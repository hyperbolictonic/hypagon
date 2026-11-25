/**
 * Script vault surface.
 *
 * Owns saving, recalling and running user scripts, and reports the agent's
 * acting/idle state around a run. The active tab supplies the execution target;
 * the chassis supplies the log and the harvest-shaped telemetry.
 */
import type { WebContents } from 'electron';
import type { ScriptItem } from '../cortex/cortex-db.js';
import { ScriptVault } from './script-vault.js';

/** Dependencies the script surface needs from the active tab and telemetry. */
export interface ScriptsSurfaceDeps {
  activeWebContents(): WebContents;
  log(level: 'info' | 'warn' | 'action', message: string): void;
  reportActing(): void;
  reportIdle(): void;
  emitHarvest(details: string): void;
}

/** The saved-script vault behind the script routes. */
export class ScriptsSurface {
  private readonly vault = new ScriptVault();

  constructor(private readonly deps: ScriptsSurfaceDeps) {}

  async save(data: {
    name: string;
    code: string;
    description?: string;
    domain?: string;
    tags?: string[];
  }): Promise<ScriptItem> {
    this.deps.log('action', `MCP Directive: save_script("${data.name}")`);
    const saved = await this.vault.saveScript(data);
    this.deps.emitHarvest(`Saved & indexed script "${saved.name}" in Cortex Vault`);
    return saved;
  }

  async recall(query?: string, options?: { domain?: string; tag?: string; limit?: number }): Promise<ScriptItem[]> {
    this.deps.log('action', `MCP Directive: recall_scripts("${query || '*'}")`);
    return await this.vault.recallScripts(query, options);
  }

  async run(name: string, args: Record<string, any> = {}) {
    const wc = this.deps.activeWebContents();
    this.deps.log('action', `MCP Directive: run_script("${name}")`);
    this.deps.reportActing();
    try {
      const result = await this.vault.runScript(wc, name, args);
      this.deps.reportIdle();
      this.deps.emitHarvest(`Executed macro "${name}" in ${result.executionDurationMs}ms`);
      return result;
    } catch (error) {
      this.deps.reportIdle();
      throw error;
    }
  }

  async list(domain?: string, tag?: string): Promise<ScriptItem[]> {
    return await this.vault.listScripts(domain, tag);
  }

  async remove(name: string): Promise<boolean> {
    this.deps.log('action', `MCP Directive: delete_script("${name}")`);
    return await this.vault.deleteScript(name);
  }
}
