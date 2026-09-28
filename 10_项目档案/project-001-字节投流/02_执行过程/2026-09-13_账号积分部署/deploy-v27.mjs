import http from "node:http";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";

const suffix = "accounts-credits-v27-20260913";
const services = [
  { name: "pxxis-prelaunch-20260713-api-1", image: "pxxis-api:accounts-credits-v27-20260913", hash: "sha256:a369a492051dd68a1b721a90dbd00ddbc28609dc55f927ef9f23818881cb2175" },
  { name: "pxxis-local-ai-validation-worker", image: "pxxis-api:accounts-credits-v27-20260913", hash: "sha256:a369a492051dd68a1b721a90dbd00ddbc28609dc55f927ef9f23818881cb2175" },
  { name: "pxxis-prelaunch-20260713-web-1", image: "pxxis-web:accounts-credits-v27-20260913", hash: "sha256:8e9c0b6e958e8693264fd1ab7dbe3fb912570d42c2fdd63fc7f7948266b85224" }
];
function docker(args, input) {
  try { return execFileSync("docker", args, { input, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"], timeout: 60000 }).trim(); }
  catch { throw new Error(`Docker ${args[0]} failed`); }
}
function inspect(name) { return JSON.parse(docker(["inspect", name]))[0]; }
function counts(name) {
  const script = "import {PrismaClient} from '@prisma/client'; const p=new PrismaClient(); try { console.log(JSON.stringify({active:await p.decisionRun.count({where:{status:{in:['PENDING','RUNNING']}}}),runs:await p.decisionRun.count(),proposals:await p.actionProposal.count(),users:await p.user.count()})); } finally { await p.$disconnect(); }";
  return JSON.parse(docker(["exec", "-i", name, "node", "--input-type=module"], script));
}
function emit(stage, data) { console.log(JSON.stringify({ time: new Date().toISOString(), stage, ...data })); }
function compareConfiguration(old, next) {
  const config = c => { const x = structuredClone(c.Config); delete x.Image; delete x.Hostname; x.Env = x.Env.filter(v => !/^(GIT_SHA|BUILD_TIME)=/.test(v)).sort(); return x; };
  const host = c => { const x = structuredClone(c.HostConfig); x.OomKillDisable = Boolean(x.OomKillDisable); return x; };
  if (!isDeepStrictEqual(config(old), config(next)) || !isDeepStrictEqual(host(old), host(next))) throw new Error("Application configuration differs");
  if (!isDeepStrictEqual(Object.keys(old.NetworkSettings.Networks).sort(), Object.keys(next.NetworkSettings.Networks).sort())) throw new Error("Networks differ");
}
async function probe(url) {
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch(url, { signal: AbortSignal.timeout(2000) }); if (r.ok) return r.status; } catch {}
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error(`Health probe failed: ${url}`);
}
function engine(method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : undefined;
    const req = http.request({ socketPath: "\\\\.\\pipe\\docker_engine", path, method, headers: data ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) } : {} }, res => {
      const chunks = []; res.on("data", c => chunks.push(c)); res.on("end", () => res.statusCode >= 200 && res.statusCode < 300 ? resolve(chunks.length ? JSON.parse(Buffer.concat(chunks)) : {}) : reject(new Error(`Docker API ${res.statusCode}`)));
    });
    req.on("error", reject); req.setTimeout(60000, () => req.destroy()); req.end(data);
  });
}
async function verify() {
  await probe("http://127.0.0.1:4300/ready"); await probe("http://127.0.0.1:4300/version"); await probe("http://127.0.0.1:3300/login");
  for (let i = 0; i < 60 && inspect(services[0].name).State.Health?.Status !== "healthy"; i++) await new Promise(resolve => setTimeout(resolve, 1000));
  for (const s of services) {
    const c = inspect(s.name);
    const healthOk = s.name.includes("-api-1") ? c.State.Health?.Status === "healthy" : true;
    emit("check", { name: s.name, image: c.Image, running: c.State.Running, restarts: c.RestartCount, health: c.State.Health?.Status ?? "none", expected: s.hash });
    if (c.Image !== s.hash || !c.State.Running || c.RestartCount !== 0 || !healthOk) throw new Error("Runtime mismatch");
  }
  emit("runtime", { counts: counts(services[0].name), images: services.map(s => ({ name: s.name, image: inspect(s.name).Image })) });
}
async function main() {
  for (const s of services) {
    s.old = inspect(s.name); s.backup = `${s.name}-before-${suffix}`; s.next = `${s.name}-next-${suffix}`;
    if (!s.old.State.Running || s.old.Mounts.length) throw new Error(`Unexpected service state: ${s.name}`);
    s.imageConfig = JSON.parse(docker(["image", "inspect", s.image]))[0];
    if (s.imageConfig.Id !== s.hash) throw new Error(`Image mismatch: ${s.name}`);
  }
  const before = counts(services[0].name); emit("preflight", before);
  if (before.active) throw new Error("Active diagnoses must finish before switching");
  if (!process.argv.includes("--deploy")) { await verify(); return; }
  try {
    for (const s of services) {
      const config = structuredClone(s.old.Config); config.Image = s.image; delete config.Hostname;
      config.Env = config.Env.filter(v => !/^(GIT_SHA|BUILD_TIME)=/.test(v));
      config.Env.push(...s.imageConfig.Config.Env.filter(v => /^(GIT_SHA|BUILD_TIME)=/.test(v)));
      const endpoints = Object.fromEntries(Object.entries(s.old.NetworkSettings.Networks).map(([name, endpoint]) => [name, { Aliases: endpoint.Aliases, IPAMConfig: endpoint.IPAMConfig, DriverOpts: endpoint.DriverOpts }]));
      const created = await engine("POST", `/containers/create?name=${encodeURIComponent(s.next)}`, { ...config, HostConfig: s.old.HostConfig, NetworkingConfig: { EndpointsConfig: endpoints } });
      s.created = created.Id; compareConfiguration(s.old, inspect(s.created)); emit("prepared", { name: s.name });
    }
    for (const s of [services[2], services[0]]) { docker(["stop", "-t", "30", s.name]); s.stopped = true; }
    const drained = counts(services[1].name); emit("drained", drained); if (drained.active) throw new Error("New diagnosis appeared during drain");
    docker(["stop", "-t", "30", services[1].name]); services[1].stopped = true;
    for (const s of services) { docker(["rename", s.old.Id, s.backup]); s.renamed = true; docker(["rename", s.created, s.name]); }
    for (const s of services) docker(["start", s.created]);
    await verify();
    const after = counts(services[0].name); if (!isDeepStrictEqual(before, after)) throw new Error("Business counts changed during deployment");
    emit("complete", { rollbackContainers: services.map(s => s.backup), after });
  } catch (error) {
    emit("rollback", { reason: error.message });
    for (const s of [...services].reverse()) if (s.created) { try { docker(["rm", "-f", s.created]); } catch {} }
    for (const s of services) { if (s.renamed) { try { docker(["rename", s.old.Id, s.name]); } catch {} } if (s.stopped) { try { docker(["start", s.old.Id]); } catch {} } }
    throw error;
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
