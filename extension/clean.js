export const TEXT_MAX = 500;

export function obj(x) {
  return x && typeof x === 'object' && !Array.isArray(x) ? x : {};
}

export function str(x, n) {
  return typeof x === 'string' ? x.slice(0, n) : '';
}

export function num(x) {
  return typeof x === 'number' && Number.isFinite(x) ? x : 0;
}

export function scUrl(u) {
  return typeof u === 'string' && u.length <= 300 && /^https:\/\/soundcloud\.com\/(?!\/)[^\s"'<>\\]*$/.test(u) ? u : '';
}

export function scImg(u) {
  return typeof u === 'string' && u.length <= 300 && /^https:\/\/[a-z0-9-]+\.sndcdn\.com\/[A-Za-z0-9._~\/-]+$/.test(u) ? u : '';
}

export function cleanText(t) {
  return String(typeof t === 'string' ? t : '')
    .replace(/[\u0000-\u001f\u007f‎‏‪-‮⁦-⁩]/g, ' ')
    .trim()
    .slice(0, TEXT_MAX);
}

export function whoOf(p) {
  p = obj(p);
  return { id: str(p.id, 40), name: cleanText(p.name).slice(0, 60), avatar: scImg(p.avatar), url: scUrl(p.url) };
}

export function track(t) {
  t = obj(t);
  const okId = (typeof t.id === 'number' && Number.isFinite(t.id)) || (typeof t.id === 'string' && t.id.length > 0 && t.id.length < 40);
  const url = scUrl(t.url);
  if (!okId || !url) return null;
  const out = {
    id: t.id,
    url,
    title: cleanText(t.title).slice(0, 200),
    artist: cleanText(t.artist).slice(0, 120),
    art: scImg(t.art),
    dur: Math.max(0, num(t.dur)),
    genre: cleanText(t.genre).slice(0, 60)
  };
  if (typeof t.uid === 'number' && Number.isFinite(t.uid)) out.uid = t.uid;
  return out;
}
