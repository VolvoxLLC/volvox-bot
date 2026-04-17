import { redirect } from 'next/navigation';

/**
 * Settings landing page — auto-redirects to the default category.
 */
export default function SettingsPage() {
  redirect('/dashboard/settings/ai-automation');
}
