// Step 3b. Your judging, in two stages, on a local page with names hidden.
//  1. Bar: each variant alone, next to your reference images if you added
//     any. "Does this reach visionOS level?" Ship it / Not yet, and which
//     rubric rows fall short. Only variants you pass go on.
//  2. Pairwise: the variants you passed, two at a time, sides shuffled. Each
//     pair comes back ROUNDS times, which also shows whether your eye is
//     consistent.
// Your votes are the final call; the AI votes are a second opinion.
// Run: npm run judge -- button-thickness   then open the printed link.
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { loadExperiment, readJson, appendJsonl, pairs } from './lib/experiment.mjs';
import { serveStatic } from './lib/server.mjs';
import { EYE_ROWS as RUBRIC, referenceImages, mediaType } from './lib/bar.mjs';

const { exp, variants, file } = loadExperiment(process.argv[2]);
const checks = readJson(file('checks.json'), null);
if (!checks) throw new Error('Run the checks first: npm run check -- ' + exp.id);
const eligible = variants.filter(v => checks[v.name]?.level !== 'fail');
const byName = Object.fromEntries(eligible.map(v => [v.name, v]));
const refs = referenceImages();

// Images are served under random ids so the URL never gives the variant away.
const imageId = Object.fromEntries(eligible.map(v => [randomBytes(6).toString('hex'), v.name]));
const idOf = Object.fromEntries(Object.entries(imageId).map(([id, n]) => [n, id]));
const shuffle = a => a.map(x => [Math.random(), x]).sort((p, q) => p[0] - q[0]).map(p => p[1]);
const ROUNDS = Number(process.env.ROUNDS) || 2;

let queue = shuffle(eligible.map(v => ({ kind: 'bar', variant: v.name })));
const passed = [];
let stage = 'bar';
let done = 0;

function startPairs() {
  stage = 'pair';
  queue = shuffle(Array.from({ length: ROUNDS }, () => pairs(passed)).flat()).map(p => ({ kind: 'pair', sides: shuffle(p) }));
}

const page = `<!doctype html><html><head><meta charset="utf-8"><title>Contour arena</title>
<style>
body{margin:0;background:#1d1f22;color:#e8e8e8;font:15px/1.5 system-ui,sans-serif;padding:24px}
h1{font-size:18px;margin:0 0 4px}.q{color:#bbb;margin:0 0 4px}ol,ul{color:#999;margin:4px 0 16px;font-size:13px}
.imgs{display:flex;flex-direction:column;gap:12px}.imgs figure{margin:0}.imgs img{width:100%;max-width:1440px;border:2px solid #333;image-rendering:pixelated}
figcaption{font-weight:600;margin-bottom:4px}.ref figcaption{color:#9ab}
.btns{display:flex;gap:8px;margin:16px 0;flex-wrap:wrap}.btns button{font:inherit;padding:8px 16px;border-radius:6px;border:1px solid #555;background:#2b2e33;color:#eee;cursor:pointer}
.btns button:hover{background:#3a3e44}input[type=text]{font:inherit;width:100%;max-width:720px;padding:6px;background:#2b2e33;color:#eee;border:1px solid #555;border-radius:6px}
label.row{display:block;font-size:13px;color:#ccc;margin:2px 0}.small{color:#888;font-size:13px}
</style></head><body>
<h1>Contour arena: ${exp.id}</h1><p class="q">${exp.question}</p>
<div id="app"></div>
<script>
const RUBRIC = ${JSON.stringify(RUBRIC)};
const CRITERIA = ${JSON.stringify(exp.criteria)};
async function next(){
  const r = await (await fetch('/api/next')).json();
  const app = document.getElementById('app');
  if (r.done){ app.innerHTML = '<p>'+r.message+'</p>'; return; }
  const refs = r.refs.map((id,i) => '<figure class="ref"><figcaption>Reference '+(i+1)+' (the bar)</figcaption><img src="/api/ref/'+id+'"></figure>').join('');
  if (r.kind === 'bar') {
    app.innerHTML = '<p class="small">Stage 1, the bar: '+(r.index+1)+' of '+r.total+'. Would this ship in a visionOS-quality product? Be strict: tidy is not enough.</p>'+
      '<div class="imgs">'+refs+'<figure><figcaption>Candidate</figcaption><img src="/api/img/'+r.image+'"></figure></div>'+
      '<p class="small">If not, tick what falls short:</p>'+RUBRIC.map(x => '<label class="row"><input type="checkbox" value="'+x.id+'"> <b>'+x.id+'</b>: '+x.text+'</label>').join('')+
      '<div class="btns"><button data-c="pass">Ship it (1)</button><button data-c="fail">Not yet (2)</button></div>'+
      '<input type="text" id="note" placeholder="What would make it ship? (optional)">';
  } else {
    app.innerHTML = '<p class="small">Stage 2, which is better: pair '+(r.index+1)+' of '+r.total+'.</p><ol>'+CRITERIA.map(c => '<li>'+c+'</li>').join('')+'</ol>'+
      '<div class="imgs"><figure><figcaption>A</figcaption><img src="/api/img/'+r.left+'"></figure><figure><figcaption>B</figcaption><img src="/api/img/'+r.right+'"></figure></div>'+
      '<div class="btns"><button data-c="left">A is better (1)</button><button data-c="tie">Can\\'t tell (2)</button><button data-c="right">B is better (3)</button></div>'+
      '<input type="text" id="note" placeholder="Why? (optional, one line)">';
  }
  const send = async c => {
    const failed = [...app.querySelectorAll('input[type=checkbox]:checked')].map(x => x.value);
    await fetch('/api/vote',{method:'POST',body:JSON.stringify({id:r.id,choice:c,failed,note:document.getElementById('note').value})});
    next();
  };
  app.querySelectorAll('button').forEach(b => b.onclick = () => send(b.dataset.c));
  const keys = r.kind === 'bar' ? {1:'pass',2:'fail'} : {1:'left',2:'tie',3:'right'};
  document.onkeydown = e => { if (document.activeElement.tagName==='INPUT') return; const c=keys[e.key]; if(c) send(c); };
}
next();
</script></body></html>`;

