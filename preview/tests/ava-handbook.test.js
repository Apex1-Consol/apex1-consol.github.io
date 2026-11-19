// Ava handbook coverage: every menu page has a handbook entry, and lookups find the right entry.
// Run: node --experimental-strip-types ava-handbook.test.js (Node 22.6+).
const fs = require('fs'), path = require('path'), R = path.join(__dirname, '../..');
(async () => {
  const H = await import(path.join(R, 'supabase/functions/ava/handbook.ts'));
  let fail = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fail++; };
  const navSrc = fs.readFileSync(path.join(R, 'next/index.html'), 'utf8').match(/const NAV=(\[.*?\]\]\]);/)[1];
  const routes = [...navSrc.matchAll(/\['([^']+)','([a-z]+)'\]/g)].map(m => [m[1], m[2]]).concat([['My Flow', 'flow'], ['Learner intake', 'intake'], ['Sign-off & hand-over', 'handover'], ['Hand-over', 'handovers']]);
  for (const [name, k] of routes) ok(H.handbookFor('x', name).includes('CURRENT PAGE'), `handbook entry for ${name} (${k})`);
  ok(H.PAGES.every(p => p.text.length > 40), 'every entry has a real explanation');
  const t = (q, pg, inc, m) => ok(H.handbookFor(q, pg).includes(inc), m);
  t('what does clyckup sync do?', 'Dashboard', 'RELATED PAGE {{synchealth}}', 'typo clyckup finds ClickUp sync');
  t('what are the eisa readiness criteria', 'My work', '{{eisa}}', 'EISA question finds EISA page');
  t('how do I hand over a programme', 'My work', '{{handover}}', 'hand-over question finds hand-over page');
  t('what is a facilitator registration', 'My work', '{{fam}}', 'FAM question finds FAM Registry');
  ok(H.handbookFor('hi', 'Dashboard').length < 14000, 'context stays small');
  console.log(fail ? fail + ' failed' : 'all passed'); process.exitCode = fail ? 1 : 0;
})();
