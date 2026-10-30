// Header keamanan dasar untuk API JSON (setara sebagian kecil dari paket helmet).
export function securityHeaders({ hsts = false } = {}) {
  return (req, res, next) => {
    res.set({
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'no-referrer',
      'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
      'Cache-Control': 'no-store', // data order/admin tidak boleh disimpan cache
    });
    if (hsts) res.set('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
    next();
  };
}
