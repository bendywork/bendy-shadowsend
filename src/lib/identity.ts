import { type NextRequest, NextResponse } from "next/server";
import type { User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { USER_COOKIE_NAME } from "@/lib/constants";

const colorPool = [
  "#3f3f46",
  "#52525b",
  "#71717a",
  "#a1a1aa",
  "#27272a",
  "#404040",
  "#737373",
  "#6b7280",
  "#4b5563",
];

const adjectivePool = [
  "敏捷",
  "安静",
  "深蓝",
  "雾海",
  "轻舟",
  "流星",
  "木风",
  "极简",
  "晨光",
  "夜航",
];

const nounPool = [
  "用户",
  "旅人",
  "信使",
  "像素",
  "小队",
  "光点",
  "纸飞机",
  "开发者",
  "朋友",
  "访客",
];

function randomItem<T>(items: T[]): T {
  const index = Math.floor(Math.random() * items.length);
  return items[index];
}

function buildRandomNickname() {
  const suffix = Math.floor(Math.random() * 900 + 100).toString();
  return `${randomItem(adjectivePool)}${randomItem(nounPool)}${suffix}`;
}

function resolveInitial(name: string) {
  const char = name.trim().charAt(0) || "U";
  if (/^[a-z]/i.test(char)) {
    return char.toUpperCase();
  }
  return char;
}

export async function getOrCreateUser(request: NextRequest): Promise<{
  user: User;
  cookieToSet?: string;
}> {
  const cookieUserId = request.cookies.get(USER_COOKIE_NAME)?.value?.trim();

  if (cookieUserId) {
    try {
      const existing = await prisma.user.findUnique({ where: { id: cookieUserId } });
      if (existing) {
        return { user: existing };
      }
    } catch {
      // ignore stale/invalid cookie and continue creating a new user
    }
  }

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const nickname = buildRandomNickname();
      const user = await prisma.user.create({
        data: {
          nickname,
          avatarInitial: resolveInitial(nickname),
          avatarColor: randomItem(colorPool),
        },
      });

      return { user, cookieToSet: user.id };
    } catch (error) {
      if (attempt === 2) {
        throw error;
      }
    }
  }

  throw new Error("创建用户失败");
}

export function applyUserCookie(response: NextResponse, cookieToSet?: string) {
  if (!cookieToSet) {
    return response;
  }

  response.cookies.set({
    name: USER_COOKIE_NAME,
    value: cookieToSet,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });

  return response;
}

