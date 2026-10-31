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
  if (!/<head\b[^>]*>/i.test(html)) throw Error('Prévisualisation : page HTML sans head');
  return html.replace(/(<head\b[^>]*>)/i, '$1\n<meta name="robots" content="noindex, nofollow">');
}

export const previewBanner = '<aside data-blog-preview-banner role="note" style="position:relative;z-index:10000;padding:16px 24px;background:#081B3A;color:#fff;text-align:center;font:700 16px/1.5 sans-serif">Brouillon — non publié</aside>';
