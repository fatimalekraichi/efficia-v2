// Fail closed: only reviewed preview branches and the n8n branch convention opt in.
// CF_PAGES_BRANCH alone never grants preview behavior to an unknown branch.
export function isPreviewBuild(env = process.env) {
  if (env.CF_PAGES !== '1') return false;
  const branch = env.CF_PAGES_BRANCH;
  return branch === 'feat/blog-n8n-preview'
    || (typeof branch === 'string' && /^blog\/\d{4}-\d{2}-\d{2}-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(branch));
}

export function previewHtml(html) {
  // Replace existing directives rather than leaving contradictory index/follow tags.
  html = html.replace(/<meta\b(?=[^>]*\bname\s*=\s*["'](?:robots|googlebot)["'])[^>]*>\s*/gi, '');
  if (!/<head\b[^>]*>/i.test(html)) {
    // Static fragments (including the email signature) are also reachable pages.
    if (/<html\b[^>]*>/i.test(html)) html = html.replace(/(<html\b[^>]*>)/i, '$1<head></head>');
    else html = '<!doctype html><html><head></head><body>' + html + '</body></html>';
  }
  return html.replace(/(<head\b[^>]*>)\s*/i, '$1\n<meta name="robots" content="noindex, nofollow">\n');
}

export const previewBanner = '<style>[data-blog-preview-banner]~.header{top:56px}</style><aside data-blog-preview-banner role="note" style="position:sticky;top:0;height:56px;box-sizing:border-box;z-index:10000;padding:16px 24px;background:#081B3A;color:#fff;text-align:center;font:700 16px/1.5 sans-serif">Brouillon — non publié</aside>';
