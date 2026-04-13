// Pagefind WASM Fallback Interceptor
// ===================================
// Wraps window.fetch so that pagefind's wasm.*.pagefind requests
// fall back to a base64-encoded .txt file when the original request
// fails (e.g. corporate firewall blocking binary / unknown extensions).
//
// Projects must generate the .txt fallbacks after pagefind runs:
//   for f in docs/pagefind/wasm.*.pagefind; do
//     base64 -w0 "$f" > "${f}.txt"
//   done
//
// This script must be loaded BEFORE pagefind's module scripts.

(function() {
  const _origFetch = window.fetch;
  window.fetch = function(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const url = (typeof input === 'string') ? input : (input instanceof URL) ? input.href : input.url;
    if (/wasm\.[^/]+\.pagefind$/.test(url)) {
      return _origFetch.call(this, input, init).then(function(resp: Response) {
        if (resp.ok) return resp;
        throw new Error('pagefind wasm fetch failed: ' + resp.status);
      }).catch(function() {
        const txtUrl = url + '.txt';
        console.debug('[pagefind-fallback] .pagefind blocked, trying', txtUrl);
        return _origFetch.call(window, txtUrl).then(function(resp: Response) {
          if (!resp.ok) throw new Error('fallback fetch failed: ' + resp.status);
          return resp.text();
        }).then(function(b64: string) {
          const bin = atob(b64.trim());
          const bytes = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
          return new Response(bytes.buffer, {
            status: 200,
            headers: { 'Content-Type': 'application/octet-stream' }
          });
        });
      });
    }
    return _origFetch.call(this, input, init);
  };
})();
