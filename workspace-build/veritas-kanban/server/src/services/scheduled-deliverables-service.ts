/**
 * Scheduled Deliverables Service
 *
 * Manages recurring agent workflows and their outputs.
 * Think: daily pulses, weekly audits, scheduled reports.
 *
 * Inspired by @nateherk's Klouse scheduled deliverables view.
 */

import { createLogger } from '../lib/logger.js';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), '..', '.veritas-kanban');

const log = createLogger('deliverables');

// ─── Types ───────────────────────────────────────────────────────

export type DeliverableSchedule = 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'custom';

export interface Deliverable {
  id: string;
  /** Display name */
  name: string;
  /** Description of what this deliverable produces */
  description: string;
  /** Schedule type */
  schedule: DeliverableSchedule;
  /** Cron expression (for custom schedules) */
  cronExpr?: string;
  /** Human-readable schedule description */
  scheduleDescription: string;
  /** Is this deliverable active? */
  enabled: boolean;
  /** Agent responsible for producing this */
  agent?: string;
  /** Output directory (relative to docs root) */
  outputPath?: string;
  /** Tags for categorization */
  tags: string[];
  /** Creation timestamp */
  createdAt: string;
  /** Last run timestamp */
  lastRunAt?: string;
  /** Next scheduled run */
  nextRunAt?: string;
  /** Total runs completed */
  totalRuns: number;
}

export interface DeliverableRun {
  id: string;
  deliverableId: string;
  /** Status of this run */
  status: 'success' | 'failed' | 'skipped';
  /** Output file path (if produced) */
  outputFile?: string;
  /** Summary of what was produced */
  summary?: string;
  /** Duration in milliseconds */
  durationMs?: number;
  /** Error message if failed */
  error?: string;
  /** Run timestamp */
  runAt: string;
}

// ─── Service ─────────────────────────────────────────────────────

class ScheduledDeliverablesService {
  private deliverables: Deliverable[] = [];
  private runs: DeliverableRun[] = [];
  private loaded = false;

  private get deliverablesPath(): string {
    return path.join(DATA_DIR, 'scheduled-deliverables.json');
  }

  private get runsPath(): string {
    return path.join(DATA_DIR, 'deliverable-runs.json');
  }

  private async ensureLoaded(): Promise<void> {
    if (this.loaded) return;
    try {
      const data = await fs.readFile(this.deliverablesPath, 'utf-8');
      this.deliverables = JSON.parse(data);
    } catch {
      this.deliverables = [];
    }
    try {
      const data = await fs.readFile(this.runsPath, 'utf-8');
      this.runs = JSON.parse(data);
      // Keep only last 500 runs
      if (this.runs.length > 500) {
        this.runs = this.runs.slice(-500);
      }
    } catch {
      this.runs = [];
    }
    this.loaded = true;
  }

  private async saveDeliverables(): Promise<void> {
    await fs.writeFile(this.deliverablesPath, JSON.stringify(this.deliverables, null, 2));
  }

  private async saveRuns(): Promise<void> {
    await fs.writeFile(this.runsPath, JSON.stringify(this.runs, null, 2));
  }

