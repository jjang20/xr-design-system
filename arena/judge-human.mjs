// Step 3b. Blind pairwise judging by you. Opens a local page that shows two
// renders side by side with the names hidden and the sides shuffled. Your
// votes are the final call; the AI votes are a second opinion.
// Each pair comes back ROUNDS times (sides reshuffled), which also shows
// whether your own eye is consistent.
// Run: npm run judge -- button-thickness   then open the printed link.
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { loadExperiment, readJson, appendJsonl, pairs } from './lib/experiment.mjs';
import { serveStatic } from './lib/server.mjs';

const { exp, variants, file } = loadExperiment(process.argv[2]);
const checks = readJson(file('checks.json'), null);
if (!checks) throw new Error('Run the checks first: npm run check -- ' + exp.id);
const eligible = variants.filter(v => checks[v.name]?.level !== 'fail');
const byName = Object.fromEntries(eligible.map(v => [v.name, v]));

// Images are served under random ids so the URL never gives the variant away.
const imageId = Object.fromEntries(eligible.map(v => [randomBytes(6).toString('hex'), v.name]));
const idOf = Object.fromEntries(Object.entries(imageId).map(([id, n]) => [n, id]));
const shuffle = a => a.map(x => [Math.random(), x]).sort((p, q) => p[0] - q[0]).map(p => p[1]);
const ROUNDS = Number(process.env.ROUNDS) || 2;
const queue = shuffle(Array.from({ length: ROUNDS }, () => pairs(eligible.map(v => v.name))).flat()).map(p => shuffle(p));
let done = 0;

const page = `<!doctype html><html><head><meta charset="utf-8"><title>Contour arena</title>
<style>
body{margin:0;background:#1d1f22;color:#e8e8e8;font:15px/1.5 system-ui,sans-serif;padding:24px}
h1{font-size:18px;margin:0 0 4px}.q{color:#bbb;margin:0 0 4px}ol{color:#999;margin:4px 0 16px;font-size:13px}
.pair{display:flex;flex-direction:column;gap:12px}.pair figure{margin:0}.pair img{width:100%;max-width:1440px;image-rendering:pixelated;border:2px solid #333}
figcaption{font-weight:600;margin-bottom:4px}
.btns{display:flex;gap:8px;margin:16px 0}.btns button{font:inherit;padding:8px 16px;border-radius:6px;border:1px solid #555;background:#2b2e33;color:#eee;cursor:pointer}
.btns button:hover{background:#3a3e44}input{font:inherit;width:100%;max-width:720px;padding:6px;background:#2b2e33;color:#eee;border:1px solid #555;border-radius:6px}
.small{color:#888;font-size:13px}
</style></head><body>
<h1>Contour arena: ${exp.id}</h1><p class="q">${exp.question}</p>
<ol>${exp.criteria.map(c => `<li>${c}</li>`).join('')}</ol>
<div id="app"></div>
<script>
async function next(){
  const r = await (await fetch('/api/next')).json();
  const app = document.getElementById('app');
  if (r.done){ app.innerHTML = '<p>All pairs judged ('+r.count+'). Close this tab and run <code>npm run score -- ${exp.id}</code>.</p>'; return; }
  app.innerHTML = '<p class="small">Pair '+(r.index+1)+' of '+r.total+'. Each image: rest, hover, press. Shown at headset pixel density, enlarged with square pixels.</p>'+
    '<div class="pair"><figure><figcaption>A</figcaption><img src="/api/img/'+r.left+'"></figure><figure><figcaption>B</figcaption><img src="/api/img/'+r.right+'"></figure></div>'+
    '<div class="btns"><button data-c="left">A is better (1)</button><button data-c="tie">Can\\'t tell (2)</button><button data-c="right">B is better (3)</button></div>'+
    '<input id="note" placeholder="Why? (optional, one line)">';
  const send = async c => { await fetch('/api/vote',{method:'POST',body:JSON.stringify({pair:r.pairId,choice:c,note:document.getElementById('note').value})}); next(); };
  app.querySelectorAll('button').forEach(b => b.onclick = () => send(b.dataset.c));
  document.onkeydown = e => { if (document.activeElement.id==='note') return; const c={1:'left',2:'tie',3:'right'}[e.key]; if(c) send(c); };
}
next();
</script></body></html>`;

const { port } = await serveStatic(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/') { res.writeHead(200, { 'content-type': 'text/html' }).end(page); return true; }
  if (url.pathname === '/api/next') {
    const total = queue.length + done;
    const body = queue.length
      ? { pairId: done, index: done, total, left: idOf[queue[0][0]], right: idOf[queue[0][1]] }
      : { done: true, count: done };
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(body));
    return true;
  }
  if (url.pathname.startsWith('/api/img/')) {
    const name = imageId[url.pathname.slice(9)];
    if (!name) { res.writeHead(404).end(); return true; }
    res.writeHead(200, { 'content-type': 'image/png', 'cache-control': 'no-store' }).end(readFileSync(byName[name].image));
    return true;
  }
  if (url.pathname === '/api/vote' && req.method === 'POST') {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    const { pair, choice, note } = JSON.parse(raw);
    if (pair === done && queue.length) {
      const [left, right] = queue.shift();
      const winner = choice === 'left' ? left : choice === 'right' ? right : 'tie';
      appendJsonl(file('votes.jsonl'), { judge: 'human', pair: [left, right].sort(), winner, note: note || undefined, at: new Date().toISOString() });
      done++;
      console.log(`vote ${done}: ${winner === 'tie' ? 'tie' : 'recorded'}`);
    }
    res.writeHead(204).end();
    return true;
  }
  return false;
}, Number(process.env.PORT) || 4173);
console.log(`Judge ${queue.length} pairs at http://127.0.0.1:${port}  (Ctrl+C to stop)`);
