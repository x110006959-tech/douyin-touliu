import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const apiRoot = resolve(import.meta.dirname, "..");
const repoRoot = resolve(apiRoot, "../..");
const composeFile = resolve(repoRoot, "docker-compose.test.yml");
const externalDatabaseUrl = process.env.TEST_DATABASE_URL;
const databaseUrl =
  externalDatabaseUrl || "postgresql://pxxis_test:local_test_only_password@127.0.0.1:55432/pxxis_test?schema=public";
const env = {
  ...process.env,
  DATABASE_URL: databaseUrl,
  JWT_SECRET: process.env.JWT_SECRET || "local-test-jwt-secret-at-least-32-characters",
  NODE_ENV: "test"
};
const pnpmCli = process.env.npm_execpath;
if (!pnpmCli) throw new Error("pnpm CLI path is unavailable. Run this script through pnpm test.");

let ownsContainer = false;
try {
  run(process.execPath, [pnpmCli, "--filter", "@douyin-local-life/shared", "--filter", "@douyin-local-life/llm", "--filter", "@douyin-local-life/decision-engine", "build"], repoRoot, env);
  if (!externalDatabaseUrl) {
    run("docker", ["compose", "-f", composeFile, "-p", "pxxis-api-test", "up", "-d", "--wait"], repoRoot);
    ownsContainer = true;
  }
  run(process.execPath, [pnpmCli, "exec", "prisma", "db", "push", "--skip-generate"], repoRoot, env);
  run(process.execPath, [pnpmCli, "exec", "vitest", "run", "src"], apiRoot, env);
} finally {
  if (ownsContainer) {
    run("docker", ["compose", "-f", composeFile, "-p", "pxxis-api-test", "down", "--volumes", "--remove-orphans"], repoRoot, process.env, false);
  }
}

function run(command, args, cwd, commandEnv = process.env, failOnError = true) {
  const result = spawnSync(command, args, { cwd, env: commandEnv, stdio: "inherit", shell: false });
  if (result.error && failOnError) throw result.error;
  if (result.status !== 0 && failOnError) process.exitCode = result.status || 1;
  if (result.status !== 0 && failOnError) throw new Error(`${command} exited with status ${result.status}`);
}
