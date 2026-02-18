#!/usr/bin/env node
/**
 * SendBlue → OpenClaw webhook proxy
 * 
 * Problem: SendBlue sends webhooks with ?token= query param,
 * but OpenClaw requires Authorization header.
 * 
 * This proxy listens on a local port, receives SendBlue webhooks,
 * and forwards them to OpenClaw with the proper auth header.
 * 
 * Usage: node webhook-proxy.js
 */

const http = require('http');

const LISTEN_PORT = 3456;
const OPENCLAW_HOOK_URL = 'http://127.0.0.1:18789/hooks/sendblue';
const OPENCLAW_HOOK_TOKEN = '4ce5b842be9623a0db514b7d7cae85b974eaed0b4fe44c22';
const SENDBLUE_WEBHOOK_SECRET = 'b439110e0236c39808e3ede86079a8ed60924d4b9b794ab3';

const server = http.createServer((req, res) => {
  // Only accept POST
  if (req.method !== 'POST') {
    res.writeHead(405);
    res.end('Method not allowed');
    return;
  }

  // Verify SendBlue webhook secret (sent as sb-signing-secret header)
  const secret = req.headers['sb-signing-secret'];
  if (secret !== SENDBLUE_WEBHOOK_SECRET) {
    console.log(`[${new Date().toISOString()}] Rejected: invalid secret`);
    res.writeHead(401);
    res.end('Unauthorized');
    return;
  }

  let body = '';
  req.on('data', chunk => { body += chunk; });
  req.on('end', () => {
    console.log(`[${new Date().toISOString()}] Received SendBlue webhook: ${body.substring(0, 200)}`);

    // Filter out messages FROM Pip's own number to prevent feedback loops
    // When Pip sends an iMessage via SendBlue, the outbound webhook fires too,
    // which gets processed as "inbound" and can create infinite alert loops.
    const PIP_NUMBER = '+16232843671';
    try {
      const payload = JSON.parse(body);
      const fromNumber = payload.from_number || payload.number || '';
      if (fromNumber === PIP_NUMBER || fromNumber === '16232843671' || fromNumber === '+1-623-284-3671') {
        console.log(`[${new Date().toISOString()}] FILTERED: message from Pip's own number (${fromNumber}), skipping to prevent loop`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, filtered: true, reason: 'self-message' }));
        return;
      }
    } catch (e) {
      // If JSON parse fails, continue forwarding
      console.log(`[${new Date().toISOString()}] Warning: could not parse body for filtering: ${e.message}`);
    }

    // Forward to OpenClaw with proper auth header
    const url = new URL(OPENCLAW_HOOK_URL);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENCLAW_HOOK_TOKEN}`,
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const proxy = http.request(options, (proxyRes) => {
      let proxyBody = '';
      proxyRes.on('data', chunk => { proxyBody += chunk; });
      proxyRes.on('end', () => {
        console.log(`[${new Date().toISOString()}] OpenClaw responded: ${proxyRes.statusCode} ${proxyBody.substring(0, 200)}`);
        res.writeHead(proxyRes.statusCode, { 'Content-Type': 'application/json' });
        res.end(proxyBody);
      });
    });

    proxy.on('error', (err) => {
      console.error(`[${new Date().toISOString()}] Proxy error: ${err.message}`);
      res.writeHead(502);
      res.end(JSON.stringify({ error: 'Failed to forward to OpenClaw' }));
    });

    proxy.write(body);
    proxy.end();
  });
});

server.listen(LISTEN_PORT, '127.0.0.1', () => {
  console.log(`SendBlue webhook proxy listening on http://127.0.0.1:${LISTEN_PORT}`);
  console.log(`Forwarding to ${OPENCLAW_HOOK_URL}`);
});
