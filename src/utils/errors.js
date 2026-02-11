/**
 * Error Classification and User-Friendly Messages
 *
 * Provides utilities for classifying errors and generating
 * helpful error messages for users.
 */

/**
 * Error type classifications
 */
export const ErrorType = {
  // Network-related errors
  NETWORK: 'network',
  TIMEOUT: 'timeout',

  // API errors
  API_ERROR: 'api_error',
  API_RATE_LIMIT: 'api_rate_limit',
  API_UNAUTHORIZED: 'api_unauthorized',
  API_NOT_FOUND: 'api_not_found',
  API_SERVER_ERROR: 'api_server_error',

  // Discord-specific errors
  DISCORD_PERMISSION: 'discord_permission',
  DISCORD_CHANNEL_NOT_FOUND: 'discord_channel_not_found',
  DISCORD_MISSING_ACCESS: 'discord_missing_access',

  // Configuration errors
  CONFIG_MISSING: 'config_missing',
  CONFIG_INVALID: 'config_invalid',

  // Unknown/generic errors
  UNKNOWN: 'unknown',
};

/**
 * Classify an error into a specific error type
 *
 * @param {Error} error - The error to classify
 * @param {Object} context - Optional context (response, statusCode, etc.)
 * @returns {string} Error type from ErrorType enum
 */
export function classifyError(error, context = {}) {
  if (!error) return ErrorType.UNKNOWN;

  const message = error.message?.toLowerCase() || '';
  const code = error.code || context.code;
  const status = error.status || context.status || context.statusCode;

  // Network errors
  if (code === 'ECONNREFUSED' || code === 'ENOTFOUND') {
    return ErrorType.NETWORK;
  }
  if (code === 'ETIMEDOUT' || message.includes('timeout')) {
    return ErrorType.TIMEOUT;
  }
  if (message.includes('fetch failed') || message.includes('network')) {
    return ErrorType.NETWORK;
  }

  // HTTP status code errors
  if (status) {
    if (status === 401 || status === 403) {
      return ErrorType.API_UNAUTHORIZED;
    }
    if (status === 404) {
      return ErrorType.API_NOT_FOUND;
    }
    if (status === 429) {
      return ErrorType.API_RATE_LIMIT;
    }
    if (status >= 500) {
      return ErrorType.API_SERVER_ERROR;
    }
    if (status >= 400) {
      return ErrorType.API_ERROR;
    }
  }

  // Discord-specific errors
  if (code === 50001 || message.includes('missing access')) {
    return ErrorType.DISCORD_MISSING_ACCESS;
  }
  if (code === 50013 || message.includes('missing permissions')) {
    return ErrorType.DISCORD_PERMISSION;
  }
  if (code === 10003 || message.includes('unknown channel')) {
    return ErrorType.DISCORD_CHANNEL_NOT_FOUND;
  }

  // Config errors
  if (message.includes('config.json not found') || message.includes('enoent')) {
    return ErrorType.CONFIG_MISSING;
  }
  if (message.includes('invalid') && message.includes('config')) {
    return ErrorType.CONFIG_INVALID;
  }

  // API errors (generic)
  if (message.includes('api error') || context.isApiError) {
    return ErrorType.API_ERROR;
  }

  return ErrorType.UNKNOWN;
}

/**
 * Get a user-friendly error message based on error type
 *
 * @param {Error} error - The error object
 * @param {Object} context - Optional context for more specific messages
 * @returns {string} User-friendly error message
 */
export function getUserFriendlyMessage(error, context = {}) {
  const errorType = classifyError(error, context);

  const messages = {
    [ErrorType.NETWORK]:
      "I'm having trouble connecting to my brain right now. Check if the AI service is running and try again!",

    [ErrorType.TIMEOUT]:
      'That took too long to process. Try again with a shorter message, or wait a moment and retry!',

    [ErrorType.API_RATE_LIMIT]:
      "Whoa, too many requests! Let's take a quick breather. Try again in a minute.",

    [ErrorType.API_UNAUTHORIZED]:
      "I'm having authentication issues with the AI service. An admin needs to check the API credentials.",

    [ErrorType.API_NOT_FOUND]:
      "The AI service endpoint isn't responding. Please check if it's configured correctly.",

    [ErrorType.API_SERVER_ERROR]:
      'The AI service is having technical difficulties. It should recover automatically - try again in a moment!',

    [ErrorType.API_ERROR]:
      'Something went wrong with the AI service. Give it another shot in a moment!',

    [ErrorType.DISCORD_PERMISSION]:
      "I don't have permission to do that! An admin needs to check my role permissions.",

    [ErrorType.DISCORD_CHANNEL_NOT_FOUND]:
      "I can't find that channel. It might have been deleted, or I don't have access to it.",

    [ErrorType.DISCORD_MISSING_ACCESS]:
      "I don't have access to that resource. Please check my permissions!",

    [ErrorType.CONFIG_MISSING]:
      'Configuration file not found! Please create a config.json file (you can copy from config.example.json).',

    [ErrorType.CONFIG_INVALID]:
      'The configuration file has errors. Please check config.json for syntax errors or missing required fields.',

    [ErrorType.UNKNOWN]:
      'Something unexpected happened. Try again, and if it keeps happening, check the logs for details.',
  };

  return messages[errorType] || messages[ErrorType.UNKNOWN];
}

/**
 * Get suggested next steps for an error
 *
 * @param {Error} error - The error object
 * @param {Object} context - Optional context
 * @returns {string|null} Suggested next steps or null if none
 */
export function getSuggestedNextSteps(error, context = {}) {
  const errorType = classifyError(error, context);

  const suggestions = {
    [ErrorType.NETWORK]: 'Make sure the AI service (OpenClaw) is running and accessible.',

    [ErrorType.TIMEOUT]: 'Try a shorter message or wait a moment before retrying.',

    [ErrorType.API_RATE_LIMIT]: 'Wait 60 seconds before trying again.',

    [ErrorType.API_UNAUTHORIZED]:
      'Check the OPENCLAW_API_KEY environment variable (or legacy OPENCLAW_TOKEN) and API credentials.',

    [ErrorType.API_NOT_FOUND]:
      'Verify OPENCLAW_API_URL (or legacy OPENCLAW_URL) points to the correct endpoint.',

    [ErrorType.API_SERVER_ERROR]:
      'The service should recover automatically. If it persists, restart the AI service.',

    [ErrorType.DISCORD_PERMISSION]:
      'Grant the bot appropriate permissions in Server Settings > Roles.',

    [ErrorType.DISCORD_CHANNEL_NOT_FOUND]:
      'Update the channel ID in config.json or verify the channel exists.',

    [ErrorType.DISCORD_MISSING_ACCESS]:
      'Ensure the bot has access to the required channels and roles.',

    [ErrorType.CONFIG_MISSING]:
      'Create config.json from config.example.json and fill in your settings.',

    [ErrorType.CONFIG_INVALID]: 'Validate your config.json syntax using a JSON validator.',
  };

  return suggestions[errorType] || null;
}

/**
 * Check if an error is retryable (transient failure)
 *
 * @param {Error} error - The error to check
 * @param {Object} context - Optional context
 * @returns {boolean} True if the error should be retried
 */
export function isRetryable(error, context = {}) {
  const errorType = classifyError(error, context);

  // Only retry transient failures, not user/config errors
  const retryableTypes = [
    ErrorType.NETWORK,
    ErrorType.TIMEOUT,
    ErrorType.API_SERVER_ERROR,
    ErrorType.API_RATE_LIMIT,
  ];

  return retryableTypes.includes(errorType);
}
