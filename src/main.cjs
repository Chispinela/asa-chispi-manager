const {app,BrowserWindow,ipcMain,dialog,shell,safeStorage,Menu}=require('electron');
const path=require('node:path');
const fs=require('node:fs');
const {pathToFileURL}=require('node:url');
const {Manager}=require('./core/manager.cjs');
const {StartupScreen}=require('./startup.cjs');
let manager,window,timer,scheduleTimer,startup;
if(process.env.ASA_MANAGER_DATA)app.setPath('userData',path.resolve(process.env.ASA_MANAGER_DATA));
const primaryInstance=app.requestSingleInstanceLock();
if(!primaryInstance)app.quit();
function protect(value,mode){
  const copy=structuredClone(value);
  function walk(object){for(const [key,value] of Object.entries(object||{})){
    if(value&&typeof value==='object')walk(value);
    else if(['botToken','webhook'].includes(key)&&typeof value==='string'&&value){
      if(mode==='encode'){if(!safeStorage.isEncryptionAvailable())throw Error('Windows credential encryption is unavailable.');object[key]='dpapi:'+safeStorage.encryptString(value).toString('base64');}
      else if(value.startsWith('dpapi:'))object[key]=safeStorage.decryptString(Buffer.from(value.slice(6),'base64'));
    }
  }}walk(copy);return copy;
}
async function choose(kind){const options=kind==='folder'?{properties:['openDirectory','createDirectory']}:{properties:['openFile'],filters:kind==='steamcmd'?[{name:'SteamCMD',extensions:['exe']}]:kind==='snapshot'?[{name:'JSON',extensions:['json']}]:kind==='savegame'?[{name:'ASA world save',extensions:['ark']}]:[{name:'Configuration',extensions:['ini','json','html']}]};const r=await dialog.showOpenDialog(window,options);return r.canceled?null:r.filePaths[0];}
function register(){
  const routes={
    snapshot:()=>manager.snapshot(),choose:kind=>choose(kind),
    inspect:folder=>manager.inspectFolder(folder),create:data=>manager.create(data),import:data=>manager.importServer(data),
    update:({id,patch})=>manager.updateServer(id,patch),configs:id=>manager.configs(id),saveConfig:({id,...data})=>manager.saveConfig(id,data),saveConfigs:({id,files})=>manager.saveConfigs(id,files),downloadSteam:()=>manager.downloadSteam(),
    start:id=>manager.start(id),stop:id=>manager.stop(id),restart:id=>manager.restart(id),install:id=>manager.install(id),steamConsole:id=>manager.steamConsole(id),
    command:async({id,text})=>{const result=await manager.command(id,text);manager.event(manager.server(id),'command',text.split(/\s/)[0]+' executed via RCON.');return result;},
    players:id=>manager.refreshPlayers(id),readSave:({id,file})=>manager.readSave(id,file,app.isPackaged?path.join(process.resourcesPath,'reader'):path.join(__dirname,'..','tools')),metadata:({id,...data})=>manager.playerMetadata(id,data),admin:({id,...data})=>manager.admin(id,data),playerAction:({id,...data})=>manager.playerAction(id,data),
    backup:id=>manager.backup(id),restore:({id,backupId})=>manager.restore(id,backupId),schedule:data=>manager.saveSchedule(data),removeSchedule:id=>manager.removeSchedule(id),
    cluster:data=>manager.cluster(data),detach:id=>manager.detachCluster(id),template:data=>manager.templateCreate(data),applyTemplate:data=>manager.templateApply(data),
    settings:data=>manager.saveSettings(data),discord:({id,...data})=>manager.saveDiscord(id,data),discordStatus:()=>manager.discordStatus(),
    openDiscordPanel:()=>{const url=manager.discordPanel.status.url;if(!url)throw Error('The Discord panel has not been published yet.');return shell.openExternal(url);},
    testWebhook:({id})=>{const s=manager.server(id);return manager.postWebhook(s.discord?.webhook,'ASA Chispi Manager · '+s.name,s.name);},
    exportSteamLog:async id=>{const session=manager.server(id).steamUpdate;if(!session?.logFile||!fs.existsSync(session.logFile))throw Error('No SteamCMD log is available for this server yet.');const r=await dialog.showSaveDialog(window,{defaultPath:'ASA-SteamCMD-'+id.slice(0,8)+'.log',filters:[{name:'SteamCMD log',extensions:['log']}]});if(r.canceled)return false;fs.copyFileSync(session.logFile,r.filePath);return true;},
    openFolder:async({id,kind})=>{const s=id?manager.server(id):null;const folder=kind==='backups'?path.join(manager.dir,'backups',id||''):kind==='data'?manager.dir:s?.folder;if(!folder)throw Error('Folder unavailable.');fs.mkdirSync(folder,{recursive:true});const error=await shell.openPath(folder);if(error)throw Error(error);},
    exportTemplate:async id=>{const template=manager.state.templates.find(t=>t.id===id);if(!template)throw Error('Template not found.');const r=await dialog.showSaveDialog(window,{defaultPath:template.name.replace(/[^a-zA-Z0-9 _-]/g,'')+'.json',filters:[{name:'ASA template',extensions:['json']}]});if(r.canceled)return false;fs.writeFileSync(r.filePath,JSON.stringify({format:'asa-chispi-template-v1',...template},null,2));return true;},
    importTemplate:async()=>{const r=await dialog.showOpenDialog(window,{properties:['openFile'],filters:[{name:'ASA template',extensions:['json']}]});if(r.canceled)return false;const file=r.filePaths[0];if(fs.statSync(file).size>12*1024*1024)throw Error('Template too large.');const t=JSON.parse(fs.readFileSync(file,'utf8'));if(t.format!=='asa-chispi-template-v1'||!t.files||typeof t.name!=='string')throw Error('Invalid template.');for(const file of ['Game.ini','GameUserSettings.ini','Engine.ini'])if(typeof t.files[file]!=='string')throw Error('Missing template file.');const {validateMods,removeKey}=require('./core/manager.cjs');let gus=t.files['GameUserSettings.ini'];for(const key of ['ServerAdminPassword','ServerPassword','RCONPort'])gus=removeKey(gus,'ServerSettings',key);for(const key of ['SessionName','Port','QueryPort'])gus=removeKey(gus,'SessionSettings',key);manager.state.templates.push({id:require('node:crypto').randomUUID(),name:t.name.slice(0,120),createdAt:new Date().toISOString(),files:{'Game.ini':t.files['Game.ini'],'GameUserSettings.ini':gus,'Engine.ini':t.files['Engine.ini']},mods:validateMods((t.mods||[]).join(',')),passiveMods:validateMods((t.passiveMods||[]).join(','))});manager.save();return true;},
    importIni:async()=>{const r=await dialog.showOpenDialog(window,{properties:['openFile'],filters:[{name:'INI',extensions:['ini']}]});if(r.canceled)return null;const file=r.filePaths[0];if(fs.statSync(file).size>8*1024*1024)throw Error('File too large.');return require('./core/ini.cjs').read(file).text;},
    exportIni:async({file,text})=>{if(!['Game.ini','GameUserSettings.ini','Engine.ini'].includes(file))throw Error('Invalid file.');const r=await dialog.showSaveDialog(window,{defaultPath:file,filters:[{name:'INI',extensions:['ini']}]});if(r.canceled)return false;fs.writeFileSync(r.filePath,text,'utf8');return true;},
    external:url=>{if(!['https://ark.wiki.gg/wiki/Server_configuration','https://ark.wiki.gg/wiki/Console_commands','https://developer.valvesoftware.com/wiki/SteamCMD','https://developer.valvesoftware.com/wiki/SteamCMD#Downloading_SteamCMD','https://discord.com/developers/applications','https://www.curseforge.com/ark-survival-ascended'].includes(url))throw Error('Unsupported link.');return shell.openExternal(url);},
    remove:async id=>{const s=manager.server(id);await manager.assertStopped(s);if(manager.fleetBusy||manager.jobs.has(id))throw Error('Server is busy.');manager.state.servers=manager.state.servers.filter(x=>x.id!==id);manager.state.schedules=manager.state.schedules.filter(x=>x.serverId!==id);manager.save();manager.event(null,'unregistered',s.name+' removed from manager; all server files and backups retained.');},
  };
  ipcMain.handle('asa',async(event,method,data)=>{if(event.sender!==window.webContents||event.senderFrame!==window.webContents.mainFrame)return {ok:false,error:'Access denied.'};try{if(!Object.hasOwn(routes,method))throw Error('Unknown action.');return {ok:true,value:await routes[method](data)};}catch(e){return {ok:false,error:e.message};}});
}
if(primaryInstance)app.whenReady().then(async()=>{
  Menu.setApplicationMenu(null);
  let preferences={language:'es',theme:'dark'};
  try{const saved=JSON.parse(fs.readFileSync(path.join(app.getPath('userData'),'fleet','manager.json'),'utf8')).settings;if(['en','es','pt','ru','zh','ja'].includes(saved?.language))preferences.language=saved.language;if(['light','dark'].includes(saved?.theme))preferences.theme=saved.theme;}catch{}
  startup=new StartupScreen({...preferences,version:app.getVersion()});let startupError='';try{await startup.open();}catch(error){startupError=error.message;startup.destroy();startup=null;}
  try{manager=new Manager(path.join(app.getPath('userData'),'fleet'),{encode:x=>protect(x,'encode'),decode:x=>protect(x,'decode'),notify:event=>{if(window&&!window.isDestroyed())window.webContents.send('asa:event',event);}});}
  catch(e){startup?.destroy();dialog.showErrorBox('ASA Chispi Manager',e.message);app.quit();return;}
  if(startupError)manager.log('manager','Startup screen: '+startupError);
  window=new BrowserWindow({show:false,width:1480,height:980,minWidth:1080,minHeight:720,backgroundColor:preferences.theme==='light'?'#f4f0fb':'#100d1b',title:'ASA Chispi Manager',icon:path.join(__dirname,'..','assets','icon.ico'),webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
  register();window.webContents.setWindowOpenHandler(()=>({action:'deny'}));window.webContents.on('will-navigate',(event,url)=>{if(url!==window.webContents.getURL())event.preventDefault();});
  startup?.status('startup-servers');await manager.refreshProcesses().catch(e=>manager.log('manager',e.message));
  startup?.status('startup-interface');
  const rendererReady=new Promise((resolve,reject)=>{
    const timeout=setTimeout(()=>{ipcMain.removeListener('startup:ready',ready);reject(Error('The interface did not finish starting. Please reopen ASA Chispi Manager.'));},20000);
    function ready(event){if(event.sender!==window.webContents||event.senderFrame!==window.webContents.mainFrame)return;clearTimeout(timeout);ipcMain.removeListener('startup:ready',ready);resolve();}
    ipcMain.on('startup:ready',ready);
  });
  await Promise.all([window.loadURL(pathToFileURL(path.join(__dirname,'ui','index.html')).href),rendererReady]);if(startup)await startup.finish(window);else window.show();
  timer=setInterval(()=>manager.tick(),15000);scheduleTimer=setInterval(()=>manager.scheduleTick(),15000);manager.tick();
  let closing=false;window.on('close',async e=>{if(closing)return;if(manager.jobs.size||manager.updateBusy){e.preventDefault();await dialog.showMessageBox(window,{type:'info',message:'An operation is in progress. Wait for it to finish before closing.'});return;}
    const running=manager.state.servers.some(s=>s.pid);if(running){e.preventDefault();const r=await dialog.showMessageBox(window,{type:'question',buttons:['Keep manager open','Close manager'],defaultId:0,cancelId:0,message:'Servers will keep running. Scheduled backups and Discord/chat bridges stop when the manager is closed.'});if(r.response===1){closing=true;window.close();}}});
}).catch(e=>{startup?.destroy();dialog.showErrorBox('ASA Chispi Manager',e.message);app.quit();});
app.on('second-instance',()=>{if(window?.isVisible()){if(window.isMinimized())window.restore();window.focus();}else if(startup&&!startup.window.isDestroyed()){startup.window.show();startup.window.focus();}});
app.on('window-all-closed',()=>{clearInterval(timer);clearInterval(scheduleTimer);app.quit();});
