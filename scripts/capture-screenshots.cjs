const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {_electron:electron}=require('playwright');
const {Manager}=require('../src/core/manager.cjs');

async function capture(){
  const root=path.resolve(__dirname,'..');
  const tempRoot=fs.realpathSync(os.tmpdir());
  const userData=fs.mkdtempSync(path.join(tempRoot,'asa-screenshot-'));
  const output=path.join(root,'docs','screenshots');
  const logFile=path.join(userData,'steam-example.log');
  const manager=new Manager(path.join(userData,'fleet'));
  manager.state.settings.language='en';
  manager.state.servers=[
    {id:'demo-island',name:'Demo · The Island',map:'TheIsland_WP',folder:'C:\\ASA-Demo\\TheIsland',port:7777,queryPort:27015,rconPort:27020,maxPlayers:70},
    {id:'demo-ragnarok',name:'Demo · Ragnarok',map:'Ragnarok_WP',folder:'C:\\ASA-Demo\\Ragnarok',port:7787,queryPort:27025,rconPort:27030,maxPlayers:50}
  ].map(server=>({...server,platform:'ALL',mods:[],passiveMods:[],flags:['servergamelog'],extraArgs:[],discord:{},pid:null}));
  manager.state.servers[0].steamUpdate={status:'success',phase:'complete',exitCode:0,attempt:1,logFile};
  fs.writeFileSync(logFile,'DEMO OUTPUT · SteamCMD\n\nPreparing SteamCMD and checking anonymous login…\nConnecting anonymously to Steam Public… OK\nInstalling app 2430930…\nUpdate progress 100%\nSuccess! App \'2430930\' fully installed.\n');
  manager.save();
  fs.mkdirSync(output,{recursive:true});
  let app;
  try{
    app=await electron.launch({args:[root],env:{...process.env,ASA_MANAGER_DATA:userData}});
    await app.waitForEvent('window',{predicate:w=>w.url().includes('index.html'),timeout:6000}).catch(()=>{});
    const page=app.windows().find(w=>w.url().includes('index.html'));
    if(!page)throw Error('The manager window did not load.');
    await page.locator('.fleet-card').first().waitFor();
    const nav=section=>page.locator(`[data-action="nav"][data-view="${section}"]`).click();
    const shot=name=>page.screenshot({path:path.join(output,name+'.png'),animations:'disabled'});
    await shot('fleet');
    await nav('configuration');
    await page.locator('#basics-form').waitFor();
    await page.locator('[data-action="theme"]').click();
    await page.locator('body.light').waitFor();
    await shot('launch');
    await page.locator('[data-action="theme"]').click();
    await page.locator('body:not(.light)').waitFor();
    await nav('discord');
    await page.locator('#discord-panel-form').waitFor();
    await shot('discord');
    await nav('console');
    await page.locator('[data-action="consoleTab"][data-tab="steam"]').click();
    await page.waitForFunction(()=>document.querySelector('#steam-output')?.textContent.includes('DEMO OUTPUT'));
    await shot('steamcmd');
  }finally{
    if(app)await app.close();
    if(path.dirname(fs.realpathSync(userData))===tempRoot)fs.rmSync(userData,{recursive:true,force:true,maxRetries:8,retryDelay:150});
  }
}

capture().catch(error=>{console.error(error.stack);process.exitCode=1;});
