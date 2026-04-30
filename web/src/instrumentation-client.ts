import * as Sentry from '@sentry/nextjs';
import { getBrowserSentryOptions } from '@/lib/sentry-options';

const sentryOptions = getBrowserSentryOptions();

if (sentryOptions.dsn) {
  Sentry.init(sentryOptions);
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
