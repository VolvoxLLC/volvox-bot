'use client';

import * as amplitude from '@amplitude/analytics-browser';

export const DASHBOARD_PAGE_VIEW_EVENT = 'dashboard_page_viewed';

type BrowserAmplitudeOptions = NonNullable<Parameters<typeof amplitude.init>[2]>;
type BrowserAmplitudeProperties = Record<string, unknown>;

const AMPLITUDE_MIN_ID_LENGTH = 5;
const SENSITIVE_KEY_PATTERN =
  /(?:authorization|cookie|csrf|secret|password|token|session|stack|x[-_]?forwarded[-_]?for|ip(?:[-_]?address)?|x[-_]?api[-_]?key|api[-_]?key|bot[-_]?api[-_]?secret|access[-_]?token|refresh[-_]?token|email)/i;
const INLINE_SECRET_PATTERNS = [
  /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi,
  /\bsk-[A-Za-z0-9][A-Za-z0-9_-]{10,}/g,
  /\b(?:xox[baprs]|gh[pousr])_[A-Za-z0-9_/-]{10,}/g,
];

let hasInitialized = false;
let activeUserId: string | undefined;

function getPublicApiKey(): string | undefined {
  const value = process.env.NEXT_PUBLIC_AMPLITUDE_API_KEY;
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function parseBoolean(value: string | undefined): boolean {
  return value === 'true';
}

function normalizeServerZone(value: string | undefined): 'US' | 'EU' {
  return value?.trim().toUpperCase() === 'EU' ? 'EU' : 'US';
}

function normalizeAmplitudeId(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length >= AMPLITUDE_MIN_ID_LENGTH ? trimmed : undefined;
}

function scrubInlineSecrets(value: string): string {
  return INLINE_SECRET_PATTERNS.reduce(
    (scrubbedValue, pattern) => scrubbedValue.replace(pattern, '[REDACTED]'),
    value,
  );
}

function scrubAmplitudeProperties(value: unknown, seen = new WeakSet<object>()): unknown {
  if (typeof value === 'string') {
    return scrubInlineSecrets(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => scrubAmplitudeProperties(item, seen));
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  if (seen.has(value)) {
    return '[Circular]';
  }

  seen.add(value);

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (value instanceof Error) {
    return {
      message: scrubInlineSecrets(value.message),
      name: value.name,
    };
  }

  const scrubbed: BrowserAmplitudeProperties = {};

  for (const [key, childValue] of Object.entries(value)) {
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      continue;
    }

    scrubbed[key] = scrubAmplitudeProperties(childValue, seen);
  }

  return scrubbed;
}

export function isDashboardAmplitudeEnabled(): boolean {
  return typeof window !== 'undefined' && Boolean(getPublicApiKey());
}

export function getBrowserAmplitudeOptions(): BrowserAmplitudeOptions {
  return {
    autocapture: parseBoolean(process.env.NEXT_PUBLIC_AMPLITUDE_AUTOCAPTURE)
      ? {
          attribution: true,
          elementInteractions: false,
          fileDownloads: false,
          formInteractions: false,
          frustrationInteractions: false,
          networkTracking: false,
          pageUrlEnrichment: true,
          pageViews: true,
          sessions: true,
          webVitals: false,
        }
      : false,
    logLevel: amplitude.Types.LogLevel.None,
    remoteConfig: {
      fetchRemoteConfig: false,
    },
    serverZone: normalizeServerZone(process.env.NEXT_PUBLIC_AMPLITUDE_SERVER_ZONE),
    trackingOptions: {
      ipAddress: false,
    },
  };
}

export function initDashboardAmplitude(userId?: string | null): boolean {
  const apiKey = getPublicApiKey();
  const normalizedUserId = normalizeAmplitudeId(userId);

  if (typeof window === 'undefined' || !apiKey) {
    return false;
  }

  try {
    if (!hasInitialized) {
      amplitude.init(apiKey, normalizedUserId, getBrowserAmplitudeOptions());
      hasInitialized = true;
      activeUserId = normalizedUserId;
      return true;
    }

    if (normalizedUserId && normalizedUserId !== activeUserId) {
      amplitude.setUserId(normalizedUserId);
      activeUserId = normalizedUserId;
    } else if (!normalizedUserId && activeUserId) {
      amplitude.reset();
      activeUserId = undefined;
    }

    return true;
  } catch {
    return false;
  }
}

export function trackDashboardEvent(
  eventName: string,
  eventProperties: BrowserAmplitudeProperties = {},
): boolean {
  const normalizedEventName = eventName.trim();

  if (!normalizedEventName || !initDashboardAmplitude(activeUserId)) {
    return false;
  }

  try {
    amplitude.track(
      normalizedEventName,
      scrubAmplitudeProperties(eventProperties) as BrowserAmplitudeProperties,
    );
    return true;
  } catch {
    return false;
  }
}
