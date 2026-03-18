import { redirect } from 'next/navigation';

/**
 * Redirect /dashboard/config to /dashboard/settings.
 */
export default function ConfigRedirectPage() {
  redirect('/dashboard/settings');
}
