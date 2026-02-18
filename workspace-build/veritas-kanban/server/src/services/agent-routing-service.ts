/**
 * AgentRoutingService - Task-aware agent/model routing
 *
 * Matches task metadata (type, priority, project, complexity) against
 * user-configured routing rules to select the optimal agent and model.
 *
 * Rules are evaluated in order — first match wins.
 * Falls back to the configured default when no rules match.
 */

import { ConfigService } from './config-service.js';
import {
  DEFAULT_ROUTING_CONFIG,
  type AgentRoutingConfig,
  type RoutingRule,
  type RoutingResult,
  type RoutingMatchCriteria,
} from '@veritas-kanban/shared';
import type { Task, AgentType, TaskPriority } from '@veritas-kanban/shared';
import { createLogger } from '../lib/logger.js';

const log = createLogger('agent-routing');

export class AgentRoutingService {
  private configService: ConfigService;

  constructor(configService?: ConfigService) {
    this.configService = configService || new ConfigService();
  }

  /**
   * Resolve the best agent for a given task.
   *
   * @param task - Full task object (or partial with type/priority/project/subtasks)
   * @returns RoutingResult with the selected agent, optional model, fallback, and reasoning
   */
  async resolveAgent(
    task: Pick<Task, 'type' | 'priority' | 'project' | 'subtasks'>
  ): Promise<RoutingResult> {
    const config = await this.configService.getConfig();
    const routing: AgentRoutingConfig = config.agentRouting || DEFAULT_ROUTING_CONFIG;

    // If routing is disabled, return the global default
    if (!routing.enabled) {
      return {
        agent: routing.defaultAgent || config.defaultAgent,
        model: routing.defaultModel,
        reason: 'Routing disabled — using default agent',
      };
    }

    // Evaluate rules in order (first match wins)
    for (const rule of routing.rules) {
      if (!rule.enabled) continue;

      if (this.matchesRule(task, rule.match)) {
        // Verify the agent is actually configured and enabled
        const agentConfig = config.agents.find(
          (a: { type: string; name: string; command: string; args: string[]; enabled: boolean }) =>
            a.type === rule.agent
        );
        if (!agentConfig?.enabled) {
          log.warn(`Rule "${rule.name}" matched but agent "${rule.agent}" is disabled — skipping`);
          continue;
        }

        log.info(
          `Task [type=${task.type}, priority=${task.priority}] matched rule "${rule.name}" → ${rule.agent}${rule.model ? ` (${rule.model})` : ''}`
        );
        return {
          agent: rule.agent,
          model: rule.model,
          fallback: rule.fallback,
          rule: rule.id,
          reason: `Matched rule: ${rule.name}`,
        };
      }
    }

    // No rule matched — use defaults
    log.info(
      `Task [type=${task.type}, priority=${task.priority}] — no rules matched, using default: ${routing.defaultAgent}`
    );
    return {
      agent: routing.defaultAgent || config.defaultAgent,
      model: routing.defaultModel,
      reason: 'No routing rules matched — using default agent',
    };
  }

  /**
   * Get the fallback agent for a given primary agent.
   * Used when an agent fails and `fallbackOnFailure` is enabled.
   */
  async getFallback(
    task: Pick<Task, 'type' | 'priority' | 'project' | 'subtasks'>,
    failedAgent: AgentType
  ): Promise<RoutingResult | null> {
    const config = await this.configService.getConfig();
    const routing: AgentRoutingConfig = config.agentRouting || DEFAULT_ROUTING_CONFIG;

    if (!routing.fallbackOnFailure) {
      return null;
    }

    // Find the rule that originally matched (to get its fallback)
    for (const rule of routing.rules) {
      if (!rule.enabled) continue;
      if (rule.agent !== failedAgent) continue;
      if (!rule.fallback) continue;
      if (!this.matchesRule(task, rule.match)) continue;

      const fallbackConfig = config.agents.find(
        (a: { type: string; name: string; command: string; args: string[]; enabled: boolean }) =>
          a.type === rule.fallback
      );
      if (!fallbackConfig?.enabled) {
        log.warn(`Fallback agent "${rule.fallback}" for rule "${rule.name}" is disabled`);
        continue;
      }

      log.info(`Falling back from ${failedAgent} → ${rule.fallback} (rule: ${rule.name})`);
      return {
        agent: rule.fallback,
        rule: rule.id,
        reason: `Fallback: ${failedAgent} failed → ${rule.fallback} (rule: ${rule.name})`,
      };
    }

    // No specific fallback found — try default if it's different from failed
    const defaultAgent = routing.defaultAgent || config.defaultAgent;
    if (defaultAgent !== failedAgent) {
      const defaultConfig = config.agents.find(
        (a: { type: string; name: string; command: string; args: string[]; enabled: boolean }) =>
          a.type === defaultAgent
      );
      if (defaultConfig?.enabled) {
        return {
          agent: defaultAgent,
          model: routing.defaultModel,
          reason: `Fallback: ${failedAgent} failed → default agent (${defaultAgent})`,
        };
      }
    }

    return null;
  }

  /**
   * Get the current routing config (for UI display).
   */
  async getRoutingConfig(): Promise<AgentRoutingConfig> {
    const config = await this.configService.getConfig();
    return config.agentRouting || DEFAULT_ROUTING_CONFIG;
  }

  /**
   * Update routing config.
   */
  async updateRoutingConfig(routing: AgentRoutingConfig): Promise<AgentRoutingConfig> {
    // Validate rule IDs are unique
    const ids = routing.rules.map(
      (r: { id: string; name: string; enabled: boolean; agent: string; match: any }) => r.id
    );
    const uniqueIds = new Set(ids);
    if (ids.length !== uniqueIds.size) {
      throw new Error('Routing rule IDs must be unique');
    }

    // Validate maxRetries range
    if (routing.maxRetries < 0 || routing.maxRetries > 3) {
      throw new Error('maxRetries must be between 0 and 3');
    }

    const config = await this.configService.getConfig();
    await this.configService.saveConfig({ ...config, agentRouting: routing });
    return routing;
  }

  // ─── Private helpers ───────────────────────────────────────────

  /**
   * Check if a task matches a rule's criteria.
   * All specified criteria must match (AND logic).
   * Unspecified criteria are ignored (wildcard).
   */
  private matchesRule(
    task: Pick<Task, 'type' | 'priority' | 'project' | 'subtasks'>,
    match: RoutingMatchCriteria
  ): boolean {
    // Type check
    if (match.type !== undefined) {
      if (!this.matchesValue(task.type, match.type)) return false;
    }

    // Priority check
    if (match.priority !== undefined) {
      if (!this.matchesValue(task.priority, match.priority)) return false;
    }

    // Project check
    if (match.project !== undefined) {
      if (!task.project) return false;
      if (!this.matchesValue(task.project, match.project)) return false;
    }

    // Complexity (subtask count)
    if (match.minSubtasks !== undefined) {
      const subtaskCount = task.subtasks?.length ?? 0;
      if (subtaskCount < match.minSubtasks) return false;
    }

    return true;
  }

  /**
   * Check if a value matches a single value or array of acceptable values.
   */
  private matchesValue<T>(actual: T, expected: T | T[]): boolean {
    if (Array.isArray(expected)) {
      return expected.includes(actual);
    }
    return actual === expected;
  }
}

// Singleton
let _instance: AgentRoutingService | null = null;

export function getAgentRoutingService(): AgentRoutingService {
  if (!_instance) {
    _instance = new AgentRoutingService();
  }
  return _instance;
}
