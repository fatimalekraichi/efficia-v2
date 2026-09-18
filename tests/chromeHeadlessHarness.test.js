import assert from 'node:assert/strict';
import test from 'node:test';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,writeFileSync,readFileSync,existsSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {setTimeout as wait} from 'node:timers/promises';
import {collectPageResultWithIsolatedChrome} from './chromeHeadlessHarness.js';

const chrome=process.env.CHROME_BIN||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
for(const mode of ['missing-executable','early-exit'])test(`Chrome distingue le démarrage : ${mode}`,{timeout:10000},async()=>{
  const dir=mkdtempSync(join(tmpdir(),'efficia-startup-regression-'));
  try{
    await assert.rejects(collectPageResultWithIsolatedChrome({chrome:mode==='early-exit'?'/usr/bin/false':join(dir,'missing'),url:'about:blank',profileDir:join(dir,'profile'),phase:'diagnostic démarrage',selector:'#result'}),error=>{
      assert.match(error.message,mode==='early-exit'?/arrêt prématuré \(code 1/:/démarrage impossible/);
      assert.doesNotMatch(error.message,/après Browser.close/);
      assert.equal(error.chromeStartupDiagnostic.stage,'process-start');
      assert.equal(error.chromeStartupDiagnostic.portFileAtFailure.exists,false);
      assert.equal(error.chromeStartupDiagnostic.sessionId,null);
      assert.equal(error.chromeStartupDiagnostic.browserContextId,null);
      assert.deepEqual(error.chromeStartupDiagnostic.cleanupSteps,[]);
      return true;
    });
  }finally{rmSync(dir,{recursive:true,force:true});}
});
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

// Reproduce Chrome/updater inheritance with a real browser. The helper keeps
// stderr open beyond the old teardown deadline, but does not keep Chrome alive.
for(const mode of ['success','render-error','abnormal-exit'])test(`Chrome avec stderr hérité : ${mode}`,{timeout:30000},async()=>{
  const dir=mkdtempSync(join(tmpdir(),'efficia-inherited-stderr-'));
  const profileDir=join(dir,'profile'),helperFile=join(dir,'helper.pid');
  const wrapper=join(dir,'chrome-wrapper.mjs'),events=[];
  try{
    writeFileSync(wrapper,`#!/usr/bin/env node
import {spawn} from 'node:child_process';
import {writeFileSync} from 'node:fs';
const browser=spawn(${JSON.stringify(chrome)},process.argv.slice(2),{stdio:['ignore','ignore',2]});
browser.once('error',()=>process.exit(71));
browser.once('exit',(code,signal)=>{
  const helper=spawn(process.execPath,['-e','setTimeout(()=>{},30000)'],{detached:true,stdio:['ignore','ignore',2]});
  writeFileSync(${JSON.stringify(helperFile)},String(helper.pid));helper.unref();
  process.exit(${mode==='abnormal-exit'?'7':'signal?72:code'});
});
`,{mode:0o755});
    const page=join(dir,'index.html');
    writeFileSync(page,'<!doctype html><output id="result">'+(mode==='render-error'?'':'generated')+'</output>');
    const run=()=>collectPageResultWithIsolatedChrome({chrome:wrapper,url:pathToFileURL(page).href,profileDir,phase:'stderr hérité',resultWait:100,selector:'#result',onLifecycle:event=>events.push(event)});
    if(mode==='render-error')await assert.rejects(run,error=>{assert.match(error.message,/évaluation/);assert.doesNotMatch(error.message,/nettoyage|réabsorbé/);return true;});
    else if(mode==='abnormal-exit')await assert.rejects(run,/arrêté anormalement \(code 7/);
    else assert.equal(await run(),'generated');
    assert.deepEqual(events.map(e=>e.event),['spawn','context-disposed','closed']);
    assert.equal(events[2].outcome.code,mode==='abnormal-exit'?7:0);
    assert.equal(events[2].outcome.signal,null);
    assert.throws(()=>process.kill(events[0].pid,0),{code:'ESRCH'});
    // The test returned while the inherited pipe's owner is still alive.
    assert.doesNotThrow(()=>process.kill(Number(readFileSync(helperFile,'utf8')),0));
    assert.equal(execFileSync('ps',['-axo','pid=,ppid=,command='],{encoding:'utf8'}).includes(`--user-data-dir=${profileDir}`),false);
  }finally{
    if(existsSync(helperFile)){
      const helperPid=Number(readFileSync(helperFile,'utf8'));
      try{process.kill(helperPid,'SIGTERM');}catch(error){if(error.code!=='ESRCH')throw error;}
      const deadline=Date.now()+3000;
      let stopped=false;
      while(Date.now()<deadline){
        try{process.kill(helperPid,0);}catch(error){if(error.code!=='ESRCH')throw error;stopped=true;break;}
        await wait(25);
      }
      assert.equal(stopped,true,'le processus auxiliaire doit être terminé');
    }
    rmSync(dir,{recursive:true,force:true});
  }
});
