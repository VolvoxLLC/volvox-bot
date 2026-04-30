import * as Sentry from '@sentry/nextjs';
import { getServerSentryOptions } from '@/lib/sentry-options';

const sentryOptions = getServerSentryOptions('edge');

if (sentryOptions.dsn) {
  Sentry.init(sentryOptions);
}
