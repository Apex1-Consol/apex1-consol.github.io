// Ava knowledge-base coverage + panel smoke test. Run: node ava-kb.test.js
const fs = require('fs'), path = require('path'), { JSDOM } = require('jsdom');
const rd = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
let fail = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fail++; };
const dom = new JSDOM('<body></body>', { runScripts: 'outside-only', url: 'https://x.test/#pmtracker' }), w = dom.window;
w.toast = () => {}; w.__sb = { rpc: async () => ({ data: [] }), from: () => ({ insert: () => Promise.resolve() }), auth: { getSession: async () => ({ data: {} }) } };
w.eval(rd('ava-kb.js')); w.eval(rd('ava.js')); w.eval(rd('ava-cmd.js'));
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
// Phase 2: command bar + playbooks
const CM = w.AVACMD; w.apxRole = () => 'pm';
ok(['attention', 'closeout', 'visits', 'gaps', 'register'].every(k => CM.PLAYBOOKS.some(p => p.k === k && p.steps.length && p.steps.every(s => s.t && typeof s.run === 'function'))), 'PM playbooks defined with runnable steps');
ok(CM.results('visits due')[0].p.k === 'visits' && CM.results('close out')[0].p.k === 'closeout' && CM.results('missing saqa')[0].p.k === 'gaps', 'command bar matches intent to the right playbook');
w.apxRole = () => 'qa'; ok(CM.results('visits due')[0].p.k === 'visits', 'other roles still find PM playbooks by typing'); w.apxRole = () => 'pm';
ok(CM.results('zzqq').slice(-1)[0].kind === 'ask', 'unmatched text offers Ask Ava');
w.avaCmd(true); ok(w.document.getElementById('avacmd').style.display === 'flex' && /What do you want to do/.test(w.document.getElementById('avacmdbox').innerHTML), 'Ctrl+K command bar opens');
w.document.getElementById('avacmdin').value = 'visits'; w.document.getElementById('avacmdin').dispatchEvent(new w.Event('input')); w.avaCmdPick(0);
ok(/Ava will:/.test(w.document.getElementById('avacmdbox').innerHTML) && /avacmdrun/.test(w.document.getElementById('avacmdbox').innerHTML), 'picking a playbook shows the plan with Run');
w.avaCmd(false);
ok(['modprep', 'verify', 'poe'].every(k => CM.PLAYBOOKS.some(p => p.k === k)) && CM.results('prepare moderation')[0].p.k === 'modprep' && CM.results('verify batch')[0].p.k === 'verify' && CM.results('chase poe gaps')[0].p.k === 'poe', 'QA playbooks defined and matched');
ok([['hand over programme', 'pihand'], ['check client details', 'clients'], ['fam compliance check', 'famcheck'], ['renewals due', 'renew'], ['review sign-off queue', 'soreview'], ['what is blocking', 'soblock'], ['data health', 'health'], ['help gaps', 'helpgap'], ['onboarding status', 'onboard']].every(([q, k]) => (CM.results(q)[0] || {}).p && CM.results(q)[0].p.k === k), 'PI, OHS, sign-off and admin playbooks matched');
console.log(fail ? fail + ' failed' : 'all passed'); process.exit(fail ? 1 : 0);
