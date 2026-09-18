import assert from 'node:assert/strict';
import test from 'node:test';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {collectPageResultWithIsolatedChrome} from './chromeHeadlessHarness.js';

const chrome=process.env.CHROME_BIN||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
for(const failure of [false,true])test(`Chrome nettoie contexte, session et processus après ${failure?'échec du rendu':'rendu puis assertion en échec'}`,{timeout:30000},async()=>{
  const dir=mkdtempSync(join(tmpdir(),'efficia-cleanup-regression-'));
  const profileDir=join(dir,'profile');
  const events=[];
  try{
    const page=join(dir,'index.html');
    writeFileSync(page,'<!doctype html><output id="result">'+(failure?'':'ok')+'</output>');
    const run=()=>collectPageResultWithIsolatedChrome({chrome,url:pathToFileURL(page).href,profileDir,phase:'régression nettoyage',resultWait:100,selector:'#result',onLifecycle:event=>events.push(event)});
    if(failure)await assert.rejects(run,/évaluation/u);
    else{
      const result=await run();
      assert.equal(result,'ok');
      assert.throws(()=>assert.equal(result,'assertion volontaire'),assert.AssertionError);
    }
    assert.deepEqual(events.map(e=>e.event),['spawn','context-disposed','closed']);
    assert.equal(events[2].outcome.code,0);
    assert.equal(events[2].outcome.signal,null);
    assert.throws(()=>process.kill(events[0].pid,0),{code:'ESRCH'});
    assert.equal(execFileSync('ps',['-axo','pid=,ppid=,command='],{encoding:'utf8'}).includes(`--user-data-dir=${profileDir}`),false);
  }finally{rmSync(dir,{recursive:true,force:true});}
});