const refIds = refs.map(() => randomBytes(6).toString('hex'));

const { port } = await serveStatic(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const json = body => res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(body));
  if (url.pathname === '/') { res.writeHead(200, { 'content-type': 'text/html' }).end(page); return true; }
  if (url.pathname === '/api/next') {
    if (stage === 'bar' && !queue.length) {
      if (passed.length >= 2) startPairs();
      else { stage = 'done'; }
    }
    if (stage === 'pair' && !queue.length) stage = 'done';
    if (stage === 'done') {
      const message = passed.length >= 2
        ? `Done. Run <code>npm run score -- ${exp.id}</code>.`
        : `${passed.length} variant(s) reached the bar, so there is nothing to compare. The experiment can't produce a winner until the design improves. Run <code>npm run score -- ${exp.id}</code> to record it.`;
      return json({ done: true, message });
    }
    const item = queue[0];
    const total = stage === 'bar' ? eligible.length : queue.length + done;
    const base = { id: done, index: stage === 'bar' ? eligible.length - queue.length : done, total, kind: item.kind, refs: item.kind === 'bar' ? refIds : [] };
    return json(item.kind === 'bar'
      ? { ...base, image: idOf[item.variant] }
      : { ...base, left: idOf[item.sides[0]], right: idOf[item.sides[1]] });
  }
  if (url.pathname.startsWith('/api/img/')) {
    const name = imageId[url.pathname.slice(9)];
    if (!name) { res.writeHead(404).end(); return true; }
    res.writeHead(200, { 'content-type': 'image/png', 'cache-control': 'no-store' }).end(readFileSync(byName[name].image));
    return true;
  }
  if (url.pathname.startsWith('/api/ref/')) {
    const i = refIds.indexOf(url.pathname.slice(9));
    if (i < 0) { res.writeHead(404).end(); return true; }
    res.writeHead(200, { 'content-type': mediaType(refs[i]) }).end(readFileSync(refs[i]));
    return true;
  }
  if (url.pathname === '/api/vote' && req.method === 'POST') {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    const { id, choice, failed, note } = JSON.parse(raw);
    if (id === done && queue.length) {
      const item = queue.shift();
      const at = new Date().toISOString();
      if (item.kind === 'bar') {
        const pass = choice === 'pass';
        if (pass) passed.push(item.variant);
        appendJsonl(file('votes.jsonl'), { type: 'bar', judge: 'human', variant: item.variant, pass, failed: pass ? [] : failed, note: note || undefined, at });
      } else {
        const [left, right] = item.sides;
        const winner = choice === 'left' ? left : choice === 'right' ? right : 'tie';
        appendJsonl(file('votes.jsonl'), { type: 'pair', judge: 'human', pair: [left, right].sort(), winner, note: note || undefined, at });
      }
      done++;
      if (stage === 'bar' && !queue.length) done = 0;
      console.log(`vote recorded (${item.kind})`);
    }
    res.writeHead(204).end();
    return true;
  }
  return false;
}, Number(process.env.PORT) || 4173);
console.log(`Judge ${eligible.length} variants against the bar${refs.length ? ` (${refs.length} reference images)` : ''}, then the pairs that pass, at http://127.0.0.1:${port}  (Ctrl+C to stop)`);
