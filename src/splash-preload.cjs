const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('startup',{
  onStatus:callback=>ipcRenderer.on('startup:status',(_event,key)=>callback(key)),
  onFinish:callback=>ipcRenderer.once('startup:finish',()=>callback()),
});
