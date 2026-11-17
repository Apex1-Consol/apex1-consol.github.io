// Ava knowledge-base coverage + panel smoke test. Run: node ava-kb.test.js
const fs = require('fs'), path = require('path'), { JSDOM } = require('jsdom');
const rd = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
let fail = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fail++; };
const dom = new JSDOM('<body></body>', { runScripts: 'outside-only', url: 'https://x.test/#pmtracker' }), w = dom.window;
w.toast = () => {}; w.__sb = { rpc: async () => ({ data: [] }), from: () => ({ insert: () => Promise.resolve() }), auth: { getSession: async () => ({ data: {} }) } };
w.eval(rd('ava-kb.js')); w.eval(rd('ava.js'));
const KB = w.AVAKB, html = rd('index.html');
// every route in the menu and ROUTES has a kb page
const nav = [...(html.match(/const NAV=(.*)/) || ['', ''])[1].matchAll(/\['[^']+','([a-z]+)'\]/g)].map(m => m[1]);
const routes = [...(html.match(/const ROUTES=\{(.*?)\};/) || ['', ''])[1].matchAll(/([a-z]+):\[/g)].map(m => m[1]);
const miss = [...new Set([...nav, ...routes])].filter(r => r !== 'login' && !KB.PAGES[r]);
ok(!miss.length, 'kb page for every route' + (miss.length ? ': missing ' + miss.join(', ') : ''));
// every PM Tracker / EISA flag label has an explanation
const labels = [...rd('admin.js').matchAll(/^\s+(?:end|reg|vis|lrn|rec|ho|saqa|dates): \['([^']+)'/gm), ...rd('admin.js').matchAll(/SHORT = \{(.*)\}/g)].flatMap(m => m[0].includes('SHORT') ? [...m[1].matchAll(/'([^']+)'/g)].map(x => x[1]) : [m[1]]);
const ef = [...rd('delivery.js').matchAll(/(?:end|rdy|nod|res|nomod): \['([^']+)'/g)].map(m => m[1]);
const nof = [...labels, ...ef, 'No start', 'No end', 'End before start', 'No SAQA'].filter(l => !KB.flag(l));
ok(labels.length + ef.length >= 18 && !nof.length, `flag help for ${labels.length + ef.length} PM/EISA labels` + (nof.length ? ': missing ' + nof.join(', ') : ''));
// every PM-screen field has a meaning; programme edit labels covered
const edit = [...rd('delivery.js').matchAll(/i\('[a-z]+', '([^']+?)\s?\*?'/g)].map(m => m[1].replace(/ \*$/, ''));
const nf = edit.filter(l => !KB.PAGES.programmes.fields[l]);
ok(edit.length > 15 && !nf.length, `field help for ${edit.length} programme edit fields` + (nf.length ? ': missing ' + nf.join(', ') : ''));
// every guide step has text; selectors are strings
const bad = Object.entries(KB.PAGES).flatMap(([r, p]) => Object.entries(p.guides).flatMap(([k, g]) => g.steps.filter(s => !s.t).map(() => r + '.' + k)));
ok(!bad.length, 'every guide step has text');
// panel: How to tab, live guide, explain, search
w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
w.avaToggle(true); w.avaTab('how');
ok(/PM Tracker/.test(w.document.getElementById('avamsgs').innerHTML) && /Fix missing dates/.test(w.document.getElementById('avamsgs').innerHTML), 'How to tab lists PM Tracker guides');
w.avaGuide('pmtracker', 'dates'); const g = w.document.getElementById('avamsgs').innerHTML;
ok(/class="ok"><span>✓ Open PM Tracker/.test(g) && /Show me/.test(g), 'guide ticks the done step and offers Show me');
w.avaExplain('No SAQA', 42); const ex = w.document.getElementById('avamsgs').innerHTML;
ok(/no SAQA ID/.test(ex) && /avaEditProg\(42\)/.test(ex), 'clicking a flag explains it with Fix it for that programme');
ok(KB.search('how do I capture a register')[0].k === 'register', 'help search finds the register guide');
console.log(fail ? fail + ' failed' : 'all passed'); process.exit(fail ? 1 : 0);
