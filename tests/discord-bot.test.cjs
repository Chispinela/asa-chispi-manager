const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs'),os=require('node:os'),path=require('node:path');const {Manager}=require('../src/core/manager.cjs');
function fixture(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'asa-bot-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const m=new Manager(path.join(root,'manager'));m.state.settings={...m.state.settings,botToken:'TEST-TOKEN',channelId:'1000000000000000011',discordGuildId:'1000000000000000022'};return m;}
test('game chat can use the bot without a webhook, with character/map and no mentions',async t=>{const m=fixture(t),original=global.fetch;t.after(()=>global.fetch=original);const posted=[];global.fetch=async(url,options)=>{if(url.endsWith('/users/@me'))return {ok:true,json:async()=>({id:'123',username:'Test bot',bot:true})};if(url.endsWith('/channels/1000000000000000011'))return {ok:true,json:async()=>({id:'1000000000000000011',guild_id:'1000000000000000022',name:'asa-bot'})};if(options.method==='POST'){posted.push(JSON.parse(options.body));return {ok:true,json:async()=>({id:'456'})};}return {ok:true,json:async()=>[]};};m.command=async()=>'Platform (Survivor): Hello @everyone';await m.pollChat({id:'server',name:'Island',map:'TheIsland_WP',discord:{chat:true,webhook:''}});assert.equal(posted.length,1);assert.equal(posted[0].content,'Survivor (TheIsland_WP): Hello @everyone');assert.deepEqual(posted[0].allowed_mentions,{parse:[]});});
test('bot verifies the requested Discord server before sending a test message',async t=>{const m=fixture(t),original=global.fetch;t.after(()=>global.fetch=original);let sent=false;global.fetch=async(url,options)=>{if(options.method==='POST')sent=true;return {ok:true,json:async()=>url.endsWith('/users/@me')?{bot:true,id:'bot',username:'test'}:{id:'1000000000000000011',guild_id:'999999999999999999'}};};await assert.rejects(m.postBotChat('test'),/different Discord server/);assert.equal(sent,false);});

const panelPayload=body=>JSON.parse(body instanceof FormData?body.get('payload_json'):body);
const fieldValue=(embed,name)=>embed.fields.find(field=>field.name===name)?.value;

test('live panel resumes its message and refreshes the game endpoint and player list',async t=>{
  const m=fixture(t),channel='1000000000000000033';
  await m.saveSettings({discordPanelChannelId:channel,discordPanelAutoIp:true});
  m.state.servers=[{id:'island',name:'Island',map:'TheIsland_WP',port:7777,pid:123,maxPlayers:10}];
  m.state.players.island={secretAccount:{online:true,name:'Player One',characterName:'Survivor @everyone'}};
  m.online.add('island');m.save();
  m.version=()=>({gameVersion:'96.9'});
  const api=async(endpoint,options)=>{
    if(!options){assert.equal(endpoint,'/channels/'+channel);return {guild_id:m.state.settings.discordGuildId,type:0};}
    const payload=panelPayload(options.body);
    updates.push({endpoint,method:options.method,...payload,multipart:options.body instanceof FormData});
    return {id:'1000000000000000044',embeds:[{
      thumbnail:{url:'https://cdn.discordapp.com/attachments/100/300/icon-256.png?ex=1'},
      image:{url:'https://cdn.discordapp.com/attachments/100/301/discord-banner.png?ex=1'}
    }],attachments:[]};
  };
  const updates=[];
  m.discordRequest=api;m.discordPanel.publicHost=async()=> '198.51.100.1';
  await m.discordPanel.update();await m.discordPanel.update();
  assert.equal(updates.length,1);
  assert.equal(updates[0].method,'POST');
  const first=updates[0].embeds[0];
  assert.equal(first.color,0x2dc98a);
  assert.equal(first.image.url,'attachment://discord-banner.png');
  assert.equal(first.thumbnail.url,'attachment://icon-256.png');
  assert.equal(fieldValue(first,'Dirección de conexión'),'`198.51.100.1:7777`');
  assert.equal(fieldValue(first,'Jugadores'),'`1/10`');
  assert.equal(fieldValue(first,'Jugadores conectados'),'Survivor @everyone');
  assert.doesNotMatch(JSON.stringify(first),/secretAccount|Player One/);
  assert.deepEqual(updates[0].allowed_mentions,{parse:[]});
  const next=new Manager(m.dir);
  next.version=m.version;next.discordRequest=api;
  next.discordPanel.publicHost=async()=> '198.51.100.2';
  next.online.add('island');next.state.players.island.secretAccount.online=false;
  await next.discordPanel.update();
  assert.equal(updates[1].method,'PATCH');
  assert.equal(updates[1].endpoint,`/channels/${channel}/messages/1000000000000000044`);
  assert.equal(fieldValue(updates[1].embeds[0],'Dirección de conexión'),'`198.51.100.2:7777`');
  assert.equal(fieldValue(updates[1].embeds[0],'Jugadores'),'`0/10`');
  assert.doesNotMatch(JSON.stringify(updates[1].embeds[0]),/Survivor/);
  next.online.clear();
  await next.discordPanel.update();
  assert.equal(updates[2].multipart,false);
  assert.equal(updates[2].embeds[0].image.url,'https://cdn.discordapp.com/attachments/100/301/discord-banner.png');
  assert.equal(updates[2].embeds[0].color,0xe5a53e);
  assert.equal(fieldValue(updates[2].embeds[0],'Jugadores'),'`—/10`');
});

test('live panel paginates long rosters, replaces a deleted page and retires surplus pages',async t=>{
  const m=fixture(t),channel='1000000000000000033';
  await m.saveSettings({discordPanelChannelId:channel,discordPanelAddress:'ark.example.com'});
  m.state.servers=[{id:'island',name:'Island',map:'TheIsland_WP',port:7777,pid:123,maxPlayers:100}];
  m.state.players.island=Object.fromEntries(Array.from({length:100},(_,i)=>[i,{online:true,name:'Survivor '+i+' '+('長'.repeat(70))}]));
  m.online.add('island');m.version=()=>({});
  const messages=new Map();
  let id=0;
  m.discordRequest=async(endpoint,options)=>{
    if(!options)return {guild_id:m.state.settings.discordGuildId,type:0};
    const target=endpoint.split('/').at(-1);
    if(options.method==='DELETE'){messages.delete(target);return null;}
    const {embeds:[embed],attachments}=panelPayload(options.body);
    assert.ok(embed.fields.every(field=>field.value.length<=1024));
    assert.ok(embed.title.length+embed.description.length+embed.footer.text.length+embed.fields.reduce((n,field)=>n+field.name.length+field.value.length,0)<=6000);
    const result=messageId=>({id:messageId,attachments});
    if(options.method==='POST'){const idValue=String(++id);messages.set(idValue,embed);return result(idValue);}
    if(!messages.has(target))throw Object.assign(Error('Unknown Message'),{discordCode:10008});
    messages.set(target,embed);
    return result(target);
  };
  await m.discordPanel.update();
  assert.ok(messages.size>1);
  assert.match(JSON.stringify([...messages.values()].at(-1)),/Survivor 99/);
  messages.delete('1');
  m.state.players.island={};
  await m.discordPanel.update();
  assert.equal(messages.size,1);
  assert.doesNotMatch(JSON.stringify([...messages.values()][0]),/Survivor/);
});
