import { ImageResponse } from 'next/og';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export const alt = 'Volvox.Bot — AI-Powered Discord Bot';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function Image() {
  const logoPath = join(process.cwd(), 'public', 'icon-512.png');
  const logoBuf = await readFile(logoPath);
  const logoBase64 = logoBuf.toString('base64');
  const logoDataUrl = `data:image/png;base64,${logoBase64}`;

  return new ImageResponse(
    (
      <div
        style={{
          height: '100%',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#0a0a0f',
          padding: '60px',
          position: 'relative',
        }}
      >
        {/* Top accent line */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: '3px',
            display: 'flex',
            justifyContent: 'center',
          }}
        >
          <div
            style={{
              width: '400px',
              height: '3px',
              background:
                'linear-gradient(90deg, transparent, #6366f1, #8b5cf6, transparent)',
            }}
          />
        </div>

        {/* Logo */}
        {/* biome-ignore lint/a11y/noImgElement: Satori requires img for images */}
        <img
          src={logoDataUrl}
          width={96}
          height={96}
          style={{
            marginBottom: '32px',
            borderRadius: '24px',
          }}
        />

        {/* Title */}
        <div
          style={{
            display: 'flex',
            fontSize: '72px',
            fontWeight: 800,
            letterSpacing: '-2px',
            color: '#ffffff',
            marginBottom: '16px',
          }}
        >
          Volvox
          <span style={{ color: '#8b5cf6', fontWeight: 400 }}>.Bot</span>
        </div>

        {/* Tagline */}
        <div
          style={{
            display: 'flex',
            fontSize: '28px',
            color: '#888888',
            marginBottom: '48px',
            letterSpacing: '1px',
          }}
        >
          AI-Powered Community Governance
        </div>

        {/* Feature pills */}
        <div
          style={{
            display: 'flex',
            gap: '16px',
          }}
        >
          {['Moderation', 'AI Chat', 'Dashboard', 'Automation'].map((label) => (
            <div
              key={label}
              style={{
                padding: '10px 24px',
                borderRadius: '9999px',
                border: '1px solid #222233',
                backgroundColor: '#111118',
                fontSize: '18px',
                color: '#aaaaaa',
                fontWeight: 500,
              }}
            >
              {label}
            </div>
          ))}
        </div>

        {/* Bottom accent line */}
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: '3px',
            display: 'flex',
            justifyContent: 'center',
          }}
        >
          <div
            style={{
              width: '400px',
              height: '3px',
              background:
                'linear-gradient(90deg, transparent, #6366f1, #8b5cf6, transparent)',
            }}
          />
        </div>
      </div>
    ),
    { ...size },
  );
}
