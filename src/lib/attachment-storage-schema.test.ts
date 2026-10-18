import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const schema = readFileSync(join(root, "prisma/schema.prisma"), "utf8");
const addMigrationDir = join(
  root,
  "prisma/migrations/20261018150000_add_remote_storage_and_chunk_manifest",
);
const removeMigrationDir = join(
  root,
  "prisma/migrations/20261018160000_remove_legacy_attachment_storage",
);

describe("attachment storage Prisma model", () => {
  it("declares only SANG and PIC_SL in the AttachmentStorage enum", () => {
    const enumBlock = schema.match(
      /enum AttachmentStorage \{([\s\S]*?)\}/,
    )?.[1];

    expect(enumBlock).toBeDefined();
    expect(enumBlock).toContain("SANG");
    expect(enumBlock).toContain("PIC_SL");
    expect(enumBlock).not.toMatch(/\bS3\b/);
    expect(enumBlock).not.toMatch(/\bDUFS\b/);
  });

  it("declares a nullable chunkManifest JSON field on MessageAttachment", () => {
    const modelBlock = schema.match(
      /model MessageAttachment \{([\s\S]*?)\n\}/,
    )?.[1];

    expect(modelBlock).toBeDefined();
    expect(modelBlock).toMatch(/chunkManifest\s+Json\?/);
  });

  it("does not default new attachments to a legacy storage", () => {
    const modelBlock = schema.match(
      /model MessageAttachment \{([\s\S]*?)\n\}/,
    )?.[1];

    expect(modelBlock).toBeDefined();
    expect(modelBlock).toMatch(/storage\s+AttachmentStorage\s*\n/);
    expect(modelBlock).not.toMatch(/storage\s+AttachmentStorage\s+@default/);
  });
});

describe("attachment storage migrations", () => {
  it("ships the additive SANG/PIC_SL migration", () => {
    expect(existsSync(addMigrationDir)).toBe(true);

    const sql = readFileSync(join(addMigrationDir, "migration.sql"), "utf8");
    expect(sql).toMatch(
      /ALTER TYPE "bendy_shadowsend_attachment_storage" ADD VALUE IF NOT EXISTS 'SANG';/,
    );
    expect(sql).toMatch(
      /ALTER TYPE "bendy_shadowsend_attachment_storage" ADD VALUE IF NOT EXISTS 'PIC_SL';/,
    );
  });

  it("adds the nullable JSONB manifest column without dropping columns", () => {
    const sql = readFileSync(join(addMigrationDir, "migration.sql"), "utf8");

    expect(sql).toMatch(
      /ALTER TABLE "bendy_shadowsend_message_attachment"\s+ADD COLUMN IF NOT EXISTS "chunkManifest" JSONB;/,
    );
    expect(sql).not.toMatch(/DROP\s+(TABLE|COLUMN)/i);
  });

  it("rebuilds the enum after verifying legacy stock is empty", () => {
    expect(existsSync(removeMigrationDir)).toBe(true);

    const sql = readFileSync(join(removeMigrationDir, "migration.sql"), "utf8");

    expect(sql).toMatch(/RAISE EXCEPTION 'legacy attachment rows remain/);
    expect(sql).toMatch(/RAISE EXCEPTION 'legacy announcement images remain/);
    expect(sql).toMatch(
      /CREATE TYPE "bendy_shadowsend_attachment_storage" AS ENUM \('SANG', 'PIC_SL'\);/,
    );
    expect(sql).toMatch(/DROP TYPE "bendy_shadowsend_attachment_storage_legacy";/);
    expect(sql).not.toMatch(/DROP\s+(TABLE|COLUMN)/i);
  });
});
