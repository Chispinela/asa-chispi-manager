const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const asar=require('@electron/asar');
const root=path.resolve(__dirname,'..'),archive=path.join(root,'release','win-unpacked','resources','app.asar');
function files(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(path.join(dir,e.name)):[path.join(dir,e.name)]);}
let count=0;
for(const folder of ['src','assets','docs'])for(const source of files(path.join(root,folder))){const relative=path.relative(root,source);assert.ok(asar.extractFile(archive,relative).equals(fs.readFileSync(source)),relative+' differs from source');count++;}
for(const relative of ['read_players.py','python/python.exe','python/python314.dll','python/arkparser/__init__.py']){const expected=path.join(root,'tools',relative),packaged=path.join(root,'release','win-unpacked','resources','reader',relative);assert.deepEqual(fs.readFileSync(packaged),fs.readFileSync(expected),relative);}
const entries=asar.listPackage(archive).map(p=>p.replaceAll('\\','/'));
assert.ok(!entries.some(p=>/^\/?(?:test-results|runtime|tests|\.npm-cache)\//.test(p)));
const installerName=`ASA-Chispi-Manager-Setup-${require('../package.json').version}.exe`;
const installer=path.join(root,'release',installerName);const digest=crypto.createHash('sha256').update(fs.readFileSync(installer)).digest('hex');
fs.writeFileSync(path.join(root,'release','SHA256SUMS.txt'),`${digest}  ${installerName}\n`);
fs.writeFileSync(path.join(root,'test-results','artifact-report.json'),JSON.stringify({at:new Date().toISOString(),matchingApplicationFiles:count,matchingReaderFiles:4,testDataExcluded:true,installerSHA256:digest,installerBytes:fs.statSync(installer).size},null,2));
console.log(`${count} packaged application files and 4 reader files match source. Installer SHA-256 recorded.`);
