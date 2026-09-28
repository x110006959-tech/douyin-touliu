import http from "node:http";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";

// Local runtime switch. Configuration is cloned in memory and is never written to disk.
const suffix = "source-conflict-scope-v29-20260918";
const apiImage = "pxxis-api:source-conflict-scope-v29-20260918";
const webImage = "pxxis-web:source-conflict-scope-v29-20260918";
const services = [
  { name: "pxxis-prelaunch-20260713-api-1", image: apiImage, hash: "sha256:722c7bcdc796244a6ab3ba9869e3b5936e331a6bbb4a59909cc13123c440d7b1" },
  { name: "pxxis-local-ai-validation-worker", image: apiImage, hash: "sha256:722c7bcdc796244a6ab3ba9869e3b5936e331a6bbb4a59909cc13123c440d7b1" },
  { name: "pxxis-prelaunch-20260713-web-1", image: webImage, hash: "sha256:5ac2eb551bdb280cf0df57c09c1e904d83309542357f026b002dcf206d6c0fd5" }
];

function docker(args, input) {
  try {
    return execFileSync("docker", args, {
      input,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 120000
    }).trim();
  } catch {
    throw new Error(`Docker ${args[0]} failed; response withheld to protect configuration`);
  }
}

function engine(method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body === undefined ? undefined : JSON.stringify(body);
    const req = http.request(
      {
        socketPath: "\\\\.\\pipe\\docker_engine",
        path,
        method,
        headers: data ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) } : {}
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          if (res.statusCode < 200 || res.statusCode >= 300) {
            return reject(new Error(`Docker Engine ${method} failed (${res.statusCode}); response withheld`));
          }
          const raw = Buffer.concat(chunks).toString();
          resolve(raw ? JSON.parse(raw) : undefined);
        });
      }
    );
    req.on("error", () => reject(new Error("Docker Engine transport failed")));
    req.setTimeout(120000, () => req.destroy());
    req.end(data);
  });
}

const inspect = (name) => JSON.parse(docker(["inspect", name]))[0];

const countScript = `import {PrismaClient} from '@prisma/client'; const p=new PrismaClient(); try { console.log(JSON.stringify({active:await p.decisionRun.count({where:{status:{in:['PENDING','RUNNING']}}}),runs:await p.decisionRun.count(),proposals:await p.actionProposal.count(),users:await p.user.count()})); } finally {await p.$disconnect();}`;
const counts = (name) => JSON.parse(docker(["exec", "-i", name, "node", "--input-type=module"], countScript));

function emit(stage, data) {
  console.log(JSON.stringify({ time: new Date().toISOString(), stage, ...data }));
}

function compareConfiguration(old, next) {
  const config = (value) => {
    const result = structuredClone(value.Config);
    delete result.Image;
    delete result.Hostname;
    result.Env = result.Env.filter((entry) => !/^(GIT_SHA|BUILD_TIME)=/.test(entry)).sort();
    return result;
  };
  const host = (value) => {
    const result = structuredClone(value.HostConfig);
    result.OomKillDisable = Boolean(result.OomKillDisable);
    return result;
  };
  if (!isDeepStrictEqual(config(old), config(next))) throw new Error("Application configuration differs");
  if (!isDeepStrictEqual(host(old), host(next))) throw new Error("Host configuration differs");
  if (!isDeepStrictEqual(Object.keys(old.NetworkSettings.Networks).sort(), Object.keys(next.NetworkSettings.Networks).sort())) {
    throw new Error("Networks differ");
  }
}

async function probe(url) {
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(3000) });
      if (response.ok) return response.status;
    } catch {
      // Bounded startup wait.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Health probe failed: ${url}`);
}

const moduleVersionScript = `import {diagnosisPromptVersion,diagnosisOrchestrationVersion} from './apps/api/dist/ai-diagnosis/orchestrator.js'; import {diagnosisSkillSetVersion} from './packages/diagnosis-skills/dist/index.js'; console.log(JSON.stringify({diagnosisPromptVersion,diagnosisOrchestrationVersion,diagnosisSkillSetVersion}));`;

