const {_electron:electron}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {Manager}=require('../src/core/manager.cjs');
(async()=>{
 const root=path.resolve(__dirname,'..'),results=path.join(root,'test-results');const checks=[];const packaged=process.argv.includes('--packaged');
 for(const [language,theme] of [['es','dark'],['ja','light']]){
  const data=path.join(results,'startup-'+language+'-'+Date.now());const m=new Manager(path.join(data,'fleet'));m.state.settings.language=language;m.state.settings.theme=theme;m.save();
  const env={...process.env,ASA_MANAGER_DATA:data};delete env.ELECTRON_RUN_AS_NODE;const started=Date.now();const application=await electron.launch({...packaged?{executablePath:path.join(root,'release','win-unpacked','ASA Chispi Manager.exe'),args:[]}:{args:[root]},env});
  try{
   const splash=await application.firstWindow();await splash.waitForURL('**/splash.html?**');await splash.waitForSelector('#status');
   assert.equal(await splash.locator('html').getAttribute('lang'),language);assert.equal((await splash.locator('body').getAttribute('class')||'').includes('light'),theme==='light');
   assert.ok(await splash.locator('.emblem img').evaluate(img=>img.complete&&img.naturalWidth>0));
   const before=await splash.locator('.orbit').first().evaluate(el=>getComputedStyle(el).transform);await splash.waitForTimeout(180);const after=await splash.locator('.orbit').first().evaluate(el=>getComputedStyle(el).transform);assert.notEqual(before,after);
   await splash.waitForTimeout(260);await splash.screenshot({path:path.join(results,`startup-${theme}.png`),omitBackground:true});
   await splash.emulateMedia({reducedMotion:'reduce'});assert.equal(await splash.locator('.orbit').first().evaluate(el=>getComputedStyle(el).animationName),'none');
   await splash.waitForEvent('close');assert.ok(Date.now()-started<15000,'Startup should finish promptly.');
   const main=application.windows().find(p=>p.url().includes('index.html'));assert.ok(main);await main.waitForSelector('.empty');
   const windows=await application.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().map(w=>({visible:w.isVisible(),title:w.getTitle()})));assert.equal(windows.length,1);assert.equal(windows[0].visible,true);assert.equal(windows[0].title,'ASA Chispi Manager');
   assert.ok(await main.locator('.brand-logo').evaluate(img=>img.complete&&img.naturalWidth>0));checks.push(`${language}/${theme}: logo loaded, real animation, reduced motion, clean handoff to visible main window`);
  }finally{await application.evaluate(({app})=>app.exit(0));}
 }
 fs.writeFileSync(path.join(results,packaged?'startup-package-report.json':'startup-report.json'),JSON.stringify({at:new Date().toISOString(),checks},null,2));console.log(checks.join('\n'));
})().catch(error=>{console.error(error);process.exit(1);});
