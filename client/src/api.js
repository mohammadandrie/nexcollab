// Tiny fetch wrapper. 401 → reload (App will show login screen).
export async function api(path, opts = {}) {
  const r = await fetch(path, {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  });
  if (r.status === 401) {
    // Clear local cache and let App re-render login flow.
    window.dispatchEvent(new CustomEvent('nexcollab:unauthenticated'));
    throw new Error('unauthenticated');
  }
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

// Tiny markdown — bold **x**, italic _x_, inline code `x`, paragraphs.
const escMap = { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' };
const escHtml = (s) => String(s).replace(/[&<>"']/g, (c) => escMap[c]);

export function mdLite(s) {
  // 1. Escape first so user content can't inject HTML.
  // 2. Promote http(s) URLs to <a target=_blank> — but if the URL points at
  //    one of our /uploads/*.{png,jpg,gif,webp,svg} files, render it as an
  //    inline <img class="md-img"> instead so descriptions/comments show a
  //    preview thumbnail. Click is wired up via delegated listener (the
  //    description container forwards img clicks to the preview modal).
  // 3. Stops at whitespace and at trailing punctuation typically NOT part of
  //    the URL (period, comma, closing paren/bracket/brace).
  const URL_RE = /\bhttps?:\/\/[^\s<]+[^\s<.,!?:;)\]}]|\/uploads\/[^\s<]+[^\s<.,!?:;)\]}]/g;
  const IMG_EXT = /\.(png|jpe?g|gif|webp|svg)$/i;
  return escHtml(s)
    .replace(URL_RE, (u) => {
      if (IMG_EXT.test(u)) {
        return `<img src="${u}" alt="" class="md-img" loading="lazy" />`;
      }
      return `<a href="${u}" target="_blank" rel="noreferrer noopener" class="md-link">${u}</a>`;
    })
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|\W)_([^_]+)_(?=\W|$)/g, '$1<em>$2</em>')
    .replace(/(^|\s)@([a-zA-Z0-9_-]+)/g,
             '$1<span class="mention">@$2</span>')
    .split(/\n{2,}/).map((p) => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('');
}

export const ROLE_LABEL = {
  PM: 'Project Manager', UX: 'UX Designer',
  DEV: 'Developer', QA: 'QA',
};
