// Adapter guard test: extracts sandboxCheck from the deployed source and proves it
// refuses every ClickUp write outside the test folder. Run: node guard.test.js
const fs=require('fs'),path=require('path');
const src=fs.readFileSync(path.join(__dirname,'..','adapter','index.ts'),'utf8');
const LIVE=['1200620000006159','1200620000006161','1200620000006162','1200620000006163','1200620000006166','1200620000006168','1200620000006169','1200620000006170','1200620000006171','1200620000006172','1200620000006173','1200620000006174','1200620000006175','1200620000006176','1200620000014666','901524483971','1200620000012481','1200620000013249','1200620000011174','1200620000012516'];
const set=src.match(/SANDBOX_LISTS=new Set\((\[[^\]]+\])\)/)[1];
const fn=src.match(/async function sandboxCheck\(path\)\{[\s\S]*?path not allowed "\+path\)\}/)[0];
const tasks={'t-sandbox':'1200620000016153','t-live':'1200620000006161','t-recruit':'901524483971'};
const fetch=async u=>({json:async()=>({list:{id:tasks[u.split('/').pop()]}})});
const sandboxCheck=new Function('fetch','CLICKUP_TOKEN',`const SANDBOX_LISTS=new Set(${set});const _listOf=new Map();${fn};return sandboxCheck`)(fetch,'tok');
let pass=0,fail=0;const t=async(n,f)=>{try{await f();pass++;console.log('PASS',n)}catch(e){fail++;console.log('FAIL',n,'-',e.message)}};
const rejects=async p=>{try{await p}catch(e){if(/PREVIEW GUARD/.test(e.message))return;throw e}throw Error('was allowed')};
(async()=>{
 await t('no live list ID appears anywhere in the adapter',()=>{for(const id of LIVE)if(src.includes(id))throw Error(id)});
 await t('create in a test list is allowed',()=>sandboxCheck('/list/1200620000016152/task'));
 for(const id of LIVE) await t('create in live/recruitment list '+id+' is refused',()=>rejects(sandboxCheck('/list/'+id+'/task')));
 await t('update a task that lives in the test folder is allowed',()=>sandboxCheck('/task/t-sandbox'));
 await t('update a live Programmes task is refused',()=>rejects(sandboxCheck('/task/t-live')));
 await t('update a Recruitment Candidates task is refused',()=>rejects(sandboxCheck('/task/t-recruit/field/x')));
 await t('editing a comment on a test task is allowed',()=>sandboxCheck('/comment/123'));
 await t('any other endpoint (team, space, webhook) is refused',()=>rejects(sandboxCheck('/team/90152506082/webhook')));
 console.log(`\n${pass} passed, ${fail} failed`);process.exit(fail?1:0)})();
