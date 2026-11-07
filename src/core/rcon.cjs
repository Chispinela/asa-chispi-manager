const net=require('node:net');
function packet(id,type,body) {const b=Buffer.from(body,'utf8'),p=Buffer.alloc(b.length+14);p.writeInt32LE(b.length+10,0);p.writeInt32LE(id,4);p.writeInt32LE(type,8);b.copy(p,12);return p;}
function command({host='127.0.0.1',port,password},text,{timeout=7000}={}) {
  if(!password) return Promise.reject(Error('Set ServerAdminPassword and enable RCON first.'));
  if(typeof text!=='string'||!text.trim()||/[\0\r\n]/.test(text)||Buffer.byteLength(text)>3500)return Promise.reject(Error('Invalid RCON command.'));
  return new Promise((resolve,reject)=>{
    let buffer=Buffer.alloc(0),chunks=[],authenticated=false,done=false,quiet;
    const socket=net.createConnection({host,port:Number(port)});
    const timer=setTimeout(()=>finish(Error('RCON timeout. Check the port, password and server readiness.')),timeout);
    function finish(err) {if(done)return;done=true;clearTimeout(timer);clearTimeout(quiet);socket.destroy();err?reject(err):resolve(chunks.join(''));}
    socket.on('connect',()=>socket.write(packet(10,3,password)));
    socket.on('error',e=>finish(Error(`RCON: ${e.code||e.message}`)));
    socket.on('end',()=>{if(chunks.length)finish();else finish(Error('RCON connection closed without a response.'));});
    socket.on('data',data=>{
      buffer=Buffer.concat([buffer,data]);
      while(buffer.length>=4) {
        const size=buffer.readInt32LE(0);if(size<10||size>4*1024*1024)return finish(Error('Invalid RCON packet.'));
        if(buffer.length<size+4)break;
        const id=buffer.readInt32LE(4),type=buffer.readInt32LE(8),body=buffer.subarray(12,size+2).toString('utf8'); buffer=buffer.subarray(size+4);
        if(id===-1)return finish(Error('RCON authentication failed.'));
        if(!authenticated&&id===10&&type===2) {authenticated=true;socket.write(packet(11,2,text));continue;}
        if(authenticated&&id===11&&type===0) {chunks.push(body);clearTimeout(quiet);quiet=setTimeout(()=>finish(),350);}
      }
    });
  });
}
function parsePlayers(text) {
  if(!text.trim()||/No Players Connected/i.test(text))return [];
  const players=[];
  for(const line of text.split(/\r?\n/)) {const m=line.match(/^\s*\d+\.\s+(.+),\s*([a-zA-Z0-9_-]{10,})\s*$/); if(m)players.push({name:m[1],accountId:m[2]});}
  if(!players.length)throw Error('Unrecognised ListPlayers response; existing presence was preserved.');
  return players;
}
module.exports={command,packet,parsePlayers};
