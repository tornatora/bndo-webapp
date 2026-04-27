/** @type {import('next').NextConfig} */
let supabaseRealtimeOrigin = null;
const isProduction = process.env.NODE_ENV === 'production';

function normalizeOrigin(rawValue) {
  const value = String(rawValue ?? '').trim();
  if (!value) return null;

  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

try {
  if (process.env.NEXT_PUBLIC_SUPABASE_URL) {
    const supabaseUrl = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL);
    const realtimeProtocol = supabaseUrl.protocol === 'https:' ? 'wss:' : 'ws:';
    supabaseRealtimeOrigin = `${realtimeProtocol}//${supabaseUrl.host}`;
  }
} catch {
  supabaseRealtimeOrigin = null;
}

const frameOrigins = Array.from(
  new Set(
    [
      'https://bndo.it',
      'https://app.bndo.it',
      'https://admin.bndo.it',
      'https://checkout.stripe.com',
      'https://hooks.stripe.com',
      'https://buy.stripe.com',
      'https://js.stripe.com',
      normalizeOrigin(process.env.NEXT_PUBLIC_MARKETING_URL),
      normalizeOrigin(process.env.NEXT_PUBLIC_APP_URL),
      normalizeOrigin(process.env.NEXT_PUBLIC_ADMIN_URL)
    ].filter(Boolean)
  )
);

const devConnectOrigins = [
  'ws://localhost:3000',
  'ws://localhost:3200',
  'ws://localhost:3300',
  'ws://localhost:3301',
  'ws://127.0.0.1:3000',
  'ws://127.0.0.1:3200',
  'ws://127.0.0.1:3300',
  'ws://127.0.0.1:3301',
  'http://localhost:3000',
  'http://localhost:3200',
  'http://localhost:3300',
  'http://localhost:3301',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:3200',
  'http://127.0.0.1:3300',
  'http://127.0.0.1:3301'
];

const devFrameOrigins = ['http://localhost:3300', 'http://127.0.0.1:3300'];

const nextConfig = {
  reactStrictMode: true,
  allowedDevOrigins: ['127.0.0.1', 'localhost', '192.168.0.11'],
  serverExternalPackages: ['playwright-core', '@browserbasehq/sdk', 'canvas'],
  webpack: (config, { isServer }) => {
    if (isServer) {
      // pdfjs-dist@3 cerca 'canvas' al build time — non serve su Netlify serverless
      config.externals = [...(config.externals || []), 'canvas'];
    }
    return config;
  },
  async headers() {
    const csp = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https:",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com data:",
      "img-src 'self' data: blob: https:",
      [
        "connect-src 'self'",
        'https:',
        supabaseRealtimeOrigin,
        ...(isProduction ? [] : devConnectOrigins)
      ]
        .filter(Boolean)
        .join(' '),
      ["frame-src 'self'", ...frameOrigins, ...(isProduction ? [] : devFrameOrigins)].filter(Boolean).join(' '),
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'self'"
    ].join('; ');

    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: csp },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          { key: 'Cross-Origin-Resource-Policy', value: 'same-site' }
        ]
      }
    ];
  }
};

export default nextConfig;
