#!/usr/bin/env node

import { spawnSync } from "node:child_process";

const prismaSchemaPath = "prisma/schema.prisma";
const isWindows = process.platform === "win32";
const npxCmd = isWindows ? "npx.cmd" : "npx";

const FORCE_DB_MIGRATE = /^(1|true|yes|on)$/i.test(
  process.env.FORCE_DB_MIGRATE ?? "",
);
const MIGRATE_RETRIES = Number(process.env.PRISMA_MIGRATE_RETRIES ?? 3);
const MIGRATE_RETRY_DELAY_MS = Number(process.env.PRISMA_MIGRATE_RETRY_DELAY_MS ?? 4000);

function runCommand(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    stdio: "pipe",
    ...options,
  });

  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  if (output) {
    process.stdout.write(output);
  }

  return {
    status: result.status ?? 1,
    output,
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isSchemaUpToDate(output) {
  const text = output.toLowerCase();
  return text.includes("database schema is up to date");
}

function hasPendingMigrations(output) {
  const text = output.toLowerCase();
  return text.includes("have not yet been applied");
}

function isAdvisoryLockTimeout(output) {
  const text = output.toLowerCase();
  return (
    text.includes("timed out trying to acquire a postgres advisory lock") ||
    text.includes("error: p1002")
  );
}

function checkMigrationStatus() {
  return runCommand(npxCmd, [
    "prisma",
    "migrate",
    "status",
    "--schema",
    prismaSchemaPath,
  ]);
}

async function runMigrateDeployWithRetry() {
  for (let attempt = 1; attempt <= MIGRATE_RETRIES; attempt += 1) {
    const deploy = runCommand(npxCmd, [
      "prisma",
      "migrate",
      "deploy",
      "--schema",
      prismaSchemaPath,
    ]);

    if (deploy.status === 0) {
      return;
    }

    if (isAdvisoryLockTimeout(deploy.output)) {
      console.warn(
        `[db] advisory lock timeout on attempt ${attempt}/${MIGRATE_RETRIES}, rechecking migration status...`,
      );

      const statusAfterTimeout = checkMigrationStatus();
      if (statusAfterTimeout.status === 0 && isSchemaUpToDate(statusAfterTimeout.output)) {
        console.log("[db] migrations already applied by another deployment, skip migrate deploy.");
        return;
      }

      if (attempt < MIGRATE_RETRIES) {
        await sleep(MIGRATE_RETRY_DELAY_MS);
        continue;
      }
    }

    throw new Error("[db] prisma migrate deploy failed.");
  }
}

async function ensureDatabaseReady() {
  if (FORCE_DB_MIGRATE) {
    console.log("[db] FORCE_DB_MIGRATE=true, running prisma migrate deploy.");
    await runMigrateDeployWithRetry();
    return;
  }

  const status = checkMigrationStatus();
  if (status.status === 0 && isSchemaUpToDate(status.output)) {
    console.log("[db] schema is up to date, skip migrate deploy.");
    return;
  }

  if (hasPendingMigrations(status.output)) {
    console.log("[db] pending migrations detected, running migrate deploy.");
    await runMigrateDeployWithRetry();
    return;
  }

  if (status.status !== 0) {
    console.warn(
      "[db] unable to confirm migration status, skip migrate deploy by default.",
    );
    return;
  }

  console.log("[db] status not up-to-date, running migrate deploy.");
  await runMigrateDeployWithRetry();
}

function runChecked(command, args, errorMessage) {
  const result = runCommand(command, args);
  if (result.status !== 0) {
    throw new Error(errorMessage);
  }
}

async function main() {
  await ensureDatabaseReady();

  runChecked(
    npxCmd,
    ["prisma", "generate", "--schema", prismaSchemaPath],
    "[build] prisma generate failed.",
  );

  runChecked(npxCmd, ["next", "build"], "[build] next build failed.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
