// Bowling-Upload: Fotos der Anzeigetafeln → Claude liest jedes Spiel Wurf für Wurf aus → Summen werden
// nachgerechnet (bei Abweichung einmal gezielt nachkorrigieren lassen) → Eintrag in data/bowling.json auf GitHub.
// Secrets: ANTHROPIC_API_KEY (Patrick), BOWLING_CODE (Liga-Code), GH_TOKEN (Contents: read & write).
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';

const REPO = 'ppat18/gentlemens-league';
const FILE = 'data/bowling.json';
const MODEL = 'claude-opus-5-5';
const MAX_PHOTOS = 12;

// Namen auf den Anzeigetafeln → Liga-Avatar
const ALIASES = {
  kai: 'kai', alex: 'alex', thomas: 'thomas', christian: 'christian', max: 'max', markus: 'max',
  sascha: 'favo', favo: 'favo', hauthi: 'andi', haupti: 'andi', hautpi: 'andi', andi: 'andi', andreas: 'andi',
  roli: 'roli', roland: 'roli', amti: 'amti', amtmann: 'amti', patrick: 'patrick', pilko: 'patrick',
};
const toWho = name => ALIASES[String(name).toLowerCase().replace(/[^a-zäöüß]/g, '')] || 'gast:' + String(name).trim();

const Board = z.object({
  lane: z.number().int().nullable(),
  timer: z.string().nullable(),
  players: z.array(z.object({ name: z.string(), frames: z.array(z.string()), score: z.number().int() })),
});

const PROMPT = `This photo shows a bowling lane scoreboard (German bowling centre). Read every player row exactly.
For each player return:
- name: as written in the left column (ignore the "Bahn … Team" row - it is the team total, not a player)
- frames: exactly 10 strings, one per frame, using only these characters:
  X = strike, / = spare, - = zero/miss, digits 1-9 for pins knocked down.
  Frames 1-9 have one mark (X) or two marks (e.g. "9/", "8-", "72", "-5").
  Frame 10 has two or three marks (e.g. "X9/", "6/8", "X7-", "54").
  A circled number on the first ball means a split: write "s" in front of the frame, e.g. "s81" or "s7-".
- score: the large final total for the player (the number in the 10th frame / total column, NOT the small number printed above it).
Also return lane (the big lane number in the top-left corner) and timer (the time shown top-right, e.g. "1:27"), or null if not visible.
Read carefully: the running totals under each frame must add up with standard bowling scoring.`;

// laufende Summe nach Standard-Bowlingregeln
function rolls(frames) {
  const r = [];
  for (const f of frames) { let prev = 0; for (const c of f.replace(/^s/, '')) { const v = c === 'X' ? 10 : c === '-' ? 0 : c === '/' ? 10 - prev : +c; r.push(v); prev = c === 'X' || c === '/' ? 0 : v; } }
  return r;
}
export function scoreOf(frames) {
  const r = rolls(frames); let s = 0, i = 0;
  for (let f = 0; f < 10; f++) {
    if (r[i] === 10) { s += 10 + (r[i + 1] || 0) + (r[i + 2] || 0); i++; }
    else if (r[i] + r[i + 1] === 10) { s += 10 + (r[i + 2] || 0); i += 2; }
    else { s += (r[i] || 0) + (r[i + 1] || 0); i += 2; }
  }
  return s;
}
const clean = f => String(f).toUpperCase().replace(/S/g, 's').replace(/0/g, '-').replace(/[^X/\-1-9s]/g, '');

async function readBoard(client, b64) {
  const messages = [{ role: 'user', content: [
    { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: b64 } },
    { type: 'text', text: PROMPT },
  ] }];
  const ask = () => client.messages.parse({ model: MODEL, max_tokens: 16000, output_config: { effort: 'high', format: zodOutputFormat(Board) }, messages });
  let res = await ask();
  let board = res.parsed_output;
  if (!board) throw new Error('Anzeigetafel nicht lesbar');
  const check = bd => bd.players.map(p => ({ ...p, frames: p.frames.map(clean) }))
    .map(p => ({ ...p, calc: p.frames.length === 10 ? scoreOf(p.frames) : null }));
  let players = check(board);
  const wrong = players.filter(p => p.calc !== p.score);
  if (wrong.length) {
    // einmal gezielt nachfragen: welche Zeilen rechnerisch nicht aufgehen
    messages.push({ role: 'assistant', content: JSON.stringify(board) });
    messages.push({ role: 'user', content: `Please re-check these rows against the photo – the frames you read do not add up to the total shown: ${wrong.map(p => `${p.name}: your frames give ${p.calc ?? 'not 10 frames'}, the board shows ${p.score}`).join('; ')}. Return the full corrected scoreboard.` });
    res = await ask();
    if (res.parsed_output) { board = res.parsed_output; players = check(board); }
  }
  return {
    lane: board.lane, timer: board.timer,
    players: players.map(p => ({ who: toWho(p.name), frames: p.frames, score: p.score, ...(p.calc === p.score ? {} : { unsure: true }) })),
  };
}

