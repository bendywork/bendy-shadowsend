CREATE TABLE IF NOT EXISTS "bendy_shadowsend_app_auth_config" (
  "id" TEXT NOT NULL,
  "auth" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "bendy_shadowsend_app_auth_config_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "bendy_shadowsend_advertisement" (
  "id" TEXT NOT NULL,
  "startsAt" TIMESTAMP(3) NOT NULL,
  "endsAt" TIMESTAMP(3) NOT NULL,
  "content" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "bendy_shadowsend_advertisement_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "bendy_shadowsend_advertisement_startsAt_endsAt_idx"
  ON "bendy_shadowsend_advertisement"("startsAt", "endsAt");

INSERT INTO "bendy_shadowsend_app_auth_config" ("id", "auth")
VALUES ('default', 'bendywork')
ON CONFLICT ("id") DO NOTHING;
