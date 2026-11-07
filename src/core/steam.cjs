const fs=require('node:fs');
const path=require('node:path');
const {spawn}=require('node:child_process');
const {StringDecoder}=require('node:string_decoder');
function steamScript(folder,{install=true}={}) {
  if(typeof folder!=='string'||!path.isAbsolute(folder)||/[\r\n\0"]/.test(folder))throw Error('SteamCMD requires an absolute server folder without quotes or newlines.');
  return ['@ShutdownOnFailedCommand 1','@NoPromptForPassword 1',`force_install_dir "${folder}"`,'login anonymous',...(install?['app_update 2430930 validate']:[]),'quit',''].join('\r\n');
}
function confirmed(output){return /Success!\s*App\s*['"]?2430930['"]?\s*(?:fully installed|already up to date)/i.test(output);}
function needsBootstrapRetry(output){return /Missing configuration/i.test(output)&&!confirmed(output);}
function loginReady(output){return /Waiting for user info\.\.\.OK/i.test(output)&&/Unloading Steam API\.\.\.OK/i.test(output);}
function bootstrapRestart(result){return needsBootstrapRetry(result.output)||(result.code===7&&loginReady(result.output)&&/(?:Update complete, launching|Actualizaci[oó]n completa[^\r\n]*Iniciando Steamcmd)/i.test(result.output));}
function explainFailure(output,code){
  if(/Missing configuration/i.test(output))return 'SteamCMD self-update did not finish. Repair SteamCMD and try again.';
  if(/Not enough disk space|Disk write failure|Disk full/i.test(output))return 'SteamCMD cannot write the update. Check free disk space and folder permissions.';
  if(/No subscription|Invalid platform|Access Denied|No license/i.test(output))return 'Steam rejected the download. Review the SteamCMD console for the account/platform error.';
  if(/No Connection|Failed to.*connect|Login Failure|Timeout|offline/i.test(output))return 'SteamCMD could not connect or log in to Steam. Check its console and network connection.';
  return `SteamCMD did not confirm a successful update (exit ${code??'unknown'}). The complete output is available in the SteamCMD console.`;
}
function runSteam({executable,scriptFile,cwd,logFile,onOutput=()=>{},spawnImpl=spawn}) {
  return new Promise((resolve,reject)=>{
    const decoderOut=new StringDecoder('utf8'),decoderErr=new StringDecoder('utf8');let tail='',settled=false;
    const collect=text=>{if(!text)return;tail=(tail+text).slice(-256000);try{fs.appendFileSync(logFile,text,'utf8');onOutput(text);}catch(e){finish(e);child?.kill();}};
    let child;
    function finish(error,code,signal){if(settled)return;settled=true;error?reject(error):resolve({code,signal,output:tail});}
    try{child=spawnImpl(executable,['+runscript',scriptFile],{cwd,windowsHide:true,stdio:['ignore','pipe','pipe']});}
    catch(error){finish(error);return;}
    child.stdout.on('data',data=>collect(decoderOut.write(data)));child.stderr.on('data',data=>collect(decoderErr.write(data)));
    child.once('error',error=>{collect('\nSteamCMD process error: '+error.message+'\n');finish(error);});
    child.once('close',(code,signal)=>{collect(decoderOut.end());collect(decoderErr.end());finish(null,code,signal);});
  });
}
module.exports={steamScript,confirmed,needsBootstrapRetry,loginReady,bootstrapRestart,explainFailure,runSteam};
