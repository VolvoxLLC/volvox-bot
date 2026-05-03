import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import {
  authorizeGuildAdmin,
  buildUpstreamUrl,
  getBotApiConfig,
  type ProxyOptions,
  proxyToBotApi,
} from '@/lib/bot-api-proxy';

type WelcomeProxyRequestOptions = {
  request: NextRequest;
  guildId: string;
  pathSuffix: string;
  logPrefix: string;
  errorMessage: string;
  proxyOptions?: ProxyOptions;
};

export async function proxyWelcomeRequest({
  request,
  guildId,
  pathSuffix,
  logPrefix,
  errorMessage,
  proxyOptions,
}: WelcomeProxyRequestOptions) {
  if (!guildId) {
    return NextResponse.json({ error: 'Missing guildId' }, { status: 400 });
  }

  const authError = await authorizeGuildAdmin(request, guildId, logPrefix);
  if (authError) return authError;

  const apiConfig = getBotApiConfig(logPrefix);
  if (apiConfig instanceof NextResponse) return apiConfig;

  const upstreamUrl = buildUpstreamUrl(
    apiConfig.baseUrl,
    `/guilds/${encodeURIComponent(guildId)}/welcome${pathSuffix}`,
    logPrefix,
  );
  if (upstreamUrl instanceof NextResponse) return upstreamUrl;

  return proxyToBotApi(upstreamUrl, apiConfig.secret, logPrefix, errorMessage, proxyOptions);
}
