// Bowling-Briefkasten: die Jungs laden Fotos der Anzeigetafeln hoch (Liga-Code), sie liegen privat im
// Cloudflare-KV "BOWL_INBOX". Eine geplante Claude-Aufgabe auf Patricks PC holt sie ab (21 Uhr + Mitternacht),
// liest sie aus, trägt sie in data/bowling.json ein und meldet sie danach als erledigt.
// Endpunkte (alle mit ?code=… bzw. code im Body = Secret BOWLING_CODE):
//   POST /bowling/upload                    {code, date, uploader, place, images:[dataURL…]}
//   GET  /bowling/inbox?code=               → offene Uploads (ohne Bilder)
//   GET  /bowling/inbox/<id>/<n>?code=      → Foto n als JPEG
//   POST /bowling/inbox/<id>/done?code=     → aus dem Briefkasten löschen
const MAX_PHOTOS = 12;
const okCode = (env, c) => env.BOWLING_CODE && String(c || '').trim().toLowerCase() === env.BOWLING_CODE.toLowerCase();

export async function handleBowling(req, env, url) {
  const parts = url.pathname.split('/').filter(Boolean); // ['bowling', 'upload'] | ['bowling','inbox',id,n|'done']
  if (parts[1] === 'upload' && req.method === 'POST') {
    const body = await req.json();
    if (!okCode(env, body.code)) return { status: 403, error: 'Falscher Liga-Code' };
    const date = /^\d{4}-\d{2}-\d{2}$/.test(body.date) ? body.date : null;
    const images = (body.images || []).filter(s => typeof s === 'string' && s.startsWith('data:image/')).slice(0, MAX_PHOTOS)
      .map(s => s.replace(/^data:image\/\w+;base64,/, ''));
    if (!date || !images.length) return { status: 400, error: 'Datum und mindestens ein Foto nötig' };
    const id = `${date}_${Date.now().toString(36)}`;
    const meta = { id, date, uploader: String(body.uploader || '').slice(0, 30), place: String(body.place || '').slice(0, 60), count: images.length, at: new Date().toISOString() };
    await env.BOWL_INBOX.put(`up:${id}`, JSON.stringify({ ...meta, images }), { metadata: meta, expirationTtl: 60 * 60 * 24 * 60 });
    return { status: 200, queued: images.length, id };
  }
  if (parts[1] === 'inbox') {
    if (!okCode(env, url.searchParams.get('code'))) return { status: 403, error: 'Falscher Liga-Code' };
    if (parts.length === 2 && req.method === 'GET') {
      const list = await env.BOWL_INBOX.list({ prefix: 'up:' });
      return { status: 200, uploads: list.keys.map(k => k.metadata).filter(Boolean) };
    }
    const key = `up:${parts[2]}`;
    if (parts[3] === 'done' && req.method === 'POST') { await env.BOWL_INBOX.delete(key); return { status: 200, done: parts[2] }; }
    if (req.method === 'GET' && /^\d+$/.test(parts[3] || '')) {
      const rec = await env.BOWL_INBOX.get(key, 'json');
      const img = rec?.images?.[+parts[3]];
      if (!img) return { status: 404, error: 'nicht gefunden' };
      return { raw: Uint8Array.from(atob(img), c => c.charCodeAt(0)), type: 'image/jpeg' };
    }
  }
  return { status: 404, error: 'unbekannt' };
}
