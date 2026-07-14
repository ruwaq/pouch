// Mount the Hono API as a Next.js catch-all Route Handler.
// The app is lazily created on the FIRST request, not at module load.
// This prevents crashes during build and cold-start when env vars
// aren't available yet.

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _app: any = null;

async function getApp() {
  if (!_app) {
    const { createApp } = await import('@pouch/api');
    _app = createApp();
  }
  return _app;
}

const handler = async (req: Request): Promise<Response> => {
  try {
    const app = await getApp();
    const url = new URL(req.url);
    url.pathname = url.pathname.replace(/^\/api/, '') || '/';
    return app.fetch(new Request(url, req));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', message }),
      { status: 500, headers: { 'content-type': 'application/json' } },
    );
  }
};

export {
  handler as GET,
  handler as POST,
  handler as PUT,
  handler as DELETE,
  handler as PATCH,
};
