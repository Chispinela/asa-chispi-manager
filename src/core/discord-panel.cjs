const {isIP,isIPv4}=require('node:net');
const {createHash}=require('node:crypto');
const {readFileSync}=require('node:fs');
const path=require('node:path');

const branding=['icon-256.png','discord-banner.png'];
const attachments=branding.map((filename,id)=>({id,filename}));

const words={
  en:['Server status','Online','Offline','Starting or no response','Players','Nobody connected','Address unavailable','Version','No servers configured','Status','Active since','Connect','Connected players','Live updates'],
  es:['Estado de los servidores','En línea','Apagado','Iniciando o sin respuesta','Jugadores','Nadie conectado','Dirección no disponible','Versión','No hay servidores configurados','Estado','Activo desde','Dirección de conexión','Jugadores conectados','Actualización automática'],
  pt:['Estado dos servidores','Online','Desligado','A iniciar ou sem resposta','Jogadores','Ninguém ligado','Endereço indisponível','Versão','Nenhum servidor configurado','Estado','Ativo desde','Endereço de ligação','Jogadores ligados','Atualização automática'],
  ru:['Состояние серверов','В сети','Выключен','Запускается или не отвечает','Игроки','Никого нет в сети','Адрес недоступен','Версия','Нет настроенных серверов','Статус','Запущен с','Адрес подключения','Подключённые игроки','Автоматическое обновление'],
  zh:['服务器状态','在线','离线','启动中或无响应','玩家','无人在线','地址不可用','版本','未配置服务器','状态','启动时间','连接地址','在线玩家','自动更新'],
  ja:['サーバーの状態','オンライン','停止中','起動中または応答なし','プレイヤー','接続中のプレイヤーなし','アドレス取得不可','バージョン','サーバー未設定','状態','稼働開始','接続先','接続中のプレイヤー','自動更新']
};

function validPanelHost(value){
  return value.length<=253&&(isIP(value)||value.split('.').every(label=>/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label)));
}

function display(value,length=100){
  return String(value).replace(/[\r\n\t]/g,' ').slice(0,length).replace(/[\\`*_~|<>\[\]]/g,'\\$&');
}

function rosterFields(roster,label){
  const fields=[];
  let names='';
  for(const player of roster){
    const name=display(player.characterName||player.name||'—');
    const next=names?names+' · '+name:name;
    if(next.length>950){
      fields.push({name:label,value:names});
      names=name;
    }else names=next;
  }
  if(names)fields.push({name:label,value:names});
  return fields;
}

function renderCards(manager,host,language){
  const [title,online,offline,unavailable,players,empty,noAddress,version,noServers,status,active,connect,connected,updated]=words[language]||words.en;
  const footer={text:'ASA Chispi Manager · '+updated};
  if(!manager.state.servers.length)return [{embed:{title,description:noServers,color:0x9260df,footer},branded:true}];
  const cards=[];
  for(const server of manager.state.servers){
    const ready=server.pid&&manager.online.has(server.id)&&!manager.jobs.has(server.id);
    const roster=ready?Object.values(manager.state.players[server.id]||{}).filter(p=>p.online):[];
    const address=host?`${isIP(host)===6?'['+host+']':host}:${server.port}`:'';
    const gameVersion=manager.version(server).gameVersion;
    const started=server.pid?Date.parse(server.startedAt):NaN;
    const statusText=ready?'🟢 '+online:server.pid?'🟠 '+unavailable:'🔴 '+offline;
    const color=ready?0x2dc98a:server.pid?0xe5a53e:0xdf405a;
    const fields=[
      {name:status,value:statusText,inline:true},
      {name:players,value:`\`${server.pid&&!ready?'—':roster.length}/${server.maxPlayers}\``,inline:true},
      {name:version,value:gameVersion?`\`${gameVersion}\``:'—',inline:true},
      {name:active,value:Number.isFinite(started)?`<t:${Math.floor(started/1000)}:R>`:'—'},
      {name:connect,value:address?`\`${address}\``:noAddress}
    ];
    const names=rosterFields(roster,connected);
    if(ready&&!names.length)names.push({name:connected,value:empty});
    const base={title:display(server.name,120),description:display(server.map),color,footer};
    cards.push({embed:{...base,fields:[...fields,...names.slice(0,5)]},branded:true});
    for(let index=5;index<names.length;index+=5){
      cards.push({embed:{...base,title:base.title+' · '+(Math.floor(index/5)+1),fields:names.slice(index,index+5)},branded:false});
    }
  }
  return cards;
}

class DiscordPanel{
  constructor(manager){
    this.manager=manager;
    this.status={};
    this.media=new Map();
  }

