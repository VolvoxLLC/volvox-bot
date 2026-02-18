/**
 * Template variable interpolation utility
 * Supports: {{date}}, {{datetime}}, {{project}}, {{author}}, {{sprint}}, {{custom:label}}
 */

export interface VariableContext {
  project?: string;
  author?: string;
  sprint?: string;
  customVars?: Record<string, string>;
}

/**
 * Extract all custom variable names from a template string
 * Returns array of variable names (e.g., ["name", "version"] from "{{custom:name}} {{custom:version}}")
 */
export function extractCustomVariables(template: string): string[] {
  const customVarRegex = /\{\{custom:([a-zA-Z0-9_-]+)\}\}/g;
  const matches = [...template.matchAll(customVarRegex)];
  const varNames = matches.map(m => m[1]);
  // Return unique names
  return [...new Set(varNames)];
}

/**
 * Interpolate variables in a template string
 */
export function interpolateVariables(
  template: string | undefined,
  context: VariableContext
): string {
  if (!template) return '';

  let result = template;

  // {{date}} - Current date (YYYY-MM-DD)
  result = result.replace(/\{\{date\}\}/g, () => {
    const now = new Date();
    return now.toISOString().split('T')[0];
  });

  // {{datetime}} - ISO timestamp
  result = result.replace(/\{\{datetime\}\}/g, () => {
    return new Date().toISOString();
  });

  // {{project}} - Project name
  if (context.project) {
    result = result.replace(/\{\{project\}\}/g, context.project);
  }

  // {{author}} - Template user
  if (context.author) {
    result = result.replace(/\{\{author\}\}/g, context.author);
  }

  // {{sprint}} - Current sprint number
  if (context.sprint) {
    result = result.replace(/\{\{sprint\}\}/g, context.sprint);
  }

  // {{custom:label}} - User-provided custom variables
  if (context.customVars) {
    Object.entries(context.customVars).forEach(([key, value]) => {
      const regex = new RegExp(`\\{\\{custom:${key}\\}\\}`, 'g');
      result = result.replace(regex, value);
    });
  }

  return result;
}

/**
 * Check if a template contains any unresolved variables
 */
export function hasUnresolvedVariables(template: string): boolean {
  return /\{\{[^}]+\}\}/.test(template);
}

/**
 * Get all unresolved variable names from a template
 */
export function getUnresolvedVariables(template: string): string[] {
  const regex = /\{\{([^}]+)\}\}/g;
  const matches = [...template.matchAll(regex)];
  return matches.map(m => m[1]);
}
