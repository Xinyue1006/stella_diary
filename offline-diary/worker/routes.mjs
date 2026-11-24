// The build embeds the public files and the private API into one deployable ES module.
export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (pathname.startsWith('/api/')) return handleApi(request, env);
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response(null, { status: 405, headers: { Allow: 'GET, HEAD' } });
    }
    const asset = publicAssets[pathname === '/' ? '/index.html' : pathname];
    if (!asset) return new Response(null, { status: 404 });
    const [contentType, bytes] = asset;
    const headers = {
      'Content-Type': contentType,
      'Cache-Control': 'private, no-cache',
      'X-Content-Type-Options': 'nosniff'
    };
    const body = request.method === 'HEAD' ? null : Uint8Array.from(atob(bytes), c => c.charCodeAt(0));
    return new Response(body, { headers });
  }
};