  async publicHost(settings,now){
    if(settings.discordPanelAddress)return settings.discordPanelAddress;
    if(!settings.discordPanelAutoIp)return '';
    if(this.ip&&now<this.ip.expires)return this.ip.value;
    try{
      const response=await fetch('https://1.1.1.1/cdn-cgi/trace',{signal:AbortSignal.timeout(5000),redirect:'error'});
      const value=response.ok?(await response.text()).match(/^ip=(.+)$/m)?.[1]?.trim():'';
      if(!isIPv4(value||''))throw Error('Public IPv4 unavailable.');
      this.ip={value,expires:now+60000};
    }catch{
      this.ip={value:'',expires:now+15000};
    }
    return this.ip.value;
  }

  async writeCard(route,method,card,payload,id){
    const send=body=>this.manager.discordRequest(route,{method,body});
    if(!card.branded){
      const message=await send(JSON.stringify({...payload,attachments:[]}));
      this.media.delete(id);
      return message;
    }
    const retained=this.media.get(id);
    if(retained)return send(JSON.stringify({...payload,embeds:[{...payload.embeds[0],...retained}]}));
    const embed={...payload.embeds[0],
      thumbnail:{url:'attachment://'+branding[0]},
      image:{url:'attachment://'+branding[1]}
    };
    const form=new FormData();
    form.set('payload_json',JSON.stringify({...payload,embeds:[embed],attachments}));
    for(const [index,filename] of branding.entries()){
      const bytes=readFileSync(path.join(__dirname,'..','..','assets',filename));
      form.set(`files[${index}]`,new Blob([bytes],{type:'image/png'}),filename);
    }
    const message=await send(form);
    // Discord resolves inline attachments to CDN URLs and can omit them from the attachments array.
    const [thumbnail,image]=['thumbnail','image'].map(field=>{
      const url=message.embeds?.[0]?.[field]?.url?.split('?')[0];
      return url?.startsWith('https://cdn.discordapp.com/attachments/')?{url}:null;
    });
    if(thumbnail&&image)this.media.set(message.id,{thumbnail,image});
    return message;
  }

  async update(){
    const m=this.manager,settings=m.state.settings,channel=settings.discordPanelChannelId;
    if(!channel||this.busy)return;
    const key=JSON.stringify([channel,settings.discordGuildId,settings.botToken]);
    const now=Date.now();
    if(this.retry?.key===key&&now<this.retry.until)return;
    this.busy=true;
    const current=()=>m.state.settings.discordPanelChannelId===channel&&
      m.state.settings.discordGuildId===settings.discordGuildId&&m.state.settings.botToken===settings.botToken&&
      m.state.settings.discordPanelAddress===settings.discordPanelAddress&&
      m.state.settings.discordPanelAutoIp===settings.discordPanelAutoIp;
    try{
      if(this.channel?.key!==key||now>=this.channel.expires){
        const info=await m.discordRequest('/channels/'+channel);
        if(!info.guild_id||![0,5].includes(info.type))throw Error('Choose a Discord server text channel.');
        if(settings.discordGuildId&&info.guild_id!==settings.discordGuildId)throw Error('This channel belongs to a different Discord server.');
        this.channel={key,guildId:info.guild_id,expires:now+300000};
      }
      const host=await this.publicHost(settings,now);
      if(!current())return;
      const pages=renderCards(m,host,settings.language);
      const contentKey=JSON.stringify(pages);
      if(this.last?.key===key&&this.last.contentKey===contentKey&&now-this.last.at<60000)return;
      const ids=(m.state.discordPanelMessages??={})[channel]??=[];
      const route=`/channels/${channel}/messages`;
      for(const [index,page] of pages.entries()){
        if(!current())return;
        const payload={content:'',embeds:[{...page.embed,timestamp:new Date(now).toISOString()}],allowed_mentions:{parse:[]}};
        if(ids[index]){
          try{
            await this.writeCard(route+'/'+ids[index],'PATCH',page,payload,ids[index]);
            continue;
          }catch(error){
            if(error.discordCode!==10008)throw error;
          }
        }
        const nonce=createHash('sha256').update(`${m.dir}\n${channel}\n${index}\n${ids[index]||''}`).digest('hex').slice(0,24);
        const message=await this.writeCard(route,'POST',page,{...payload,nonce,enforce_nonce:true,flags:4096});
        ids[index]=message.id;
        m.save();
      }
      while(current()&&ids.length>pages.length){
        try{await m.discordRequest(route+'/'+ids.at(-1),{method:'DELETE'});}
        catch(error){if(error.discordCode!==10008)throw error;}
        this.media.delete(ids.pop());
        m.save();
      }
      if(!current())return;
      this.last={key,contentKey,at:now};
      this.status={channel,updatedAt:new Date(now).toISOString(),url:`https://discord.com/channels/${this.channel.guildId}/${channel}/${ids[0]}`,ipUnavailable:settings.discordPanelAutoIp&&!host};
    }catch(error){
      this.retry={key,until:now+60000};
      if(current())this.status={...this.status,channel,error:error.message};
    }finally{
      this.busy=false;
    }
  }
}

module.exports={DiscordPanel,validPanelHost};
