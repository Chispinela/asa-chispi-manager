const {app,BrowserWindow}=require('electron');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
class StartupScreen {
  constructor({language='es',theme='dark',version}){
    this.preferences={language,theme,version};
    this.window=new BrowserWindow({width:680,height:450,frame:false,transparent:true,resizable:false,maximizable:false,fullscreenable:false,show:false,skipTaskbar:true,backgroundColor:'#00000000',title:'ASA Chispi Manager · Startup',icon:path.join(__dirname,'..','assets','icon.ico'),webPreferences:{preload:path.join(__dirname,'splash-preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
    this.window.webContents.setWindowOpenHandler(()=>({action:'deny'}));
    this.window.webContents.on('will-navigate',event=>event.preventDefault());
    this.window.on('closed',()=>{if(!this.finished)app.quit();});
  }
  async open(){const url=pathToFileURL(path.join(__dirname,'ui','splash.html'));for(const [key,value] of Object.entries(this.preferences))url.searchParams.set(key,value);await this.window.loadURL(url.href);this.window.show();this.shownAt=Date.now();}
  status(key){if(!this.window.isDestroyed())this.window.webContents.send('startup:status',key);}
  async finish(main){
    await pause(Math.max(0,1800-(Date.now()-this.shownAt)));
    this.status('startup-ready');await pause(260);
    if(this.window.isDestroyed())return;
    this.window.webContents.send('startup:finish');await pause(220);
    if(main.isDestroyed())return;main.show();main.focus();this.finished=true;this.window.destroy();
  }
  destroy(){this.finished=true;if(!this.window.isDestroyed())this.window.destroy();}
}
module.exports={StartupScreen};
