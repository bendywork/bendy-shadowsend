BEGIN;

DROP TABLE IF EXISTS "bendy_shadowsend_presence" CASCADE;
DROP TABLE IF EXISTS "bendy_shadowsend_message_attachment" CASCADE;
DROP TABLE IF EXISTS "bendy_shadowsend_message" CASCADE;
DROP TABLE IF EXISTS "bendy_shadowsend_room_invite" CASCADE;
DROP TABLE IF EXISTS "bendy_shadowsend_join_request" CASCADE;
DROP TABLE IF EXISTS "bendy_shadowsend_room_member" CASCADE;
DROP TABLE IF EXISTS "bendy_shadowsend_room" CASCADE;
DROP TABLE IF EXISTS "bendy_shadowsend_user" CASCADE;

DROP TYPE IF EXISTS "bendy_shadowsend_preview_type" CASCADE;
DROP TYPE IF EXISTS "bendy_shadowsend_message_type" CASCADE;
DROP TYPE IF EXISTS "bendy_shadowsend_invite_status" CASCADE;
DROP TYPE IF EXISTS "bendy_shadowsend_request_status" CASCADE;
DROP TYPE IF EXISTS "bendy_shadowsend_member_status" CASCADE;
DROP TYPE IF EXISTS "bendy_shadowsend_room_role" CASCADE;
DROP TYPE IF EXISTS "bendy_shadowsend_room_status" CASCADE;

COMMIT;

-- Recreate prefixed tables and enums

-- CreateEnum
CREATE TYPE "bendy_shadowsend_room_status" AS ENUM ('ACTIVE', 'DELETED');

-- CreateEnum
CREATE TYPE "bendy_shadowsend_room_role" AS ENUM ('OWNER', 'MEMBER');

-- CreateEnum
CREATE TYPE "bendy_shadowsend_member_status" AS ENUM ('ACTIVE', 'PENDING', 'KICKED', 'LEFT');

