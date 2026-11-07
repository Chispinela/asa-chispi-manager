const fs=require('node:fs');
const fsp=fs.promises;
const path=require('node:path');
const crypto=require('node:crypto');
const {spawn,execFile}=require('node:child_process');
const {promisify}=require('node:util');
const run=promisify(execFile);
const ini=require('./ini.cjs');
const rcon=require('./rcon.cjs');
const schedules=require('./schedule.cjs');
const {catalog,maps,flags}=require('./catalog.cjs');
const steam=require('./steam.cjs');
const {DiscordPanel,validPanelHost}=require('./discord-panel.cjs');
const EXE=path.join('ShooterGame','Binaries','Win64','ArkAscendedServer.exe');
const CONFIG=path.join('ShooterGame','Saved','Config','WindowsServer');
const cleanString=(v,max=500)=>{if(typeof v!=='string'||v.length>max||/[\0\r\n]/.test(v))throw Error('Invalid text value.');return v;};
const exists=p=>fs.existsSync(p);
const canonical=p=>path.resolve(p).replace(/[\\/]+$/,'').toLowerCase();
const overlaps=(a,b)=>{a=canonical(a);b=canonical(b);return a===b||a.startsWith(b+path.sep)||b.startsWith(a+path.sep);};
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const discordCursorNow=()=>String(BigInt(Date.now()-1420070400000)<<22n);
function port(v) {v=Number(v);if(!Number.isInteger(v)||v<1024||v>65534)throw Error('Ports must be between 1024 and 65534.');return v;}
function validateMods(text) {const ids=String(text).split(/[\s,;]+/).filter(Boolean);if(ids.some(x=>!/^\d{4,12}$/.test(x)))throw Error('Use numeric CurseForge project IDs.');if(new Set(ids).size!==ids.length)throw Error('Duplicate mod IDs.');return ids;}
function validateArgs(list) {if(!Array.isArray(list)||list.length>100)throw Error('Use one launch argument per line.');return list.map(x=>{cleanString(x,1000);if(!/^-[-a-zA-Z0-9_]+(?:=[^\r\n\0]*)?$/.test(x))throw Error('Custom arguments must start with a hyphen.'); if(/^-(?:port|queryport|WinLiveMaxPlayers|mods|passivemods|clusterid|ClusterDirOverride|ServerPlatform)(?:=|$)/i.test(x))throw Error('Use the dedicated fields for managed launch arguments.');return x;});}
function argsFor(s,cluster) {
  if(!/^[a-zA-Z0-9_/-]+$/.test(s.map))throw Error('Invalid map package name.');
  const args=[`${s.map}?listen${s.altSave?'?AltSaveDirectoryName='+s.altSave:''}`,`-port=${s.port}`,`-QueryPort=${s.queryPort}`,`-WinLiveMaxPlayers=${s.maxPlayers}`,`-ServerPlatform=${s.platform||'ALL'}`,'-log'];
  if(s.mods?.length)args.push(`-mods=${s.mods.join(',')}`);
  if(s.passiveMods?.length)args.push(`-passivemods=${s.passiveMods.join(',')}`);
  if(cluster)args.push(`-clusterid=${cluster.id}`,`-ClusterDirOverride=${cluster.folder}`,'-NoTransferFromFiltering');
  for(const f of s.flags||[])if(flags.includes(f)&&!args.includes('-'+f))args.push('-'+f);
  args.push(...validateArgs(s.extraArgs||[]));return args;
}
class Manager {
  constructor(dataDir,{encode=x=>x,decode=x=>x,notify=()=>{}}={}) {
    this.dir=dataDir;this.encode=encode;this.decode=decode;this.notify=notify;this.jobs=new Map();this.children=new Map();this.online=new Set();this.queues=new Map();this.logs=new Map();this.chat=[];this.discordCursor=discordCursorNow();this.discordError='';this.ticking=false;this.updateBusy=false;
    fs.mkdirSync(dataDir,{recursive:true});this.file=path.join(dataDir,'manager.json');
    const empty={schema:1,servers:[],clusters:[],templates:[],schedules:[],players:{},events:[],settings:{language:'es',theme:'dark',steamcmd:'',botToken:'',channelId:'',discordInbound:false},backups:[]};
    if(exists(this.file)){try{this.state=this.decode(JSON.parse(fs.readFileSync(this.file,'utf8')));}catch(e){throw Error('Manager data could not be read. Preserve manager.json and manager.json.previous before recovery. '+e.message);}}else{this.state=empty;this.save();}
    this.state={...empty,...this.state};
    this.discordPanel=new DiscordPanel(this);
    for(const s of this.state.servers)if(s.steamUpdate?.status==='running'){s.steamUpdate={...s.steamUpdate,status:'interrupted',error:'The manager closed before the update was confirmed.'};}
  }
  save(){if(exists(this.file))fs.copyFileSync(this.file,this.file+'.previous');ini.atomic(this.file,JSON.stringify(this.encode(this.state),null,2));}
  event(server,type,message){const e={id:crypto.randomUUID(),at:new Date().toISOString(),serverId:server?.id||null,type,message:String(message).slice(0,2000)};this.state.events.unshift(e);this.state.events=this.state.events.slice(0,1000);this.save();this.notify(e);}
  log(id,line){const lines=this.logs.get(id)||[];lines.push(String(line).slice(0,4000));this.logs.set(id,lines.slice(-500));}
  server(id){const s=this.state.servers.find(s=>s.id===id);if(!s)throw Error('Server not found.');return s;}
  configFile(s,file){if(!['Game.ini','GameUserSettings.ini','Engine.ini'].includes(file))throw Error('Unsupported configuration file.');return path.join(s.folder,CONFIG,file);}
  async processes(){if(process.platform!=='win32')return []; const {stdout}=await run('powershell.exe',['-NoProfile','-NonInteractive','-Command',"Get-CimInstance Win32_Process -Filter \"Name='ArkAscendedServer.exe'\" | Select-Object ProcessId,ExecutablePath,CommandLine,CreationDate | ConvertTo-Json -Compress"],{windowsHide:true,maxBuffer:4*1024*1024});if(!stdout.trim())return [];const data=JSON.parse(stdout);return Array.isArray(data)?data:[data];}
  async refreshProcesses(){const processes=await this.processes();if(processes.some(p=>!p.ExecutablePath))throw Error('A running ASA process cannot be identified. Use the Windows account that owns the servers.');this.processesCache=processes;for(const s of this.state.servers){const p=processes.find(p=>canonical(p.ExecutablePath)===canonical(path.join(s.folder,EXE)));if(p){if(s.pid!==p.ProcessId)s.readyNotified=false;s.pid=p.ProcessId;const value=p.CreationDate;const legacy=String(value||'').match(/\/Date\((\d+)/);s.startedAt=legacy?new Date(Number(legacy[1])).toISOString():value||s.startedAt;}else{s.pid=null;s.readyNotified=false;this.online.delete(s.id);}}return processes;}
  async assertStopped(s){await this.refreshProcesses();if(s.pid)throw Error('Stop the server first.');}
  async exclusive(id,operation,fn){if(this.fleetBusy||this.jobs.has(id))throw Error('Another operation is already in progress for this server.');this.jobs.set(id,operation);try{return await fn();}finally{this.jobs.delete(id);}}
  async validateFolder(folder,{creating=false}={}) {
    if(typeof folder!=='string'||!folder.trim())throw Error('Choose a server folder.');
    folder=path.resolve(cleanString(folder,1500));const parsed=path.parse(folder);
    if(folder===parsed.root||canonical(folder)===canonical(this.dir))throw Error('Choose a dedicated server folder.');
    if(this.state.servers.some(s=>overlaps(s.folder,folder)))throw Error('This folder overlaps another managed server.');
    if(overlaps(folder,this.dir))throw Error('Server folders must be separate from the manager data directory.');
    if(creating&&exists(folder)&&(await fsp.readdir(folder)).length)throw Error('Create requires an empty folder. Use Import for an existing server.');
    // Reject symlink/junction aliases, including parent folders, to avoid double management.
    let cursor=folder;while(true){if(exists(cursor)&&(await fsp.lstat(cursor)).isSymbolicLink())throw Error('Choose the real folder path, not a junction or symlink.');const parent=path.dirname(cursor);if(parent===cursor)break;cursor=parent;}
    return folder;
  }
  validateServer(data,excludeId){
    const s={...data};s.name=cleanString(s.name,120).trim();if(!s.name||/[?=]/.test(s.name))throw Error('Enter a server name without ? or =.');s.map=cleanString(s.map,160);if(!/^[a-zA-Z0-9_/-]+$/.test(s.map))throw Error('Invalid map package name.');
    s.port=port(s.port);s.queryPort=port(s.queryPort);s.rconPort=port(s.rconPort);s.maxPlayers=Number(s.maxPlayers);if(!Number.isInteger(s.maxPlayers)||s.maxPlayers<1||s.maxPlayers>1000)throw Error('Player slots must be 1–1000.');
    const udp=[s.port,s.port+1,s.queryPort];if(new Set(udp).size!==3)throw Error('Game, peer and query ports must be different.');
    for(const other of this.state.servers.filter(x=>x.id!==excludeId)){if(udp.some(p=>[other.port,other.port+1,other.queryPort].includes(p))||other.rconPort===s.rconPort)throw Error('Port conflict with '+other.name);}
    if(!/^(ALL|(?:PC|PS5|XSX|WINGDK)(?:\+(?:PC|PS5|XSX|WINGDK))*)$/.test(s.platform||'ALL'))throw Error('Invalid server platform.');
    s.mods=validateMods((s.mods||[]).join(','));s.passiveMods=validateMods((s.passiveMods||[]).join(','));s.extraArgs=validateArgs(s.extraArgs||[]);
    if(s.altSave&&!/^[a-zA-Z0-9_-]{1,120}$/.test(s.altSave))throw Error('Alternate save folder must use letters, numbers, hyphens or underscores.');
    s.flags=(s.flags||[]).filter(f=>flags.includes(f));return s;
  }
  inspectFolder(folder){
    folder=path.resolve(folder);if(path.basename(folder).toLowerCase()==='arkascendedserver.exe')folder=path.resolve(folder,'..','..','..','..');
    if(!exists(path.join(folder,EXE)))throw Error('Select the server root containing ShooterGame/Binaries/Win64/ArkAscendedServer.exe.');
    const gus=ini.read(path.join(folder,CONFIG,'GameUserSettings.ini')).text;
    const value=(section,key,fallback)=>ini.get(gus,section,key)??fallback;
    const scripts=fs.readdirSync(folder).filter(n=>/\.(bat|cmd|ps1)$/i.test(n));let launch='';
    for(const file of scripts.slice(0,20)){const stat=fs.statSync(path.join(folder,file));if(stat.size<256000)launch+='\n'+fs.readFileSync(path.join(folder,file),'utf8');}
    const map=launch.match(/([a-zA-Z0-9]+_WP)\b/)?.[1]||'';
    const find=(name,fallback)=>launch.match(new RegExp(`-${name}=(?:"([^"]+)"|([^\\s"\r\n]+))`,'i'))?.slice(1).find(Boolean)||fallback;
    const alt=launch.match(/\?AltSaveDirectoryName=([^?\s"]+)/i)?.[1]||'';
    return {folder,name:value('SessionSettings','SessionName',path.basename(folder)),map,port:Number(find('port',value('SessionSettings','Port',7777))),queryPort:Number(find('QueryPort',value('SessionSettings','QueryPort',27015))),rconPort:Number(value('ServerSettings','RCONPort',27020)),maxPlayers:Number(find('WinLiveMaxPlayers',70)),platform:find('ServerPlatform','ALL'),mods:validateMods(find('mods','')),passiveMods:validateMods(find('passivemods','')),rconEnabled:/true/i.test(value('ServerSettings','RCONEnabled','false')),adminConfigured:!!value('ServerSettings','ServerAdminPassword',''),detectedCluster:find('clusterid',''),detectedClusterFolder:find('ClusterDirOverride',''),altSave:alt,scripts,warnings:['HaruHost must be stopped before takeover.','Review map, launch arguments, ports and existing cluster settings.','Import registers the existing folder; INI files are not rewritten.']};
  }
  async create({serverPassword='',adminPassword='',...data}){
    const joinPassword=cleanString(serverPassword,128).trim();
    const password=cleanString(adminPassword,128).trim()||crypto.randomBytes(20).toString('hex');
    const folder=await this.validateFolder(data.folder,{creating:true});const s=this.validateServer({...data,folder,id:crypto.randomUUID(),mods:[],passiveMods:[],flags:['servergamelog'],extraArgs:[],clusterId:'',bridgeGroup:'',discord:{},createdAt:new Date().toISOString()});
    await fsp.mkdir(path.join(folder,CONFIG),{recursive:true});
    let text='';for(const [section,key,value] of [['SessionSettings','SessionName',s.name],['ServerSettings','RCONEnabled','True'],['ServerSettings','RCONPort',s.rconPort],['ServerSettings','ServerAdminPassword',password]])text=ini.set(text,section,key,value);
    if(joinPassword)text=ini.set(text,'ServerSettings','ServerPassword',joinPassword);
    ini.write(this.configFile(s,'GameUserSettings.ini'),text);ini.write(this.configFile(s,'Game.ini'),'[/script/shootergame.shootergamemode]\r\n');
    this.state.servers.push(s);this.save();this.event(s,'created','Server registered. Install server files with the update button.');return s;
  }
  async importServer(data){
    const folder=await this.validateFolder(data.folder);const info=this.inspectFolder(folder);const s=this.validateServer({...info,...data,folder,id:crypto.randomUUID(),flags:data.flags||[],extraArgs:data.extraArgs||[],clusterId:'',discord:{},bridgeGroup:'',createdAt:new Date().toISOString()});
    const running=await this.processes();if(running.some(p=>p.ExecutablePath&&canonical(p.ExecutablePath)===canonical(path.join(folder,EXE))))throw Error('The existing server is still running. Stop HaruHost/server before importing.');
    if(info.detectedCluster&&!data.clusterReviewed)throw Error('Review existing cluster settings before importing.');
    this.state.servers.push(s);this.save();this.event(s,'imported','Existing server imported without rewriting its configuration.');return s;
  }
  async updateServer(id,patch){return this.exclusive(id,'configuration',async()=>{
    const s=this.server(id);await this.assertStopped(s);const allowed=['name','map','port','queryPort','rconPort','maxPlayers','platform','mods','passiveMods','flags','extraArgs','altSave','bridgeGroup','playerSnapshot'];const data={...s};for(const k of allowed)if(k in patch)data[k]=patch[k];
    const validated=this.validateServer(data,id);if(validated.playerSnapshot)cleanString(validated.playerSnapshot,1500);if(validated.bridgeGroup&&!/^[\w-]{1,64}$/.test(validated.bridgeGroup))throw Error('Chat group: letters, numbers, hyphens or underscores only.');
    if(['name','rconPort','serverPassword'].some(k=>k in patch)){
      const file=this.configFile(s,'GameUserSettings.ini'),original=ini.read(file);let text=original.text;
      if('name' in patch)text=ini.set(text,'SessionSettings','SessionName',validated.name);
      if('rconPort' in patch)text=ini.set(text,'ServerSettings','RCONPort',validated.rconPort);
      if('serverPassword' in patch){
        const password=cleanString(patch.serverPassword,128).trim();
        text=password?ini.set(text,'ServerSettings','ServerPassword',password):removeKey(text,'ServerSettings','ServerPassword');
      }
      ini.write(file,text,ini.hash(original.text));
    }
    Object.assign(s,validated);this.save();this.event(s,'configuration','Server settings saved.');return s;
  });}
  configs(id){const s=this.server(id);return Object.fromEntries(['Game.ini','GameUserSettings.ini','Engine.ini'].map(file=>{const data=ini.read(this.configFile(s,file));return [file,{text:data.text,hash:ini.hash(data.text)}];}));}
  async saveConfig(id,{file,text,hash}){return this.saveConfigs(id,{[file]:{text,hash}});}
  async saveConfigs(id,files){return this.exclusive(id,'configuration',async()=>{
    const s=this.server(id);await this.assertStopped(s);const entries=Object.entries(files);if(entries.length>3)throw Error('Too many configuration files.');const originals={};
    for(const [file,data] of entries){const target=this.configFile(s,file);if(typeof data.text!=='string'||Buffer.byteLength(data.text)>8*1024*1024)throw Error('Configuration exceeds 8 MB.');if(typeof data.hash!=='string'||ini.hash(ini.read(target).text)!==data.hash)throw Error('File changed on disk. Reload before saving.');originals[file]=exists(target)?fs.readFileSync(target):null;}
    let validated=null;if(files['GameUserSettings.ini']){const newPort=ini.get(files['GameUserSettings.ini'].text,'ServerSettings','RCONPort');if(newPort!==undefined)validated=this.validateServer({...s,rconPort:Number(newPort)},id);}
    const written=[];try{for(const [file,data] of entries){ini.write(this.configFile(s,file),data.text,data.hash);written.push(file);}}catch(e){for(const file of written){const target=this.configFile(s,file);if(originals[file])ini.atomic(target,originals[file]);else if(exists(target))fs.unlinkSync(target);}throw e;}
    if(validated)s.rconPort=validated.rconPort;this.event(s,'configuration',entries.map(([file])=>file).join(', ')+' saved; previous files backed up.');return this.configs(id);
  });}
  rconSettings(s){const text=ini.read(this.configFile(s,'GameUserSettings.ini')).text;return {host:'127.0.0.1',port:Number(ini.get(text,'ServerSettings','RCONPort')||s.rconPort),password:ini.get(text,'ServerSettings','ServerAdminPassword')||''};}
  async command(id,text){const s=this.server(id);const prev=this.queues.get(id)||Promise.resolve();const next=prev.catch(()=>{}).then(()=>rcon.command(this.rconSettings(s),text));this.queues.set(id,next);try{return await next;}finally{if(this.queues.get(id)===next)this.queues.delete(id);}}
  async start(id){return this.exclusive(id,'starting',()=>this.startInternal(this.server(id)));}
  async startInternal(s){
    await this.assertStopped(s);const exe=path.join(s.folder,EXE);if(!exists(exe))throw Error('Install the ASA dedicated server files first.');
    const configs=this.configs(s.id),gus=configs['GameUserSettings.ini'].text;
    const actualPort=Number(ini.get(gus,'ServerSettings','RCONPort')||27020);if(actualPort!==s.rconPort)throw Error('RCONPort in GameUserSettings.ini differs from launch settings. Set both to the same port.');
    const args=argsFor(s,this.state.clusters.find(c=>c.id===s.clusterId));
    const logDir=path.join(this.dir,'logs');await fsp.mkdir(logDir,{recursive:true});const output=fs.openSync(path.join(logDir,s.id+'.log'),'a');
    const child=spawn(exe,args,{cwd:path.dirname(exe),windowsHide:true,detached:true,stdio:['ignore',output,output]});fs.closeSync(output);
    await new Promise((resolve,reject)=>{child.once('spawn',resolve);child.once('error',reject);});
    s.pid=child.pid;s.readyNotified=false;s.startedAt=new Date().toISOString();this.children.set(s.id,child);
    child.on('exit',(code)=>{if(this.children.get(s.id)!==child)return;this.children.delete(s.id);s.pid=null;this.online.delete(s.id);this.event(s,'exited',`Server process exited (${code}).`);this.webhook(s,'exited').catch(e=>this.log(s.id,e.message));});
    child.unref();this.save();this.event(s,'starting','Server process launched; waiting for RCON.');await this.webhook(s,'starting');return {pid:s.pid};
  }
  async stopInternal(s){
    await this.refreshProcesses();if(!s.pid)return;
    await this.command(s.id,'SaveWorld');this.event(s,'stopping','World save requested; closing the server.');await this.webhook(s,'stopping');
    await this.command(s.id,'DoExit').catch(e=>{if(!/closed|ECONNRESET|timeout/.test(e.message))throw e;});
    const end=Date.now()+120000;while(Date.now()<end){await wait(1500);await this.refreshProcesses();if(!s.pid){this.save();return;}}
    throw Error('Server did not stop within 120 seconds. No forced termination was performed.');
  }
  async stop(id){return this.exclusive(id,'stopping',()=>this.stopInternal(this.server(id)));}
  async restart(id){return this.exclusive(id,'restarting',async()=>{const s=this.server(id);await this.webhook(s,'restarting');await this.stopInternal(s);return this.startInternal(s);});}
  async webhook(s,type){const d=s.discord||{},template=d.messages?.[type];if(!d.webhook||!template)return;try{await this.postWebhook(d.webhook,template.replaceAll('{server}',s.name).replaceAll('{map}',s.map).replaceAll('{time}',new Date().toLocaleString()),s.name);}catch(e){this.log(s.id,'Discord: '+e.message);this.event(s,'integration-error','Discord notification failed: '+e.message);}}
  async postWebhook(url,text,username='ASA Chispi Manager'){
    if(!/^https:\/\/(?:canary\.|ptb\.)?discord(?:app)?\.com\/api(?:\/v\d+)?\/webhooks\/\d+\/[A-Za-z0-9._-]+$/.test(url))throw Error('Enter a valid Discord webhook URL.');
    const response=await fetch(url+'?wait=true',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({content:String(text).slice(0,1900),username:username.slice(0,80),allowed_mentions:{parse:[]}}),signal:AbortSignal.timeout(10000)});if(!response.ok)throw Error('Discord HTTP '+response.status);
  }
  async discordRequest(endpoint,options={}){
    const token=this.state.settings.botToken;if(!token)throw Error('Enter the Discord bot token in the protected manager field first.');
    const headers={Authorization:'Bot '+token,...(!(options.body instanceof FormData)?{'Content-Type':'application/json'}:{}),...options.headers};
    const response=await fetch('https://discord.com/api/v10'+endpoint,{...options,headers,signal:AbortSignal.timeout(10000)});
    if(!response.ok){
      const descriptions={401:'The bot token is not valid.',403:'The bot cannot access this channel. Review its channel permissions.',404:'The Discord channel or message was not found or is not visible to this bot.',429:'Discord rate limit reached. Wait before trying again.'};
      const error=Error(`Discord HTTP ${response.status}: ${descriptions[response.status]||'Request failed.'}`);
      if(response.status===404){const body=await response.json().catch(()=>null);error.discordCode=body?.code;}
      throw error;
    }
    return response.status===204?null:response.json();
  }
  async discordStatus(){
    const d=this.state.settings;if(!d.channelId)throw Error('Set the Discord channel ID first.');
    const bot=await this.discordRequest('/users/@me');if(!bot.bot)throw Error('This token does not identify a Discord bot.');
    const channel=await this.discordRequest('/channels/'+d.channelId);
    if(d.discordGuildId&&channel.guild_id!==d.discordGuildId)throw Error('This channel belongs to a different Discord server.');
    await this.discordRequest(`/channels/${d.channelId}/messages?limit=1`);
    const application=d.discordInbound?await this.discordRequest('/applications/@me'):null;
    // Discord exposes separate Message Content flags for approved and limited applications.
    const messageContent=application?Boolean(application.flags&((1<<18)|(1<<19))):null;
    const status={botId:bot.id,botName:bot.username,channelId:channel.id,channelName:channel.name,guildId:channel.guild_id||'',historyReadable:true,messageContent};
    if(this.state.settings===d)this.verifiedDiscord={...status,at:Date.now()};
    return status;
  }
  async postBotChat(text){const d=this.state.settings;if(!d.channelId)throw Error('Set the Discord channel ID first.');if(!this.verifiedDiscord||this.verifiedDiscord.channelId!==d.channelId||Date.now()-this.verifiedDiscord.at>300000)await this.discordStatus();return this.discordRequest(`/channels/${d.channelId}/messages`,{method:'POST',body:JSON.stringify({content:String(text).slice(0,1900),allowed_mentions:{parse:[]}})});}
  version(s){const candidates=[path.join(s.folder,'version.txt'),path.join(s.folder,'ShooterGame','Binaries','Win64','version.txt')];let gameVersion='';for(const p of candidates)if(exists(p)){const text=fs.readFileSync(p,'utf8').trim();if(/^\d+(?:\.\d+){1,3}$/.test(text)){gameVersion=text;break;}}
    if(!gameVersion){const log=path.join(s.folder,'ShooterGame','Saved','Logs','ShooterGame.log');if(exists(log)){const fd=fs.openSync(log,'r');try{const size=fs.fstatSync(fd).size;for(const offset of [0,Math.max(0,size-128000)]){const b=Buffer.alloc(Math.min(128000,size-offset));fs.readSync(fd,b,0,b.length,offset);const matches=[...b.toString('utf8').matchAll(/(?:ARK (?:Server )?Version|Server Version)\s*[:=]\s*(\d+\.\d+(?:\.\d+)?)/gi)];if(matches.length)gameVersion=matches.at(-1)[1];}}finally{fs.closeSync(fd);}}}const manifest=[path.join(s.folder,'steamapps','appmanifest_2430930.acf')].find(exists);let build='';if(manifest)build=fs.readFileSync(manifest,'utf8').match(/"buildid"\s+"(\d+)"/)?.[1]||'';return {gameVersion,build,installed:exists(path.join(s.folder,EXE))};}
  steamConsole(id){const s=this.server(id),session=s.steamUpdate||null;let output='';if(session?.logFile&&exists(session.logFile)){const fd=fs.openSync(session.logFile,'r');try{const size=fs.fstatSync(fd).size,buffer=Buffer.alloc(Math.min(size,128000));fs.readSync(fd,buffer,0,buffer.length,Math.max(0,size-buffer.length));output=buffer.toString('utf8');}finally{fs.closeSync(fd);}}return {session,output,busy:this.jobs.has(id)};}
  steamOutput(s,text){if(s.steamUpdate?.logFile)fs.appendFileSync(s.steamUpdate.logFile,text,'utf8');this.notify({type:'steam-output',serverId:s.id,text});}
  async ensureSteam(s){
    const configured=this.state.settings.steamcmd,managed=path.join(this.dir,'tools','steamcmd','steamcmd.exe');
    for(const file of [configured,managed])if(file&&exists(file)&&path.basename(file).toLowerCase()==='steamcmd.exe'){if(configured!==file){this.state.settings.steamcmd=file;this.save();}return file;}
    this.steamOutput(s,'Downloading official SteamCMD into this Windows user’s manager data folder…\n');
    return this.downloadSteamFiles();
  }
  async install(id){return this.exclusiveGroup(id,'updating',async()=>{
    if(this.updateBusy)throw Error('Another SteamCMD update is running.');this.updateBusy=true;const s=this.server(id);
    const logFolder=path.join(this.dir,'logs','steamcmd',s.id);let scriptFile;
    try {
      await fsp.mkdir(logFolder,{recursive:true});const logFile=path.join(logFolder,new Date().toISOString().replace(/[:.]/g,'-')+'.log');
      s.steamUpdate={status:'running',startedAt:new Date().toISOString(),logFile,attempt:1,phase:'preparing'};this.save();
      this.steamOutput(s,`ASA Chispi Manager · SteamCMD\nServer: ${s.name}\nFolder: ${s.folder}\nApp: 2430930\n\n`);
      await this.assertStopped(s);
      if(exists(path.join(s.folder,'ShooterGame','Saved'))){this.steamOutput(s,'Creating safety backup before update…\n');await this.backupInternal(s,'before-update');}
      const executable=await this.ensureSteam(s);await this.webhook(s,'updating');
      scriptFile=path.join(logFolder,'update-'+crypto.randomUUID()+'.txt');await fsp.writeFile(scriptFile,steam.steamScript(s.folder,{install:false}),'utf8');
      s.steamUpdate.phase='bootstrap';this.save();this.steamOutput(s,`SteamCMD: ${executable}\nPreparing SteamCMD and checking anonymous login before updating the game…\n\n`);
      for(let bootstrapAttempt=1;bootstrapAttempt<=2;bootstrapAttempt++){
        const boot=await steam.runSteam({executable,scriptFile,cwd:path.dirname(executable),logFile,onOutput:text=>this.notify({type:'steam-output',serverId:id,text})});
        s.steamUpdate.bootstrapExitCode=boot.code;s.steamUpdate.bootstrapAttempts=bootstrapAttempt;
        if(boot.code===0&&steam.loginReady(boot.output))break;
        if(bootstrapAttempt===1&&steam.bootstrapRestart(boot)){this.steamOutput(s,`\nSteamCMD self-update exited with code ${boot.code}. Reopening the prepared client once before installing ASA…\n`);await wait(2000);continue;}
        throw Error(steam.explainFailure(boot.output,boot.code));
      }
      await fsp.writeFile(scriptFile,steam.steamScript(s.folder),'utf8');s.steamUpdate.phase='steamcmd';this.save();this.steamOutput(s,'\nSteamCMD is ready. Starting ASA app 2430930 update…\n\n');
      let result;
      for(let attempt=1;attempt<=2;attempt++){
        s.steamUpdate.attempt=attempt;this.save();
        result=await steam.runSteam({executable,scriptFile,cwd:path.dirname(executable),logFile,onOutput:text=>this.notify({type:'steam-output',serverId:id,text})});
        s.steamUpdate.exitCode=result.code;s.steamUpdate.signal=result.signal||null;
        if(attempt===1&&steam.needsBootstrapRetry(result.output)){this.steamOutput(s,'\nSteamCMD reported Missing configuration during self-update. Waiting 2 seconds, then retrying once…\n');await wait(2000);continue;}
        break;
      }
      if(result.code!==0||!steam.confirmed(result.output))throw Error(steam.explainFailure(result.output,result.code));
      if(!exists(path.join(s.folder,EXE)))throw Error('SteamCMD reported success but ArkAscendedServer.exe is missing from the selected server folder.');
      s.updatedAt=new Date().toISOString();s.steamUpdate.status='success';s.steamUpdate.phase='complete';s.steamUpdate.finishedAt=s.updatedAt;this.steamOutput(s,'\nUpdate confirmed. Server files are ready.\n');this.event(s,'updated','SteamCMD confirmed installation/update.');return this.version(s);
    }catch(error){if(s.steamUpdate){s.steamUpdate.status='error';s.steamUpdate.error=error.message;s.steamUpdate.finishedAt=new Date().toISOString();this.steamOutput(s,'\nERROR: '+error.message+'\n');this.event(s,'update-error',error.message);}throw error;}
    finally{this.updateBusy=false;if(scriptFile&&exists(scriptFile))await fsp.unlink(scriptFile).catch(error=>this.log(id,'SteamCMD script cleanup: '+error.message));}
  });}
  async backupInternal(s,reason='manual'){
    await this.assertStopped(s);const saved=path.join(s.folder,'ShooterGame','Saved');if(!exists(saved))throw Error('No Saved folder to back up.');
    const id=crypto.randomUUID(),folder=path.join(this.dir,'backups',s.id);await fsp.mkdir(folder,{recursive:true});const file=path.join(folder,new Date().toISOString().replace(/[:.]/g,'-')+'-'+id.slice(0,8)+'.tar');
    const stage=path.join(this.dir,'staging',id);await fsp.mkdir(stage,{recursive:true});
    try {
      await this.assertNoLinks(saved);await fsp.cp(saved,path.join(stage,'Saved'),{recursive:true,errorOnExist:true,force:false});
      const cluster=this.state.clusters.find(c=>c.id===s.clusterId);
      let clusterIncluded=false;
      if(cluster&&exists(cluster.folder)){if(this.state.servers.some(other=>other.clusterId===cluster.id&&other.pid))throw Error('Stop all cluster members for a consistent cluster backup.');await this.assertNoLinks(cluster.folder);await fsp.cp(cluster.folder,path.join(stage,'Cluster'),{recursive:true});clusterIncluded=true;}
      const metadata={schema:1,serverId:s.id,name:s.name,map:s.map,createdAt:new Date().toISOString(),clusterId:s.clusterId||'',clusterIncluded,reason};
      await fsp.writeFile(path.join(stage,'backup.json'),JSON.stringify(metadata,null,2));
      await run('tar.exe',['-cf',file,'-C',stage,'.'],{windowsHide:true,timeout:3600000,maxBuffer:1024*1024});
      const digest=await this.fileHash(file),stat=await fsp.stat(file);const record={...metadata,id,file,sha256:digest,bytes:stat.size};this.state.backups.unshift(record);this.save();this.event(s,'backup','Backup completed and SHA-256 recorded.');await this.webhook(s,'backup');return record;
    }catch(e){if(exists(file))await fsp.unlink(file);throw e;}finally{await fsp.rm(stage,{recursive:true,force:true});}
  }
  async assertNoLinks(dir){for(const entry of await fsp.readdir(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);const stat=await fsp.lstat(file);if(stat.isSymbolicLink())throw Error('Backup cannot include junctions or symlinks: '+file);if(stat.isDirectory())await this.assertNoLinks(file);}}
  async fileHash(file){return new Promise((resolve,reject)=>{const hash=crypto.createHash('sha256'),stream=fs.createReadStream(file);stream.on('data',d=>hash.update(d));stream.on('error',reject);stream.on('end',()=>resolve(hash.digest('hex')));});}
  async backup(id,reason='manual'){
    const s=this.server(id),members=s.clusterId?this.state.servers.filter(x=>x.clusterId===s.clusterId):[s];
    if(this.fleetBusy||members.some(x=>this.jobs.has(x.id)))throw Error('A server in this backup group is busy.');
    for(const m of members)this.jobs.set(m.id,'backup');const restart=[];let result,operationError;const restartErrors=[];
    try{await this.refreshProcesses();for(const m of members){if(m.pid){restart.push(m);await this.stopInternal(m);}}result=await this.backupInternal(s,reason);}catch(e){operationError=e;}
    finally{for(const m of restart){try{await this.refreshProcesses();if(!m.pid)await this.startInternal(m);}catch(e){restartErrors.push(m.name+': '+e.message);this.event(m,'restart-error','Restart after backup failed: '+e.message);}}for(const m of members)this.jobs.delete(m.id);}
    if(operationError)throw operationError;if(restartErrors.length)throw Error('Backup completed, but restart needs attention: '+restartErrors.join('; '));return result;
  }
  async restore(id,backupId){return this.exclusiveGroup(id,'restoring',async()=>{
    const s=this.server(id);await this.assertStopped(s);const record=this.state.backups.find(b=>b.id===backupId&&b.serverId===id);if(!record)throw Error('Backup not found for this server.');
    if(await this.fileHash(record.file)!==record.sha256)throw Error('Backup checksum mismatch; restore cancelled.');
    const stage=path.join(this.dir,'staging','restore-'+crypto.randomUUID());await fsp.mkdir(stage,{recursive:true});
    try {
      const {stdout}=await run('tar.exe',['-tf',record.file],{windowsHide:true,maxBuffer:32*1024*1024});
      for(const entry of stdout.split(/\r?\n/).filter(Boolean)){const n=entry.replaceAll('\\','/');if(n.startsWith('/')||/^[a-z]:/i.test(n)||n.split('/').includes('..')||!(n==='./'||n==='.'||/^\.\/(Saved(?:\/|$)|Cluster(?:\/|$)|backup\.json$)/.test(n)))throw Error('Unsafe archive entry.');}
      await run('tar.exe',['-xf',record.file,'-C',stage],{windowsHide:true,timeout:3600000,maxBuffer:1024*1024});await this.assertNoLinks(stage);
      const meta=JSON.parse(await fsp.readFile(path.join(stage,'backup.json'),'utf8'));if(meta.serverId!==id||!exists(path.join(stage,'Saved')))throw Error('Backup belongs to a different server.');
      const cluster=record.clusterIncluded?this.state.clusters.find(c=>c.id===record.clusterId):null;
      if(record.clusterIncluded&&(!cluster||s.clusterId!==record.clusterId))throw Error('Restore requires the original cluster assignment.');
      if(cluster&&this.state.servers.some(x=>x.clusterId===cluster.id&&x.pid))throw Error('Stop all cluster servers before restoring shared transfer data.');
      await this.backupInternal(s,'before-restore');
      const stamp=Date.now(),saved=path.join(s.folder,'ShooterGame','Saved'),old=saved+'.before-restore-'+stamp;
      await fsp.rename(saved,old);
      try {await fsp.cp(path.join(stage,'Saved'),saved,{recursive:true});if(cluster){const oldCluster=cluster.folder+'.before-restore-'+stamp;if(exists(cluster.folder))await fsp.rename(cluster.folder,oldCluster);try{await fsp.cp(path.join(stage,'Cluster'),cluster.folder,{recursive:true});}catch(e){await fsp.rm(cluster.folder,{recursive:true,force:true});if(exists(oldCluster))await fsp.rename(oldCluster,cluster.folder);throw e;}}}
      catch(e){await fsp.rm(saved,{recursive:true,force:true});await fsp.rename(old,saved);throw e;}
      this.event(s,'restored','Saved folder restored. Previous folder retained alongside Saved.');return true;
    }finally{await fsp.rm(stage,{recursive:true,force:true});}
  });}
  async exclusiveGroup(id,operation,fn){const s=this.server(id),members=s.clusterId?this.state.servers.filter(x=>x.clusterId===s.clusterId):[s];if(this.fleetBusy||members.some(x=>this.jobs.has(x.id)))throw Error('A server in this cluster is busy.');for(const m of members)this.jobs.set(m.id,operation);try{return await fn();}finally{for(const m of members)this.jobs.delete(m.id);}}
  async cluster(data){
    if(!/^[a-zA-Z0-9_-]{3,64}$/.test(data.id))throw Error('Cluster ID: 3–64 letters, numbers, hyphens or underscores.');
    const members=[...new Set(data.serverIds||[])].map(id=>this.server(id));if(members.length<2)throw Error('Select at least two servers.');
    const affected=this.state.servers.filter(s=>s.clusterId===data.id||members.includes(s));for(const s of affected){if(this.jobs.has(s.id))throw Error('A selected server is busy.');await this.assertStopped(s);}
    if(members.some(s=>s.clusterId&&s.clusterId!==data.id))throw Error('Detach servers from their current cluster first.');
    if(typeof data.folder!=='string'||!data.folder.trim())throw Error('Choose a shared cluster folder.');const folder=path.resolve(cleanString(data.folder,1500));if(this.state.servers.some(s=>overlaps(folder,s.folder))||overlaps(folder,this.dir))throw Error('Choose a shared cluster folder outside server and manager data folders.');
    if(this.state.clusters.some(c=>c.id!==data.id&&overlaps(c.folder,folder)))throw Error('Cluster folders must be independent.');
    const previous=this.state.clusters.find(c=>c.id===data.id);if(previous&&canonical(previous.folder)!==canonical(folder))throw Error('Cluster storage cannot be moved here. Preserve the original shared folder.');
    await fsp.mkdir(folder,{recursive:true});if(canonical(fs.realpathSync(folder))!==canonical(folder))throw Error('Choose the real cluster directory, not a junction or symlink.');await this.assertNoLinks(folder);
    const c={id:data.id,name:cleanString(data.name||data.id,120),folder};if(previous)Object.assign(previous,c);else this.state.clusters.push(c);
    for(const s of affected)s.clusterId=members.includes(s)?c.id:'';
    this.save();this.event(null,'cluster','Cluster '+c.name+' configured.');return c;
  }
  async detachCluster(id){const s=this.server(id);await this.assertStopped(s);if(this.jobs.has(id))throw Error('Server is busy.');s.clusterId='';this.save();}
  async templateCreate({serverId,name}){const s=this.server(serverId),configs=this.configs(serverId);let gus=configs['GameUserSettings.ini'].text;
    for(const key of ['ServerAdminPassword','ServerPassword','RCONPort'])gus=removeKey(gus,'ServerSettings',key);gus=removeKey(gus,'SessionSettings','SessionName');gus=removeKey(gus,'SessionSettings','Port');gus=removeKey(gus,'SessionSettings','QueryPort');
    const t={id:crypto.randomUUID(),name:cleanString(name,120),createdAt:new Date().toISOString(),files:{'Game.ini':configs['Game.ini'].text,'GameUserSettings.ini':gus,'Engine.ini':configs['Engine.ini'].text},mods:s.mods,passiveMods:s.passiveMods};this.state.templates.push(t);this.save();return t;}
  async templateApply({templateId,serverId}){return this.exclusiveGroup(serverId,'template',async()=>{const s=this.server(serverId);await this.assertStopped(s);const t=this.state.templates.find(x=>x.id===templateId);if(!t)throw Error('Template not found.');
    await this.backupInternal(s,'before-template');const previous=this.configs(serverId);let gus=t.files['GameUserSettings.ini'];
    for(const [section,key,fallback] of [['ServerSettings','ServerAdminPassword',''],['ServerSettings','ServerPassword',''],['ServerSettings','RCONPort',s.rconPort],['SessionSettings','SessionName',s.name],['SessionSettings','Port',s.port],['SessionSettings','QueryPort',s.queryPort]]){gus=ini.set(gus,section,key,ini.get(previous['GameUserSettings.ini'].text,section,key)??fallback);}
    try{for(const file of Object.keys(t.files))ini.write(this.configFile(s,file),file==='GameUserSettings.ini'?gus:t.files[file],previous[file].hash);}catch(e){for(const file of Object.keys(previous))ini.write(this.configFile(s,file),previous[file].text);throw e;}
    s.mods=[...t.mods];s.passiveMods=[...t.passiveMods];this.save();this.event(s,'template','Template '+t.name+' applied; identity and passwords retained.');
  });}
  async refreshPlayers(id){const s=this.server(id),result=rcon.parsePlayers(await this.command(id,'ListPlayers')),ledger=this.state.players[id]||{};for(const p of Object.values(ledger))p.online=false;
    const now=new Date().toISOString();for(const p of result){ledger[p.accountId]={...ledger[p.accountId],...p,online:true,lastSeen:now,firstSeen:ledger[p.accountId]?.firstSeen||now};}
    if(s.playerSnapshot){const stat=await fsp.stat(s.playerSnapshot);if(stat.size>16*1024*1024)throw Error('Player snapshot exceeds 16 MB.');const snapshot=JSON.parse(await fsp.readFile(s.playerSnapshot,'utf8'));if(!Array.isArray(snapshot.players))throw Error('Player snapshot must contain a players array.');for(const p of snapshot.players){if(!/^[a-zA-Z0-9_-]{10,100}$/.test(p.accountId))continue;ledger[p.accountId]={...(ledger[p.accountId]||{accountId:p.accountId,online:false}),characterName:cleanString(p.characterName||'',120),playerId:/^\d+$/.test(String(p.playerId))?String(p.playerId):'',tribeName:cleanString(p.tribeName||'',120),tribeId:/^\d+$/.test(String(p.tribeId))?String(p.tribeId):'',metadataSource:'snapshot',metadataAt:new Date(stat.mtime).toISOString()};}}
    this.state.players[id]=ledger;this.online.add(id);this.save();return Object.values(ledger);
  }
  async readSave(id,file,readerRoot){return this.exclusiveGroup(id,'reading',async()=>{
    const s=this.server(id);await this.assertStopped(s);file=path.resolve(cleanString(file,2000));const saved=path.join(s.folder,'ShooterGame','Saved');if(!canonical(file).startsWith(canonical(saved)+path.sep)||path.extname(file).toLowerCase()!=='.ark')throw Error('Choose a .ark world inside this server’s Saved folder.');
    const real=fs.realpathSync(file);if(!canonical(real).startsWith(canonical(fs.realpathSync(saved))+path.sep))throw Error('The save resolves outside the selected server.');
    const stage=path.join(this.dir,'staging','players-'+crypto.randomUUID());await fsp.mkdir(stage,{recursive:true});
    try{const world=path.join(stage,path.basename(file));await fsp.copyFile(file,world);for(const entry of await fsp.readdir(path.dirname(file),{withFileTypes:true})){const source=path.join(path.dirname(file),entry.name);if(entry.isFile()&&/\.(arkprofile|arktribe)$/i.test(entry.name))await fsp.copyFile(source,path.join(stage,entry.name));if(entry.isDirectory()&&/^(Players|Tribes)$/i.test(entry.name)){await this.assertNoLinks(source);await fsp.cp(source,path.join(stage,entry.name),{recursive:true});}}
      const output=path.join(stage,'players.json');const python=path.join(readerRoot,'python','python.exe');await run(python,['-B',path.join(readerRoot,'read_players.py'),world,output],{windowsHide:true,timeout:180000,maxBuffer:1024*1024});
      const result=JSON.parse(await fsp.readFile(output,'utf8'));const ledger=structuredClone(this.state.players[id]||{});const metadataAt=new Date((await fsp.stat(file)).mtime).toISOString();
      for(const p of result.players){if(!/^[a-zA-Z0-9]{32}$/.test(p.accountId))continue;ledger[p.accountId]={...(ledger[p.accountId]||{}),accountId:p.accountId,name:cleanString(p.name||'',120),characterName:cleanString(p.characterName||'',120),playerId:/^\d+$/.test(p.playerId)?p.playerId:'',tribeName:cleanString(p.tribeName||'',120),tribeId:/^\d+$/.test(p.tribeId)?p.tribeId:'',online:false,metadataAt,metadataSource:'savegame'};}
      this.state.players[id]=ledger;s.saveReadReport={at:new Date().toISOString(),players:result.players.length,warnings:result.warnings||[],unresolved:result.unresolved||[]};this.event(s,'save-read',`Read ${result.players.length} player records from a save snapshot. ${result.warnings.length} warnings; ${result.unresolved.length} identities without EOS.`);return s.saveReadReport;
    }finally{await fsp.rm(stage,{recursive:true,force:true});}
  });}
  async playerMetadata(id,data){const ledger=this.state.players[id]||{},original=ledger[data.accountId];if(!original)throw Error('Player not found.');const p={...original};for(const key of ['characterName','tribeName'])p[key]=cleanString(data[key]||'',120);for(const key of ['playerId','tribeId']){if(data[key]&&!/^\d+$/.test(data[key]))throw Error('Game and tribe IDs must be numeric.');p[key]=data[key]||'';}p.metadataSource='manual';p.metadataAt=new Date().toISOString();ledger[data.accountId]=p;this.save();return p;}
  async admin(id,{accountId,enabled}){return this.exclusive(id,'admin',async()=>{const s=this.server(id);await this.assertStopped(s);if(!/^[a-zA-Z0-9]{32}$/.test(accountId))throw Error('ASA admin whitelist requires the 32-character EOS account ID.');const file=path.join(s.folder,'ShooterGame','Saved','AllowedCheaterSteamIDs.txt');let ids=ini.read(file).text.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);ids=ids.filter(x=>x!==accountId);if(enabled)ids.push(accountId);ini.write(file,ids.join('\r\n')+'\r\n');this.event(s,'admin','Admin whitelist updated for the selected account. Restart required.');});}
  async playerAction(id,{action,accountId}){const p=this.state.players[id]?.[accountId];if(!p)throw Error('Player not found.');if(!/^[a-zA-Z0-9_-]+$/.test(accountId))throw Error('Invalid account ID.');const commands={kick:'KickPlayer',ban:'BanPlayer',unban:'UnBanPlayer'};if(!commands[action])throw Error('Unsupported player action.');const response=await this.command(id,commands[action]+' '+accountId);this.event(this.server(id),'player-action',action+' requested.');return response;}
  async saveDiscord(id,data){const s=this.server(id);if(data.webhook&&!/^https:\/\/(?:canary\.|ptb\.)?discord(?:app)?\.com\/api(?:\/v\d+)?\/webhooks\/\d+\/[A-Za-z0-9._-]+$/.test(data.webhook))throw Error('Invalid Discord webhook URL.');const messages={};for(const type of ['starting','ready','stopping','restarting','exited','updating','backup'])messages[type]=cleanString(data.messages?.[type]||'',1800);s.discord={webhook:data.webhook||'',chat:!!data.chat,messages};this.save();}
  async saveSettings(data){
    const previous=this.state.settings,p={...previous};
    for(const key of ['language','theme','steamcmd','botToken','channelId','discordGuildId','discordInbound','discordPanelChannelId','discordPanelAddress','discordPanelAutoIp']){
      if(key in data)p[key]=data[key];
    }
    if(!['en','es','pt','ru','zh','ja'].includes(p.language)||!['dark','light'].includes(p.theme))throw Error('Invalid language or theme.');
    for(const key of ['channelId','discordGuildId','discordPanelChannelId']){
      if(p[key]&&!/^\d{15,25}$/.test(p[key]))throw Error('Invalid Discord channel or server ID.');
    }
    if('discordPanelAddress' in data){
      p.discordPanelAddress=cleanString(p.discordPanelAddress,253).trim();
      if(p.discordPanelAddress&&!validPanelHost(p.discordPanelAddress))throw Error('Enter an IP address or domain without a port or URL.');
    }
    p.discordPanelAutoIp=!!p.discordPanelAutoIp;
    cleanString(p.botToken,300);cleanString(p.steamcmd,1500);
    this.state.settings=p;
    if(['channelId','botToken','discordInbound','discordGuildId'].some(key=>p[key]!==previous[key])){
      this.discordCursor=discordCursorNow();this.verifiedDiscord=null;this.discordError='';
    }
    if(['discordPanelChannelId','discordPanelAddress','discordPanelAutoIp','botToken','discordGuildId'].some(key=>p[key]!==previous[key])){
      this.discordPanel.last=null;this.discordPanel.retry=null;this.discordPanel.status={};
    }
    this.save();
    return true;
  }
  async downloadSteam(){
    if(this.updateBusy)throw Error('SteamCMD is busy.');this.updateBusy=true;
    try{return await this.downloadSteamFiles();}finally{this.updateBusy=false;}
  }
  async downloadSteamFiles(){
    const folder=path.join(this.dir,'tools','steamcmd-'+Date.now()),zip=path.join(this.dir,'tools','steamcmd-'+crypto.randomUUID()+'.zip');
    try{await fsp.mkdir(folder,{recursive:true});const response=await fetch('https://steamcdn-a.akamaihd.net/client/installer/steamcmd.zip',{signal:AbortSignal.timeout(120000)});if(!response.ok)throw Error('SteamCMD download HTTP '+response.status);const data=Buffer.from(await response.arrayBuffer());if(data.length>32*1024*1024)throw Error('Unexpected SteamCMD download size.');await fsp.writeFile(zip,data);
      const {stdout}=await run('tar.exe',['-tf',zip],{windowsHide:true,maxBuffer:1024*1024});for(const name of stdout.split(/\r?\n/).filter(Boolean)){if(name.split(/[\\/]/).includes('..')||/^[\\/]|^[a-z]:/i.test(name))throw Error('Invalid SteamCMD archive.');}
      await run('tar.exe',['-xf',zip,'-C',folder],{windowsHide:true});const exe=path.join(folder,'steamcmd.exe');if(!exists(exe))throw Error('SteamCMD executable missing.');this.state.settings.steamcmd=exe;this.save();return exe;
    }finally{if(exists(zip))await fsp.unlink(zip);}
  }
  async saveSchedule(data){this.server(data.serverId);const s=schedules.validate({...data,id:data.id||crypto.randomUUID(),enabled:data.enabled!==false});const i=this.state.schedules.findIndex(x=>x.id===s.id);if(i>=0){for(const key of ['lastRun','lastQueued','pendingRuns','lastError'])s[key]=this.state.schedules[i][key];this.state.schedules[i]=s;}else this.state.schedules.push(s);this.save();return s;}
  removeSchedule(id){this.state.schedules=this.state.schedules.filter(s=>s.id!==id);this.save();}
  async pollChat(s){const output=await this.command(s.id,'GetChat');if(!output.trim()||/^(?:Server received, But no response!!|No (?:chat|messages))/i.test(output.trim()))return;
    for(const raw of output.split(/\r?\n/).filter(Boolean)){
      // ASA's RCON format may vary. Preserve the reported name instead of inventing character metadata.
      const m=raw.match(/^(?:\[[^\]]+\]\s*)?(.+?):\s*(.+)$/);if(!m)continue;
      const reportedName=m[1].trim(),message=m[2].trim();if(/\[ASA-Bridge\]/.test(raw))continue;const known=Object.values(this.state.players[s.id]||{}).find(p=>p.name===reportedName);const name=known?.characterName||reportedName.match(/\(([^()]+)\)\s*$/)?.[1]||reportedName;
      const formatted=`${name} (${s.map}): ${message}`;this.chat.push({at:new Date().toISOString(),serverId:s.id,name,map:s.map,message});this.chat=this.chat.slice(-300);
      if(s.discord?.chat){if(s.discord.webhook)await this.postWebhook(s.discord.webhook,formatted,s.name);else if(this.state.settings.botToken&&this.state.settings.channelId)await this.postBotChat(formatted);}
      if(s.bridgeGroup){for(const other of this.state.servers.filter(x=>x.id!==s.id&&x.pid&&!this.jobs.has(x.id)&&x.bridgeGroup===s.bridgeGroup)){await this.command(other.id,'ServerChat [ASA-Bridge] '+formatted.slice(0,800)).catch(e=>this.log(other.id,e.message));}}
    }
  }
  async pollDiscord(){
    const d=this.state.settings;if(!d.discordInbound||!d.botToken||!d.channelId)return;
    const status=this.verifiedDiscord?.channelId===d.channelId&&Date.now()-this.verifiedDiscord.at<(this.verifiedDiscord.messageContent?300000:15000)
      ?this.verifiedDiscord:await this.discordStatus();
    if(this.state.settings!==d)return;
    if(!status.messageContent){this.discordError='messageContentMissing';return;}
    const messages=await this.discordRequest(`/channels/${d.channelId}/messages?limit=100&after=${this.discordCursor}`);
    if(this.state.settings!==d)return;
    if(!Array.isArray(messages))throw Error('Invalid Discord response.');
    this.discordError='';
    messages.sort((a,b)=>BigInt(a.id)<BigInt(b.id)?-1:1);
    for(const msg of messages){
      if(this.state.settings!==d)return;
      if(BigInt(msg.id)<=BigInt(this.discordCursor))continue;
      this.discordCursor=msg.id;
      if(!msg.author||msg.author.bot||msg.webhook_id||!msg.content?.trim())continue;
      const name=String(msg.author.global_name||msg.author.username||'Discord').replace(/[\r\n\0]/g,' ').slice(0,100);
      const content=msg.content.replace(/[\r\n\0]/g,' ').slice(0,700);
      for(const s of this.state.servers.filter(s=>s.pid&&!this.jobs.has(s.id)&&s.discord?.chat)){
        try{
          const response=await this.command(s.id,`ServerChat [ASA-Bridge] ${name} (Discord): ${content}`);
          if(/unknown command|unrecognized command|command not found/i.test(response))throw Error('ARK rejected ServerChat.');
          this.chat.push({at:new Date().toISOString(),serverId:s.id,name,map:'Discord',message:content});
          this.chat=this.chat.slice(-200);
        }catch(e){this.discordError=e.message;this.log(s.id,'Discord: '+e.message);}
      }
    }
  }
  scheduleTick(now=new Date()){
    for(const s of this.state.schedules){
      if(s.enabled===false)continue;const key=schedules.due(s,now);s.pendingRuns||=[];
      if(key&&s.lastQueued!==key){s.pendingRuns.push(key);s.lastQueued=key;this.save();}
      if(!s.pendingRuns.length||this.fleetBusy)continue;const selected=this.state.servers.find(x=>x.id===s.serverId);if(!selected)continue;
      const members=selected.clusterId?this.state.servers.filter(x=>x.clusterId===selected.clusterId):[selected];if(members.some(x=>this.jobs.has(x.id)))continue;
      s.lastRun=s.pendingRuns.shift();s.lastError='';this.save();this.backup(s.serverId,'scheduled').catch(e=>{s.lastError=e.message;const server=this.state.servers.find(x=>x.id===s.serverId);this.event(server,'backup-error',e.message);});
    }
  }
  async tick(now=new Date()){
    if(this.ticking)return;this.ticking=true;
    try{this.scheduleTick(now);await this.refreshProcesses();
      const servers=this.state.servers.filter(s=>s.pid&&!this.jobs.has(s.id));
      await Promise.all(servers.map(async s=>{
        try{await this.refreshPlayers(s.id);}
        catch(e){this.online.delete(s.id);this.log(s.id,e.message);}
      }));
      void this.discordPanel.update();
      for(const s of servers.filter(s=>this.online.has(s.id)&&!this.jobs.has(s.id))){
        try{
          if(!s.readyNotified){s.readyNotified=true;this.event(s,'ready','RCON is responding.');await this.webhook(s,'ready');}
          if(s.bridgeGroup||s.discord?.chat)await this.pollChat(s);
        }catch(e){this.log(s.id,e.message);}
      }
      await this.pollDiscord().catch(e=>{this.discordError=e.message;});
    }catch(e){this.log('manager',e.message);}finally{this.ticking=false;}
  }
  async snapshot(){
    for(const s of this.state.servers){const output=[path.join(this.dir,'logs',s.id+'.log'),path.join(s.folder,'ShooterGame','Saved','Logs','ShooterGame.log')].filter(exists);if(output.length){const file=output.at(-1),fd=fs.openSync(file,'r');try{const size=fs.fstatSync(fd).size,buffer=Buffer.alloc(Math.min(size,64000));fs.readSync(fd,buffer,0,buffer.length,Math.max(0,size-buffer.length));this.logs.set(s.id,[buffer.toString('utf8'),...(this.logs.get(s.id)||[]).filter(x=>x.startsWith('RCON:')||x.startsWith('Discord:')).slice(-20)]);}finally{fs.closeSync(fd);}}}
    return {...this.state,players:Object.fromEntries(Object.entries(this.state.players).map(([id,ps])=>[id,Object.values(ps).map(p=>({...p,online:!!p.online&&this.online.has(id)}))])),servers:this.state.servers.map(s=>({...s,status:this.jobs.get(s.id)||(s.pid?(this.online.has(s.id)?'running':'starting'):'stopped'),version:this.version(s),playerCount:this.online.has(s.id)?Object.values(this.state.players[s.id]||{}).filter(p=>p.online).length:null})),catalog,maps,flags,logs:Object.fromEntries(this.logs),chat:this.chat,discordError:this.discordError,discordPanelStatus:this.discordPanel.status,dataDir:this.dir,timezone:Intl.DateTimeFormat().resolvedOptions().timeZone};
  }
}
for(const name of ['create','importServer','cluster','detachCluster']){const original=Manager.prototype[name];Manager.prototype[name]=async function(...args){if(this.fleetBusy||this.jobs.size)throw Error('Wait for the current operation before changing the server list or cluster.');this.fleetBusy=true;try{return await original.apply(this,args);}finally{this.fleetBusy=false;}};}
function removeKey(text,section,key){let current='';return text.split(/\r?\n/).filter(line=>{const s=line.match(/^\s*\[([^\]]+)\]/);if(s)current=s[1];const p=line.indexOf('=');return !(current.toLowerCase()===section.toLowerCase()&&p>=0&&line.slice(0,p).trim().toLowerCase()===key.toLowerCase());}).join(text.includes('\r\n')?'\r\n':'\n');}
module.exports={Manager,argsFor,validateMods,validateArgs,overlaps,removeKey,EXE,CONFIG};
