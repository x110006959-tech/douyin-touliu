import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';

// One-time local release. Application configuration stays in memory only.
const suffix = 'diagnosis-uncertainty-v23-20260906';
const apiImage = 'pxxis-api:diagnosis-uncertainty-v23-20260906';
const webImage = 'pxxis-web:diagnosis-closure-candidate-v22-20260906';
const services = [
  { name: 'pxxis-prelaunch-20260713-api-1', image: apiImage, hash: 'sha256:956a2c9fe9903df5b623e4e38d631129b5eeb8c8fe3a103f226922701efac858' },
  { name: 'pxxis-local-ai-validation-worker', image: apiImage, hash: 'sha256:956a2c9fe9903df5b623e4e38d631129b5eeb8c8fe3a103f226922701efac858' },
  { name: 'pxxis-prelaunch-20260713-web-1', image: webImage, hash: 'sha256:76f4657ff21382fee7b57f4cb791d58bde6aefd5fb3a2b13311d10b7af1e86c9' },
];
function docker(args, input) {
  try { return execFileSync('docker', args, { input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 60000 }).trim(); }
  catch { throw new Error(`Docker ${args[0]} failed; response withheld to protect configuration`); }
}
function engine(method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body === undefined ? undefined : JSON.stringify(body);
    const req = http.request({ socketPath: '\\\\.\\pipe\\docker_engine', path, method,
      headers: data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {} }, res => {
      const chunks = []; res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) return reject(new Error(`Docker Engine ${method} failed (${res.statusCode}); response withheld`));
        const raw = Buffer.concat(chunks).toString(); resolve(raw ? JSON.parse(raw) : undefined);
      });
    });
    req.on('error', () => reject(new Error('Docker Engine transport failed')));
    req.setTimeout(60000, () => req.destroy()); req.end(data);
  });
}
const inspect = name => JSON.parse(docker(['inspect', name]))[0];
const countScript = `import {PrismaClient} from '@prisma/client'; const p=new PrismaClient(); try { console.log(JSON.stringify({active:await p.decisionRun.count({where:{status:{in:['PENDING','RUNNING']}}}),runs:await p.decisionRun.count(),proposals:await p.actionProposal.count()})); } finally {await p.$disconnect();}`;
function counts(name) { return JSON.parse(docker(['exec', '-i', name, 'node', '--input-type=module'], countScript)); }
function emit(stage, data) { console.log(JSON.stringify({ time: new Date().toISOString(), stage, ...data })); }
function compareConfiguration(old, next) {
  const config = c => {
    const result = structuredClone(c.Config);
    delete result.Image; delete result.Hostname;
    result.Env = result.Env.filter(value => !/^(GIT_SHA|BUILD_TIME)=/.test(value)).sort();
    return result;
  };
  const host = c => { const result = structuredClone(c.HostConfig); result.OomKillDisable = Boolean(result.OomKillDisable); return result; };
  if (!isDeepStrictEqual(config(old), config(next))) throw new Error('Application configuration differs');
  if (!isDeepStrictEqual(host(old), host(next))) throw new Error('Host configuration differs');
  if (!isDeepStrictEqual(Object.keys(old.NetworkSettings.Networks).sort(), Object.keys(next.NetworkSettings.Networks).sort())) throw new Error('Networks differ');
}
async function probe(url) {
  for (let i = 0; i < 50; i++) {
    try { const response = await fetch(url, { signal: AbortSignal.timeout(2000) }); if (response.ok) return { status: response.status, ...(url.endsWith('/version') ? { version: await response.json() } : {}) }; } catch { /* Startup is bounded by this loop. */ }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error(`Health probe failed: ${url}`);
}
async function verifyRuntime() {
  emit('http', { ready: await probe('http://127.0.0.1:4300/ready'), version: await probe('http://127.0.0.1:4300/version'), login: await probe('http://127.0.0.1:3300/login') });
  const versions = `import {diagnosisPromptVersion,diagnosisOrchestrationVersion} from './apps/api/dist/ai-diagnosis/orchestrator.js'; import {diagnosisSkillSetVersion} from './packages/diagnosis-skills/dist/index.js'; if(!diagnosisPromptVersion.endsWith('-v26')||!diagnosisOrchestrationVersion.endsWith('-v34')||!diagnosisSkillSetVersion.endsWith('-v10'))throw new Error('Version mismatch'); console.log(JSON.stringify({diagnosisPromptVersion,diagnosisOrchestrationVersion,diagnosisSkillSetVersion}));`;
  for (const s of services.slice(0, 2)) emit('runtime-version', { name: s.name, ...JSON.parse(docker(['exec', '-i', s.name, 'node', '--input-type=module'], versions)) });
  for (let i = 0; i < 50 && inspect(services[0].name).State.Health?.Status !== 'healthy'; i++) await new Promise(resolve => setTimeout(resolve, 500));
  for (const s of services) {
    const c = inspect(s.name);
    if (c.Image !== s.hash || !c.State.Running || c.RestartCount !== 0 || (c.State.Health && c.State.Health.Status !== 'healthy')) throw new Error('Running image or health mismatch');
    emit('container', { name: s.name, image: c.Image, status: c.State.Status, health: c.State.Health?.Status, restarts: c.RestartCount });
  }
  const markers = `import {readdirSync,readFileSync} from 'node:fs'; import {join} from 'node:path'; const markers=['事实已确认，AI 建议未完成','目标是否达成','趋势能否判断','原因是否确认','最近两个完整 15 分钟窗口']; const found=new Set(); function visit(dir){ for(const e of readdirSync(dir,{withFileTypes:true})){const p=join(dir,e.name);if(e.isDirectory())visit(p);else if(p.endsWith('.js')){const t=readFileSync(p,'utf8');for(const m of markers)if(t.includes(m))found.add(m);}}} visit('/app/apps/web/.next'); if(found.size!==5)throw new Error('Web content missing');console.log(JSON.stringify({webMarkers:found.size}));`;
  emit('web-content', JSON.parse(docker(['exec', '-i', services[2].name, 'node', '--input-type=module'], markers)));
}

async function main() {
  if (process.argv.includes('--verify')) { await verifyRuntime(); emit('records', counts(services[0].name)); return; }
  const names = new Set(docker(['ps', '-a', '--format', '{{.Names}}']).split('\n'));
  for (const s of services) {
    s.old = inspect(s.name); s.backup = `${s.name}-before-${suffix}`; s.next = `${s.name}-next-${suffix}`;
    if (!s.old.State.Running || names.has(s.backup) || names.has(s.next)) throw new Error('Unexpected initial service state');
    if (s.old.Mounts.length || s.old.HostConfig.AutoRemove) throw new Error('Unsupported mounted or auto-remove service');
    s.imageConfig = JSON.parse(docker(['image', 'inspect', s.image]))[0];
    if (s.imageConfig.Id !== s.hash) throw new Error('Candidate image changed');
  }
  const schema = docker(['exec', services[0].name, 'node', '-e', "console.log(require('crypto').createHash('sha256').update(require('fs').readFileSync('/app/prisma/schema.prisma')).digest('hex'))"]);
  if (schema !== createHash('sha256').update(readFileSync('prisma/schema.prisma')).digest('hex')) throw new Error('Schema changed; separate migration required');
  const before = counts(services[0].name); emit('preflight', { ...before, schemaUnchanged: true, candidateImagesPinned: true });
  if (before.active) throw new Error('Active diagnoses must finish before switching');
  if (!process.argv.includes('--deploy')) return;
  try {
    for (const s of services) {
      const config = structuredClone(s.old.Config); config.Image = s.image; delete config.Hostname;
      config.Env = config.Env.filter(value => !/^(GIT_SHA|BUILD_TIME)=/.test(value));
      config.Env.push(...s.imageConfig.Config.Env.filter(value => /^(GIT_SHA|BUILD_TIME)=/.test(value)));
      const endpoints = Object.fromEntries(Object.entries(s.old.NetworkSettings.Networks).map(([name, endpoint]) => [name, { Aliases: endpoint.Aliases, IPAMConfig: endpoint.IPAMConfig, DriverOpts: endpoint.DriverOpts }]));
      const created = await engine('POST', `/containers/create?name=${encodeURIComponent(s.next)}`, { ...config, HostConfig: s.old.HostConfig, NetworkingConfig: { EndpointsConfig: endpoints } });
      s.created = created.Id;
      compareConfiguration(s.old, inspect(s.created));
      emit('prepared', { name: s.name, configurationEqual: true });
    }
    docker(['stop', '-t', '30', services[2].name]); services[2].stopped = true;
    docker(['stop', '-t', '30', services[0].name]); services[0].stopped = true;
    const drained = counts(services[1].name); emit('drained', drained);
    if (drained.active) throw new Error('New diagnosis appeared during drain; restoring services');
    docker(['stop', '-t', '30', services[1].name]); services[1].stopped = true;
    for (const s of services) { docker(['rename', s.old.Id, s.backup]); s.renamed = true; docker(['rename', s.created, s.name]); }
    for (const s of services) docker(['start', s.created]);
    await verifyRuntime();
    for (const s of services) compareConfiguration(s.old, inspect(s.name));
    const after = counts(services[0].name); emit('postflight', { ...after, configurationEqual: true });
    if (!isDeepStrictEqual(before, after)) throw new Error('Diagnosis counts changed during deployment');
    emit('complete', { rollbackContainers: services.map(s => s.backup) });
  } catch (error) {
    emit('rollback-start', { reason: error.message });
    for (const s of [...services].reverse()) if (s.created) { docker(['rm', '-f', s.created]); s.created = undefined; }
    for (const s of services) { if (s.renamed) docker(['rename', s.old.Id, s.name]); if (s.stopped) docker(['start', s.old.Id]); }
    emit('rollback-complete', { ready: await probe('http://127.0.0.1:4300/ready'), login: await probe('http://127.0.0.1:3300/login') });
    throw error;
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
