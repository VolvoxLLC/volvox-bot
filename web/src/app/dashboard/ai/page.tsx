import { createPageMetadata } from '@/lib/page-titles';
import DashboardAiRedirectClient from './dashboard-ai-redirect-client';

export const metadata = createPageMetadata('AI Chat');

export default function DashboardAiRedirectPage() {
  return <DashboardAiRedirectClient />;
}
