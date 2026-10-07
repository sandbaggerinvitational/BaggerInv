// Local file evidence only. Never reads provider credentials or contacts a host.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const directory='docs/reliability/phase2d-model-d/director-scoring/evidence/';
const preserved=JSON.parse(await readFile(directory+'preservation.json','utf8'));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
for(const [file,expected]of Object.entries(preserved.unchanged))assert.equal(hash(await readFile(file)),expected,file);
const files=[...new Set(['diff --name-only','ls-files --others --exclude-standard'].flatMap(command=>execFileSync('git',command.split(' '),{encoding:'utf8'}).trim().split('\n').filter(Boolean)))];
const patterns=[['credential-bearing database URL',/postgres(?:ql)?:\/\/[^\s/"']+:[^\s/@"']+@/i],['provider JWT',/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/],['management token',/sbp_[A-Za-z0-9]{20,}/],['private key block',/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/]];
const findings=[];for(const file of files){const source=await readFile(file,'utf8');for(const[name,pattern]of patterns)if(pattern.test(source))findings.push({file,classification:name});}
const evidence={leaks:findings.length,filesScanned:files.length,findings,hostedCredentialsRead:false,protectedHashesVerified:Object.keys(preserved.unchanged).length,scoringCoreSha256:'eadddb392a2087d930506b70a34aba0181e5922edf7b93a06d78f2374f076f06',patterns:patterns.map(([name])=>name),syntheticLocalFixtureKeys:'Owned test inputs only; no provider credential or raw key stored in evidence/manifest'};
await writeFile(directory+'secret-scan.json',JSON.stringify(evidence,null,2)+'\n');assert.equal(findings.length,0,'Source secret scan must pass');console.log(JSON.stringify({leaks:findings.length,filesScanned:files.length,protectedHashes:evidence.protectedHashesVerified}));
