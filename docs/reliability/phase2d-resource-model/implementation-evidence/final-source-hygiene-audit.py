import concurrent.futures, datetime, hashlib, json, math, os, pathlib, re, subprocess

ROOT=pathlib.Path('/private/tmp/bagger-phase2d-staging-admission')
BASE='7cec5128409286f5b4a5f3524d4c5488124a7be7'
OUT=pathlib.Path('/private/tmp/r2-final-source-hygiene-audit.json')
def git(*args,check=True):
 return subprocess.run(['git',*args],cwd=ROOT,capture_output=True,check=check)
def paths(*args):
 return [s.decode() for s in git(*args).stdout.split(b'\0') if s]
def sha(b): return hashlib.sha256(b).hexdigest()
def scoped():
 return sorted(set(paths('diff','--name-only','-z','HEAD')+paths('ls-files','--others','--exclude-standard','-z')))
files=scoped();started=datetime.datetime.now(datetime.timezone.utc).isoformat()
hashes={};text_files={};binary_files=[];missing=[];symlinks=[];mode_flags=[]
for name in files:
 p=ROOT/name
 if not p.exists(): missing.append(name);continue
 if p.is_symlink():symlinks.append(name);continue
 if not p.is_file():mode_flags.append(name);continue
 value=p.read_bytes();hashes[name]=sha(value)
 if b'\0' in value:binary_files.append(name);continue
 try:text_files[name]=value.decode('utf-8')
 except UnicodeDecodeError:binary_files.append(name)

patterns={
 'private_key_pem':r'-----BEGIN (?:RSA |EC |OPENSSH |DSA |ENCRYPTED )?PRIVATE KEY-----',
 'aws_access_key':r'\b(?:AKIA|ASIA)[A-Z0-9]{16}\b',
 'supabase_secret_format':r'\bsb_secret_[A-Za-z0-9_-]{16,}\b',
 'github_token':r'\b(?:gh[pousr]_[A-Za-z0-9]{30,255}|github_pat_[A-Za-z0-9_]{40,255})\b',
 'google_oauth_token':r'\bya29\.[A-Za-z0-9_-]{20,}\b',
 'google_api_key':r'\bAIza[A-Za-z0-9_-]{35}\b',
 'slack_token':r'\bxox[baprs]-[A-Za-z0-9-]{20,}\b',
 'stripe_live_secret':r'\b(?:sk_live_|rk_live_)[A-Za-z0-9]{16,}\b',
 'jwt_shape':r'\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{16,}\b',
 'postgres_password_url':r'\bpostgres(?:ql)?://[^\s/:]+:([^\s@]+)@[^\s\'\"<>]+',
}
hits=[]
for name,value in text_files.items():
 for rule,pattern in patterns.items():
  for match in re.finditer(pattern,value):
   token=match.group(0);line=value.count('\n',0,match.start())+1
   classification='REVIEW_REQUIRED';reason='Pattern matched; values are intentionally omitted.'
   if rule=='postgres_password_url' and re.search(r'(?:example|invalid|placeholder|password|redacted|dummy|test|localhost|127\.0\.0\.1|\$\{|\[)',token,re.I):
    classification='SYNTHETIC_OR_DOCUMENTATION';reason='Connection example contains an explicit local/example/placeholder marker.'
   elif rule!='private_key_pem' and re.search(r'(?:synthetic|placeholder|example|fixture|fake|dummy|redacted)',token,re.I):
    classification='SYNTHETIC_OR_DOCUMENTATION';reason='Matched value contains an explicit synthetic marker.'
   hits.append({'path':name,'line':line,'pattern':rule,'matchedValueSha256':sha(token.encode()),'classification':classification,'reason':reason})

# Supplemental assignment heuristic. Store only candidate metadata/hash, never
# the matched value or surrounding source line.
assignment=re.compile(r'''(?i)\b(api[_-]?key|service[_-]?role[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|password|secret)\b["']?\s*[:=]\s*["']([^\s"']{20,})["']''')
assignment_hits=[]
for name,value in text_files.items():
 for match in assignment.finditer(value):
  token=match.group(2)
  entropy=-sum((token.count(c)/len(token))*math.log2(token.count(c)/len(token)) for c in set(token))
  if entropy<3.6:continue
  synthetic=bool(re.search(r'(?:synthetic|placeholder|example|fixture|fake|dummy|redacted|process\.env|\$\{|\.invalid|\[)',token,re.I))
  assignment_hits.append({'path':name,'line':value.count('\n',0,match.start())+1,'pattern':'high_entropy_credential_assignment','matchedValueSha256':sha(token.encode()),'classification':'SYNTHETIC_OR_DOCUMENTATION' if synthetic else 'REVIEW_REQUIRED','reason':'Explicit synthetic marker' if synthetic else 'Heuristic credential assignment; values omitted'})