// --- GitHub: data/bowling.json lesen & schreiben (UTF-8 sicher) ---
const b64dec = s => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/\n/g, '')), c => c.charCodeAt(0)));
const b64enc = s => { const b = new TextEncoder().encode(s); let bin = ''; for (let i = 0; i < b.length; i += 0x8000) bin += String.fromCharCode(...b.subarray(i, i + 0x8000)); return btoa(bin); };
async function gh(env, path, init = {}) {
  return fetch(`https://api.github.com/repos/${REPO}${path}`, { ...init, headers: { Authorization: `Bearer ${env.GH_TOKEN}`, Accept: 'application/vnd.github+json', 'User-Agent': 'liga-wecker', 'X-GitHub-Api-Version': '2022-11-28', ...(init.headers || {}) } });
}

const timerSecs = t => { const m = /^(\d+):(\d{2})$/.exec(t || ''); return m ? +m[1] * 60 + +m[2] : null; };

export async function handleBowlingUpload(req, env) {
  const body = await req.json();
  if (!env.BOWLING_CODE || String(body.code || '').trim().toLowerCase() !== env.BOWLING_CODE.toLowerCase()) return { status: 403, error: 'Falscher Liga-Code' };
  if (!env.ANTHROPIC_API_KEY) return { status: 503, error: 'KI-Schlüssel fehlt noch' };
  const date = /^\d{4}-\d{2}-\d{2}$/.test(body.date) ? body.date : null;
  const images = (body.images || []).filter(s => typeof s === 'string').slice(0, MAX_PHOTOS).map(s => s.replace(/^data:image\/\w+;base64,/, ''));
  if (!date || !images.length) return { status: 400, error: 'Datum und mindestens ein Foto nötig' };

  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  const boards = await Promise.all(images.map((b64, i) => readBoard(client, b64).then(b => ({ ...b, i })).catch(e => ({ i, error: e.message }))));
  const ok = boards.filter(b => !b.error && b.players.length);

  // in bowling.json eintragen (gleicher Tag → an den Abend anhängen; doppelte Fotos werden erkannt)
  for (let attempt = 0; attempt < 3; attempt++) {
    const cur = await gh(env, `/contents/${FILE}`);
    if (!cur.ok) return { status: 502, error: 'GitHub nicht erreichbar (' + cur.status + ')' };
    const meta = await cur.json();
    const data = JSON.parse(b64dec(meta.content));
    let ev = data.evenings.find(e => e.date === date);
    if (!ev) { ev = { date, place: body.place || '', uploadedBy: body.uploader || null, games: [] }; data.evenings.push(ev); }
    const sig = g => g.lane + '|' + g.players.map(p => p.who + ':' + p.frames.join(',')).sort().join(';');
    const have = new Set(ev.games.map(sig));
    // Reihenfolge je Bahn: Anzeigetafel zählt die Restzeit herunter → größere Zeit = früheres Spiel
    const fresh = ok.filter(b => !have.has(sig(b)))
      .sort((a, b) => (a.lane ?? 0) - (b.lane ?? 0) || (timerSecs(b.timer) ?? -b.i) - (timerSecs(a.timer) ?? -a.i));
    const added = [];
    for (const b of fresh) {
      const round = Math.max(0, ...ev.games.filter(g => g.lane === b.lane).map(g => g.round)) + 1;
      const g = { round, lane: b.lane, players: b.players };
      ev.games.push(g); added.push(g);
    }
    if (!added.length) return { status: 200, added: [], skipped: ok.length, errors: boards.filter(b => b.error).map(b => b.error), note: 'Keine neuen Spiele (schon vorhanden?)' };
    const put = await gh(env, `/contents/${FILE}`, { method: 'PUT', body: JSON.stringify({
      message: `Bowling ${date}: ${added.length} Spiel${added.length > 1 ? 'e' : ''} hochgeladen${body.uploader ? ' von ' + body.uploader : ''} (automatisch ausgelesen)`,
      content: b64enc(JSON.stringify(data, null, 1)), sha: meta.sha,
    }) });
    if (put.ok) return { status: 200, added, errors: boards.filter(b => b.error).map(b => `Foto ${b.i + 1}: ${b.error}`), unsure: added.flatMap(g => g.players.filter(p => p.unsure).map(p => p.who)) };
    if (put.status !== 409) return { status: 502, error: 'Speichern auf GitHub fehlgeschlagen (' + put.status + ')' };
    // 409 = gleichzeitig geändert → neu lesen und erneut versuchen
  }
  return { status: 409, error: 'Bitte nochmal versuchen' };
}