async function verifyRuntime() {
  emit("http", {
    ready: await probe("http://127.0.0.1:4300/ready"),
    version: await probe("http://127.0.0.1:4300/version"),
    login: await probe("http://127.0.0.1:3300/login"),
    register: await probe("http://127.0.0.1:3300/register")
  });

  const apiVersion = docker(["exec", services[0].name, "node", "--input-type=module", "-e", moduleVersionScript]);
  const workerVersion = docker(["exec", services[1].name, "node", "--input-type=module", "-e", moduleVersionScript]);
  if (apiVersion !== workerVersion) throw new Error("API and Worker diagnosis modules differ");
  emit("diagnosis-version", JSON.parse(apiVersion));

  docker(["exec", services[2].name, "sh", "-c", "test -f /app/apps/web/.next/server/app-paths-manifest.json && ! test -d /app/apps/web/.next/.next && grep -q '/register/page' /app/apps/web/.next/server/app-paths-manifest.json"]);

  for (let attempt = 0; attempt < 60 && inspect(services[0].name).State.Health?.Status !== "healthy"; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  for (const service of services) {
    const current = inspect(service.name);
    const healthOk = service.name.includes("-api-1") ? current.State.Health?.Status === "healthy" : true;
    emit("check", {
      name: service.name,
      image: current.Image,
      running: current.State.Running,
      restarts: current.RestartCount,
      health: current.State.Health?.Status ?? "none",
      expected: service.hash
    });
    if (current.Image !== service.hash || !current.State.Running || current.RestartCount !== 0 || !healthOk) {
      throw new Error("Runtime mismatch");
    }
  }
}

async function main() {
  const names = new Set(docker(["ps", "-a", "--format", "{{.Names}}"]).split("\n").filter(Boolean));
  for (const service of services) {
    service.old = inspect(service.name);
    service.backup = `${service.name}-before-${suffix}`;
    service.next = `${service.name}-next-${suffix}`;
    if (!service.old.State.Running || names.has(service.backup) || names.has(service.next)) {
      throw new Error(`Unexpected initial service state: ${service.name}`);
    }
    if (service.old.Mounts.length || service.old.HostConfig.AutoRemove) {
      throw new Error(`Unsupported mounted or auto-remove service: ${service.name}`);
    }
    service.imageConfig = JSON.parse(docker(["image", "inspect", service.image]))[0];
    if (service.imageConfig.Id !== service.hash) throw new Error(`Candidate image changed: ${service.name}`);
  }

  const schema = docker(["exec", services[0].name, "node", "-e", "console.log(require('crypto').createHash('sha256').update(require('fs').readFileSync('/app/prisma/schema.prisma')).digest('hex'))"]);
  if (schema !== createHash("sha256").update(readFileSync("prisma/schema.prisma")).digest("hex")) {
    throw new Error("Schema changed; separate migration required");
  }

  const before = counts(services[0].name);
  emit("preflight", { ...before, schemaUnchanged: true, candidateImagesPinned: true });
  if (before.active) throw new Error("Active diagnoses must finish before switching");

  if (process.argv.includes("--verify")) {
    await verifyRuntime();
    emit("records", counts(services[0].name));
    return;
  }

  try {
    for (const service of services) {
      const config = structuredClone(service.old.Config);
      config.Image = service.image;
      delete config.Hostname;
      config.Env = config.Env.filter((entry) => !/^(GIT_SHA|BUILD_TIME)=/.test(entry));
      config.Env.push(...service.imageConfig.Config.Env.filter((entry) => /^(GIT_SHA|BUILD_TIME)=/.test(entry)));
      const endpoints = Object.fromEntries(
        Object.entries(service.old.NetworkSettings.Networks).map(([networkName, endpoint]) => [
          networkName,
          { Aliases: endpoint.Aliases, IPAMConfig: endpoint.IPAMConfig, DriverOpts: endpoint.DriverOpts }
        ])
      );
      const created = await engine("POST", `/containers/create?name=${encodeURIComponent(service.next)}`, {
        ...config,
        HostConfig: service.old.HostConfig,
        NetworkingConfig: { EndpointsConfig: endpoints }
      });
      service.created = created.Id;
      compareConfiguration(service.old, inspect(service.created));
      emit("prepared", { name: service.name, configurationEqual: true });
    }

    docker(["stop", "-t", "30", services[2].name]);
    services[2].stopped = true;
    docker(["stop", "-t", "30", services[0].name]);
    services[0].stopped = true;

    const drained = counts(services[1].name);
    emit("drained", drained);
    if (drained.active) throw new Error("New diagnosis appeared during drain; restoring services");

    docker(["stop", "-t", "30", services[1].name]);
    services[1].stopped = true;

    for (const service of services) {
      docker(["rename", service.old.Id, service.backup]);
      service.renamed = true;
      docker(["rename", service.created, service.name]);
    }
    for (const service of services) docker(["start", service.created]);

    await verifyRuntime();
    const after = counts(services[0].name);
    emit("postflight", after);
    if (!isDeepStrictEqual(before, after)) throw new Error("Business counts changed during deployment");

    emit("complete", { rollbackContainers: services.map((service) => service.backup), after });
  } catch (error) {
    emit("rollback-start", { reason: error.message });
    for (const service of [...services].reverse()) {
      if (service.created) {
        try {
          docker(["rm", "-f", service.created]);
        } catch {
          // Continue restoring the original services.
        }
        service.created = undefined;
      }
    }
    for (const service of services) {
      if (service.renamed) {
        try {
          docker(["rename", service.old.Id, service.name]);
        } catch {
          // Continue restoring remaining services.
        }
      }
      if (service.stopped) {
        try {
          docker(["start", service.old.Id]);
        } catch {
          // Continue restoring remaining services.
        }
      }
    }
    emit("rollback-complete", {
      ready: await probe("http://127.0.0.1:4300/ready"),
      login: await probe("http://127.0.0.1:3300/login")
    });
    throw error;
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
