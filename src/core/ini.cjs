const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
function decode(buffer) {
  if(buffer[0] === 255 && buffer[1] === 254) return {text:buffer.subarray(2).toString('utf16le'),encoding:'utf16le',bom:true};
  return {text:buffer.toString('utf8').replace(/^\uFEFF/,''),encoding:'utf8',bom:buffer[0]===239&&buffer[1]===187&&buffer[2]===191};
}
function read(file) { try {return decode(fs.readFileSync(file));} catch(e) {if(e.code==='ENOENT') return {text:'',encoding:'utf8',bom:false}; throw e;} }
function hash(text) {return crypto.createHash('sha256').update(text).digest('hex');}
function get(text, section, key) {
  let current='', result;
  for(const line of text.split(/\r?\n/)) {
    const s=line.match(/^\s*\[([^\]]+)\]/); if(s) {current=s[1];continue;}
    const p=line.indexOf('='); if(p<0 || /^[;#]/.test(line.trim())) continue;
    if(current.toLowerCase()===section.toLowerCase() && line.slice(0,p).trim().toLowerCase()===key.toLowerCase()) result=line.slice(p+1).trim();
  }
  return result;
}
// Preserve comments, repeated values, unknown mod sections and original line endings.
function set(text, section, key, value) {
  if(/[\r\n\]\[]/.test(section) || /[\r\n=]/.test(key) || /[\r\n]/.test(String(value))) throw Error('INI values must be a single line.');
  const nl=text.includes('\r\n')?'\r\n':'\n'; const lines=text.split(/\r?\n/); let current='', lastSection=-1, end=lines.length, found=false;
  for(let i=0;i<lines.length;i++) {
    const s=lines[i].match(/^\s*\[([^\]]+)\]/);
    if(s) {if(current.toLowerCase()===section.toLowerCase()) end=i; current=s[1]; if(current.toLowerCase()===section.toLowerCase()) {lastSection=i;end=lines.length;} continue;}
    const p=lines[i].indexOf('=');
    if(current.toLowerCase()===section.toLowerCase() && p>=0 && !/^[;#]/.test(lines[i].trim()) && lines[i].slice(0,p).trim().toLowerCase()===key.toLowerCase()) {lines[i]=`${key}=${value}`;found=true;}
  }
  if(!found) {if(lastSection<0) {if(lines.at(-1)!=='') lines.push('');lines.push(`[${section}]`,`${key}=${value}`,'');} else lines.splice(end,0,`${key}=${value}`);}
  return lines.join(nl);
}
function atomic(file, data) {
  fs.mkdirSync(path.dirname(file),{recursive:true}); const tmp=file+'.'+crypto.randomUUID()+'.tmp';
  try {fs.writeFileSync(tmp,data); fs.renameSync(tmp,file);} finally {if(fs.existsSync(tmp))fs.unlinkSync(tmp);}
}
function write(file, text, expected) {
  const original=read(file); if(expected!==undefined && hash(original.text)!==expected) throw Error('File changed on disk. Reload before saving.');
  if(fs.existsSync(file)) {const backup=file+'.chispi-'+Date.now()+'-'+crypto.randomUUID().slice(0,6)+'.bak';fs.copyFileSync(file,backup);}
  const bom=original.bom?Buffer.from(original.encoding==='utf16le'?[255,254]:[239,187,191]):Buffer.alloc(0);
  atomic(file,Buffer.concat([bom,Buffer.from(text,original.encoding)]));
}
module.exports={decode,read,get,set,hash,atomic,write};