native_re=re.compile(r'(^|/)(?:ios|android|native)(?:/|$)|\.(?:swift|kt|kts|java|m|mm|pbxproj|xcworkspace|xcodeproj|keystore|jks|mobileprovision)$',re.I)
artifact_re=re.compile(r'(^|/)(?:\.env(?:\..*)?|id_rsa|id_ed25519|PG_VERSION|postmaster\.pid)$|\.(?:db|sqlite|sqlite3|dump|pgdump|key|pem|p12|pfx|keystore|jks)$',re.I)
native=[name for name in files if native_re.search(name)]
sensitive_artifacts=[name for name in files if artifact_re.search(name)]
local_env_names=[]
for directory,dirs,names in os.walk(ROOT):
 dirs[:]=[d for d in dirs if d not in ['.git','node_modules','.next','.vercel','.cache','.turbo']]
 for name in names:
  if name=='.env' or name.startswith('.env.'):
   local_env_names.append(str((pathlib.Path(directory)/name).relative_to(ROOT)))

tracked_check=git('diff','--check',check=False)
def check_untracked(name):
 p=ROOT/name
 if name not in text_files:return []
 result=git('diff','--no-index','--check','/dev/null',str(p),check=False)
 diagnostics=[]
 for line in result.stdout.decode(errors='replace').splitlines():
  m=re.match(r'^(.+):(\d+): (trailing whitespace|space before tab in indent|new blank line at EOF)\.?$',line)
  if m:diagnostics.append({'line':int(m.group(2)),'issue':m.group(3)})
 return diagnostics
untracked=paths('ls-files','--others','--exclude-standard','-z')
whitespace={}
with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
 for name,issues in zip(untracked,pool.map(check_untracked,untracked)):
  if issues:whitespace[name]=issues
raw_logs={name:issues for name,issues in whitespace.items() if pathlib.Path(name).suffix.lower() in ['.log','.tap']}
content_whitespace={name:issues for name,issues in whitespace.items() if name not in raw_logs}

historical=[]
for name in git('ls-tree','-r','--name-only',BASE,'--','supabase/production_migrations').stdout.decode().splitlines():
 base=pathlib.Path(name).name
 if not re.match(r'^\d{12}_',base) or int(base[8:12])>130:continue
 original=git('show',BASE+':'+name).stdout;present=(ROOT/name).read_bytes()
 historical.append({'path':name,'ordinal':int(base[8:12]),'baseSha256':sha(original),'currentSha256':sha(present),'unchanged':original==present})
changed_historical=[row for row in historical if not row['unchanged']]
branch=git('branch','--show-current').stdout.decode().strip()
vercel=json.loads((ROOT/'vercel.json').read_text())
package_changes=[name for name in files if pathlib.Path(name).name in ['package.json','package-lock.json','pnpm-lock.yaml','yarn.lock','bun.lock','bun.lockb']]
index_changes=[name for name in files if re.fullmatch(r'index\.[^/]+',pathlib.Path(name).name)]
staged=paths('diff','--cached','--name-only','-z')
after_files=scoped();drift=[]
for name,before in hashes.items():
 p=ROOT/name
 if not p.exists() or sha(p.read_bytes())!=before:drift.append(name)
prior_path=ROOT/'docs/reliability/phase2d-resource-model/implementation-evidence/source-safety-audit-before-069-final.json'
prior=json.loads(prior_path.read_text()) if prior_path.exists() else {}
env_templates=[];private_env_names=[]
for name in sorted(local_env_names):
 if pathlib.Path(name).name in ['.env.example','.env.sample','.env.template']:
  previous=git('show',BASE+':'+name,check=False)
  env_templates.append({'path':name,'classification':'DOCUMENTED_ENVIRONMENT_TEMPLATE','unchangedFromBase':previous.returncode==0 and previous.stdout==(ROOT/name).read_bytes()})
 else:private_env_names.append(name)