  /**
   * Create a new scheduled deliverable.
   */
  async create(params: {
    name: string;
    description: string;
    schedule: DeliverableSchedule;
    cronExpr?: string;
    scheduleDescription?: string;
    agent?: string;
    outputPath?: string;
    tags?: string[];
    enabled?: boolean;
  }): Promise<Deliverable> {
    await this.ensureLoaded();

    const scheduleDesc = params.scheduleDescription || this.describeSchedule(params.schedule, params.cronExpr);

    const deliverable: Deliverable = {
      id: `del_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: params.name,
      description: params.description,
      schedule: params.schedule,
      cronExpr: params.cronExpr,
      scheduleDescription: scheduleDesc,
      enabled: params.enabled ?? true,
      agent: params.agent,
      outputPath: params.outputPath,
      tags: params.tags || [],
      createdAt: new Date().toISOString(),
      totalRuns: 0,
    };

    this.deliverables.push(deliverable);
    await this.saveDeliverables();
    log.info({ id: deliverable.id, name: deliverable.name }, 'Deliverable created');
    return deliverable;
  }

  /**
   * Update a deliverable.
   */
  async update(id: string, update: Partial<Pick<Deliverable, 'name' | 'description' | 'schedule' | 'cronExpr' | 'scheduleDescription' | 'enabled' | 'agent' | 'outputPath' | 'tags'>>): Promise<Deliverable | null> {
    await this.ensureLoaded();
    const del = this.deliverables.find((d) => d.id === id);
    if (!del) return null;

    Object.assign(del, update);
    if (update.schedule || update.cronExpr) {
      del.scheduleDescription = update.scheduleDescription || this.describeSchedule(del.schedule, del.cronExpr);
    }

    await this.saveDeliverables();
    return del;
  }

  /**
   * Delete a deliverable.
   */
  async delete(id: string): Promise<boolean> {
    await this.ensureLoaded();
    const before = this.deliverables.length;
    this.deliverables = this.deliverables.filter((d) => d.id !== id);
    if (this.deliverables.length === before) return false;
    await this.saveDeliverables();
    return true;
  }

  /**
   * Record a run for a deliverable.
   */
  async recordRun(params: {
    deliverableId: string;
    status: 'success' | 'failed' | 'skipped';
    outputFile?: string;
    summary?: string;
    durationMs?: number;
    error?: string;
  }): Promise<DeliverableRun> {
    await this.ensureLoaded();

    const run: DeliverableRun = {
      id: `run_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      deliverableId: params.deliverableId,
      status: params.status,
      outputFile: params.outputFile,
      summary: params.summary,
      durationMs: params.durationMs,
      error: params.error,
      runAt: new Date().toISOString(),
    };

    this.runs.push(run);

    // Update deliverable
    const del = this.deliverables.find((d) => d.id === params.deliverableId);
    if (del) {
      del.lastRunAt = run.runAt;
      del.totalRuns++;
      del.nextRunAt = this.calculateNextRun(del);
      await this.saveDeliverables();
    }

    await this.saveRuns();
    return run;
  }

  /**
   * List all deliverables.
   */
  async list(filters?: { enabled?: boolean; agent?: string; tag?: string }): Promise<Deliverable[]> {
    await this.ensureLoaded();

    let results = [...this.deliverables];
    if (filters?.enabled !== undefined) {
      results = results.filter((d) => d.enabled === filters.enabled);
    }
    if (filters?.agent) {
      results = results.filter((d) => d.agent === filters.agent);
    }
    if (filters?.tag) {
      results = results.filter((d) => d.tags.includes(filters.tag!));
    }

    return results.sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Get a specific deliverable with its recent runs.
   */
  async get(id: string): Promise<{ deliverable: Deliverable; recentRuns: DeliverableRun[] } | null> {
    await this.ensureLoaded();
    const deliverable = this.deliverables.find((d) => d.id === id);
    if (!deliverable) return null;

    const recentRuns = this.runs
      .filter((r) => r.deliverableId === id)
      .sort((a, b) => new Date(b.runAt).getTime() - new Date(a.runAt).getTime())
      .slice(0, 20);

    return { deliverable, recentRuns };
  }

  /**
   * Get runs for a deliverable.
   */
  async getRuns(deliverableId: string, limit = 20): Promise<DeliverableRun[]> {
    await this.ensureLoaded();
    return this.runs
      .filter((r) => r.deliverableId === deliverableId)
      .sort((a, b) => new Date(b.runAt).getTime() - new Date(a.runAt).getTime())
      .slice(0, limit);
  }

  // ─── Private ─────────────────────────────────────────────────

  private describeSchedule(schedule: DeliverableSchedule, cronExpr?: string): string {
    switch (schedule) {
      case 'daily': return 'Every day';
      case 'weekly': return 'Every week';
      case 'biweekly': return 'Every 2 weeks';
      case 'monthly': return 'Every month';
      case 'custom': return cronExpr ? `Cron: ${cronExpr}` : 'Custom schedule';
    }
  }

  private calculateNextRun(del: Deliverable): string {
    const lastRun = del.lastRunAt ? new Date(del.lastRunAt) : new Date();
    const next = new Date(lastRun);

    switch (del.schedule) {
      case 'daily': next.setDate(next.getDate() + 1); break;
      case 'weekly': next.setDate(next.getDate() + 7); break;
      case 'biweekly': next.setDate(next.getDate() + 14); break;
      case 'monthly': next.setMonth(next.getMonth() + 1); break;
      default: next.setDate(next.getDate() + 1); break;
    }

    return next.toISOString();
  }
}

// Singleton
let instance: ScheduledDeliverablesService | null = null;

export function getScheduledDeliverablesService(): ScheduledDeliverablesService {
  if (!instance) {
    instance = new ScheduledDeliverablesService();
  }
  return instance;
}