-- CreateEnum
CREATE TYPE "bendy_shadowsend_request_status" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "bendy_shadowsend_invite_status" AS ENUM ('ACTIVE', 'USED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "bendy_shadowsend_message_type" AS ENUM ('TEXT', 'FILE', 'MIXED');

-- CreateEnum
CREATE TYPE "bendy_shadowsend_preview_type" AS ENUM ('NONE', 'IMAGE', 'VIDEO');

-- CreateTable
CREATE TABLE "bendy_shadowsend_user" (
    "id" TEXT NOT NULL,
    "nickname" TEXT NOT NULL,
    "avatarInitial" TEXT NOT NULL,
    "avatarColor" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bendy_shadowsend_user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bendy_shadowsend_room" (
    "id" TEXT NOT NULL,
    "roomCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "gateCode" TEXT,
    "gateCodeExpiresAt" TIMESTAMP(3),
    "announcementText" TEXT,
    "announcementImageKey" TEXT,
    "announcementImageName" TEXT,
    "announcementUpdatedAt" TIMESTAMP(3),
    "status" "bendy_shadowsend_room_status" NOT NULL DEFAULT 'ACTIVE',
    "deletedAt" TIMESTAMP(3),
    "lastActiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bendy_shadowsend_room_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bendy_shadowsend_room_member" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "bendy_shadowsend_room_role" NOT NULL DEFAULT 'MEMBER',
    "status" "bendy_shadowsend_member_status" NOT NULL DEFAULT 'ACTIVE',
    "requiresApproval" BOOLEAN NOT NULL DEFAULT false,
    "announcementSeenAt" TIMESTAMP(3),
    "joinedAt" TIMESTAMP(3),
    "kickedAt" TIMESTAMP(3),
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "invitedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bendy_shadowsend_room_member_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bendy_shadowsend_join_request" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "memberId" TEXT,
    "status" "bendy_shadowsend_request_status" NOT NULL DEFAULT 'PENDING',
    "reason" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bendy_shadowsend_join_request_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bendy_shadowsend_room_invite" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "inviterId" TEXT NOT NULL,
    "status" "bendy_shadowsend_invite_status" NOT NULL DEFAULT 'ACTIVE',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedById" TEXT,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bendy_shadowsend_room_invite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bendy_shadowsend_message" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "type" "bendy_shadowsend_message_type" NOT NULL DEFAULT 'TEXT',
    "encryptedContent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bendy_shadowsend_message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bendy_shadowsend_message_attachment" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "uploaderId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" BIGINT NOT NULL,
    "s3Key" TEXT NOT NULL,
    "previewType" "bendy_shadowsend_preview_type" NOT NULL DEFAULT 'NONE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bendy_shadowsend_message_attachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bendy_shadowsend_presence" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "roomId" TEXT,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bendy_shadowsend_presence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "bendy_shadowsend_room_roomCode_key" ON "bendy_shadowsend_room"("roomCode");

-- CreateIndex
CREATE INDEX "bendy_shadowsend_room_status_lastActiveAt_idx" ON "bendy_shadowsend_room"("status", "lastActiveAt");

-- CreateIndex
CREATE INDEX "bendy_shadowsend_room_ownerId_status_idx" ON "bendy_shadowsend_room"("ownerId", "status");

-- CreateIndex
CREATE INDEX "bendy_shadowsend_room_member_userId_status_idx" ON "bendy_shadowsend_room_member"("userId", "status");

-- CreateIndex
CREATE INDEX "bendy_shadowsend_room_member_roomId_status_idx" ON "bendy_shadowsend_room_member"("roomId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "bendy_shadowsend_room_member_roomId_userId_key" ON "bendy_shadowsend_room_member"("roomId", "userId");

-- CreateIndex
CREATE INDEX "bendy_shadowsend_join_request_roomId_status_createdAt_idx" ON "bendy_shadowsend_join_request"("roomId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "bendy_shadowsend_join_request_userId_status_idx" ON "bendy_shadowsend_join_request"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "bendy_shadowsend_room_invite_token_key" ON "bendy_shadowsend_room_invite"("token");

-- CreateIndex
CREATE INDEX "bendy_shadowsend_room_invite_roomId_status_expiresAt_idx" ON "bendy_shadowsend_room_invite"("roomId", "status", "expiresAt");

-- CreateIndex
CREATE INDEX "bendy_shadowsend_message_roomId_createdAt_idx" ON "bendy_shadowsend_message"("roomId", "createdAt");

-- CreateIndex
CREATE INDEX "bendy_shadowsend_message_attachment_roomId_createdAt_idx" ON "bendy_shadowsend_message_attachment"("roomId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "bendy_shadowsend_presence_userId_key" ON "bendy_shadowsend_presence"("userId");

-- CreateIndex
CREATE INDEX "bendy_shadowsend_presence_lastSeenAt_idx" ON "bendy_shadowsend_presence"("lastSeenAt");

-- CreateIndex
CREATE INDEX "bendy_shadowsend_presence_roomId_lastSeenAt_idx" ON "bendy_shadowsend_presence"("roomId", "lastSeenAt");

-- AddForeignKey
ALTER TABLE "bendy_shadowsend_room" ADD CONSTRAINT "bendy_shadowsend_room_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "bendy_shadowsend_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bendy_shadowsend_room_member" ADD CONSTRAINT "bendy_shadowsend_room_member_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "bendy_shadowsend_room"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bendy_shadowsend_room_member" ADD CONSTRAINT "bendy_shadowsend_room_member_userId_fkey" FOREIGN KEY ("userId") REFERENCES "bendy_shadowsend_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bendy_shadowsend_room_member" ADD CONSTRAINT "bendy_shadowsend_room_member_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "bendy_shadowsend_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bendy_shadowsend_join_request" ADD CONSTRAINT "bendy_shadowsend_join_request_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "bendy_shadowsend_room"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bendy_shadowsend_join_request" ADD CONSTRAINT "bendy_shadowsend_join_request_userId_fkey" FOREIGN KEY ("userId") REFERENCES "bendy_shadowsend_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bendy_shadowsend_join_request" ADD CONSTRAINT "bendy_shadowsend_join_request_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "bendy_shadowsend_room_member"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bendy_shadowsend_join_request" ADD CONSTRAINT "bendy_shadowsend_join_request_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "bendy_shadowsend_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bendy_shadowsend_room_invite" ADD CONSTRAINT "bendy_shadowsend_room_invite_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "bendy_shadowsend_room"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bendy_shadowsend_room_invite" ADD CONSTRAINT "bendy_shadowsend_room_invite_inviterId_fkey" FOREIGN KEY ("inviterId") REFERENCES "bendy_shadowsend_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bendy_shadowsend_room_invite" ADD CONSTRAINT "bendy_shadowsend_room_invite_usedById_fkey" FOREIGN KEY ("usedById") REFERENCES "bendy_shadowsend_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bendy_shadowsend_message" ADD CONSTRAINT "bendy_shadowsend_message_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "bendy_shadowsend_room"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bendy_shadowsend_message" ADD CONSTRAINT "bendy_shadowsend_message_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "bendy_shadowsend_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bendy_shadowsend_message_attachment" ADD CONSTRAINT "bendy_shadowsend_message_attachment_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "bendy_shadowsend_message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bendy_shadowsend_message_attachment" ADD CONSTRAINT "bendy_shadowsend_message_attachment_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "bendy_shadowsend_room"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bendy_shadowsend_message_attachment" ADD CONSTRAINT "bendy_shadowsend_message_attachment_uploaderId_fkey" FOREIGN KEY ("uploaderId") REFERENCES "bendy_shadowsend_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bendy_shadowsend_presence" ADD CONSTRAINT "bendy_shadowsend_presence_userId_fkey" FOREIGN KEY ("userId") REFERENCES "bendy_shadowsend_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bendy_shadowsend_presence" ADD CONSTRAINT "bendy_shadowsend_presence_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "bendy_shadowsend_room"("id") ON DELETE SET NULL ON UPDATE CASCADE;
