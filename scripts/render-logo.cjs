const {app,BrowserWindow}=require('electron');
const fs=require('node:fs'),path=require('node:path');
app.whenReady().then(async()=>{
  const assets=path.resolve(__dirname,'..','assets');
  const window=new BrowserWindow({width:512,height:512,show:true,frame:false,transparent:true,backgroundColor:'#00000000',webPreferences:{sandbox:true}});
  await window.loadFile(path.join(assets,'emblem.svg'));await new Promise(resolve=>setTimeout(resolve,120));
  const capture=await window.webContents.capturePage();
  const sizes=[16,32,48,64,128,256];const images=sizes.map(size=>capture.resize({width:size,height:size,quality:'best'}).toPNG());
  fs.writeFileSync(path.join(assets,'icon.png'),capture.toPNG());
  fs.writeFileSync(path.join(assets,'logo-mark.png'),capture.toPNG());
  fs.copyFileSync(path.join(assets,'emblem.svg'),path.join(assets,'icon.svg'));
  const header=Buffer.alloc(6+16*sizes.length);header.writeUInt16LE(1,2);header.writeUInt16LE(sizes.length,4);let offset=header.length;
  sizes.forEach((size,index)=>{const image=images[index],start=6+16*index;header[start]=size===256?0:size;header[start+1]=size===256?0:size;header.writeUInt16LE(1,start+4);header.writeUInt16LE(32,start+6);header.writeUInt32LE(image.length,start+8);header.writeUInt32LE(offset,start+12);offset+=image.length;fs.writeFileSync(path.join(assets,`icon-${size}.png`),image);});
  fs.writeFileSync(path.join(assets,'icon.ico'),Buffer.concat([header,...images]));
  window.setContentSize(1100,320);await window.loadFile(path.join(assets,'logo.svg'));await new Promise(resolve=>setTimeout(resolve,120));fs.writeFileSync(path.join(assets,'logo.png'),(await window.webContents.capturePage()).toPNG());
  window.setContentSize(1100,340);await window.loadFile(path.join(assets,'discord-banner.svg'));fs.writeFileSync(path.join(assets,'discord-banner.png'),(await window.webContents.capturePage()).toPNG());
  console.log('Logo, transparent PNGs and Windows icon rendered.');app.exit(0);
}).catch(error=>{console.error(error);app.exit(1);});