report={
 'contract':'phase2d-final-source-hygiene-audit-v1','startedAt':started,'finishedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),
 'status':'SCOPED_READ_ONLY_AUDIT_COMPLETE','proofLayer':'SOURCE','baseSha':BASE,'branch':branch,
 'networkUsed':False,'postgresqlStarted':False,'repositoryWritten':False,'secretValuesPrinted':False,
 'scope':'All git-changed and untracked nonignored files, including docs and generated installer; local env filenames only in repository walk excluding dependency/build/git directories.',
 'scopedFiles':len(files),'textFilesScanned':len(text_files),'binaryFiles':binary_files,'missingFiles':missing,'symlinks':symlinks,'nonRegularFiles':mode_flags,
 'sourceHashes':hashes,'filesAddedDuringScan':sorted(set(after_files)-set(files)),'filesChangedDuringScan':drift,
 'secretScan':{'patterns':list(patterns),'matchesWithoutValues':hits,'assignmentHeuristicMatchesWithoutValues':assignment_hits,'unreviewedCount':sum(h['classification']=='REVIEW_REQUIRED' for h in hits+assignment_hits),'limitation':'Pattern and assignment-heuristic scan only; not a proof that all conceivable secret formats are absent. Values and source snippets are never emitted.'},
 'previousAuditComparison':{'path':str(prior_path.relative_to(ROOT)),'previousRecordedAt':prior.get('recordedAt'),'previousMatchedCount':len(prior.get('secretScan',{}).get('matchesWithoutValues',[])),'previousRecordedTextFiles':prior.get('secretScan',{}).get('textFilesScanned')},
 'nativeFilesChanged':native,'packageManifestOrLockChanges':package_changes,'indexEntrypointChanges':index_changes,'stagedIndexChanges':staged,
 'repositoryDatabaseEnvOrKeyFilesInScope':sensitive_artifacts,'repositoryLocalEnvFileNamesOnly':sorted(local_env_names),
 'repositoryPrivateEnvironmentFilesNamesOnly':private_env_names,'repositoryEnvironmentTemplates':env_templates,
 'whitespace':{'trackedGitDiffCheckExitCode':tracked_check.returncode,'trackedGitDiffCheckOutputSha256':sha(tracked_check.stdout+tracked_check.stderr),'trackedGitDiffCheckClean':tracked_check.returncode==0,'untrackedContentIssues':content_whitespace,'untrackedRawLogIssues':raw_logs,'rawLogPolicy':'Reported separately; evidence logs were not altered to remove preserved command output.'},
 'historicalMigrations':{'comparedCount':len(historical),'changed':changed_historical,'approvedChangedOrdinalsOnly':[row['ordinal'] for row in changed_historical]==[69],'048':next(row for row in historical if row['ordinal']==48),'057':next(row for row in historical if row['ordinal']==57),'classification048057':'UNCHANGED; prior irreproducible proof classification retained, no new execution or investigation.'},
 'branchDeployment':{'configurationFile':'vercel.json','exactBranchDisabled':vercel.get('git',{}).get('deploymentEnabled',{}).get(branch) is False,'hostedConfigurationAccessed':False},
 'limitations':['Read-only source audit; no runtime, database, hosted, provider or capacity certification.','Concurrent parent documentation/evidence writes, if any, are enumerated explicitly by source drift fields.']
}
OUT.write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({'report':str(OUT),'sha256':sha(OUT.read_bytes()),'scopedFiles':len(files),'textFilesScanned':len(text_files),'patternMatches':len(hits),'assignmentMatches':len(assignment_hits),'unreviewed':report['secretScan']['unreviewedCount'],'nativeChanges':len(native),'sensitiveArtifactFiles':len(sensitive_artifacts),'localEnvFiles':len(local_env_names),'contentWhitespaceFiles':len(content_whitespace),'rawLogWhitespaceFiles':len(raw_logs),'changedHistoricalOrdinals':[row['ordinal'] for row in changed_historical],'branchDeploymentDisabled':report['branchDeployment']['exactBranchDisabled'],'concurrentChangedFiles':len(drift),'concurrentAddedFiles':len(report['filesAddedDuringScan'])}))
