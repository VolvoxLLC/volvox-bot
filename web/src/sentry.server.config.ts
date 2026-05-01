import * as Sentry from '@sentry/nextjs';
import { getServerSentryOptions } from '@/lib/sentry-options';

const sentryOptions = getServerSentryOptions('nodejs');

if (sentryOptions.dsn) {
  Sentry.init(sentryOptions);
}
