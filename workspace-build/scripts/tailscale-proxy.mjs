#!/usr/bin/env node
/**
 * Tailscale-only TCP proxy.
 * Forwards connections from Tailscale IPs (100.x.x.x) to a local target.
 * Drops everything else.
 *
 * Usage: node tailscale-proxy.mjs [listen-port] [target-port]
 *   Default: 3737 → 3738
 */
import net from 'node:net';

const LISTEN_PORT = parseInt(process.argv[2] || '3737', 10);
const TARGET_PORT = parseInt(process.argv[3] || '3738', 10);
const TARGET_HOST = '127.0.0.1';

function isTailscale(address) {
  const ip = address?.replace('::ffff:', '');
  // Tailscale uses 100.64.0.0/10 (CGNAT) — first octet is always 100
  return ip?.startsWith('100.');
}

const server = net.createServer(socket => {
  const remoteIp = socket.remoteAddress;

  if (!isTailscale(remoteIp)) {
    socket.destroy();
    return;
  }

  const target = net.connect(TARGET_PORT, TARGET_HOST);

  socket.pipe(target);
  target.pipe(socket);

  socket.on('error', () => target.destroy());
  target.on('error', () => socket.destroy());
  socket.on('close', () => target.destroy());
  target.on('close', () => socket.destroy());
});

server.listen(LISTEN_PORT, '0.0.0.0', () => {
  console.log(`Tailscale proxy: 0.0.0.0:${LISTEN_PORT} → ${TARGET_HOST}:${TARGET_PORT}`);
  console.log('Only Tailscale IPs (100.x.x.x) allowed');
});

server.on('error', err => {
  console.error('Proxy error:', err.message);
  process.exit(1);
});
