import { getToken } from 'next-auth/jwt';
import { headers } from 'next/headers';

function getGlobalAdminIds(): Set<string> {
  return new Set(
    (process.env.BOT_OWNER_IDS ?? '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean),
  );
}

export async function isDashboardGlobalAdmin(): Promise<boolean> {
  const token = await getToken({ req: { headers: await headers() } as never });
  const userId =
    typeof token?.id === 'string' ? token.id : typeof token?.sub === 'string' ? token.sub : '';
  return Boolean(userId) && getGlobalAdminIds().has(userId);
}
