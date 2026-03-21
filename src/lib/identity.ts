import { type NextRequest, NextResponse } from "next/server";
import type { User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { USER_COOKIE_NAME } from "@/lib/constants";

const colorPool = [
  "#1d4ed8",
  "#2563eb",
  "#0f766e",
  "#1d4ed8",
  "#0369a1",
  "#b45309",
  "#be185d",
  "#4338ca",
  "#166534",
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
  const cookieUserId = request.cookies.get(USER_COOKIE_NAME)?.value;

  if (cookieUserId) {
    const existing = await prisma.user.findUnique({ where: { id: cookieUserId } });
    if (existing) {
      return { user: existing };
    }
  }

  const nickname = buildRandomNickname();
  const user = await prisma.user.create({
    data: {
      nickname,
      avatarInitial: resolveInitial(nickname),
      avatarColor: randomItem(colorPool),
    },
  });

  return { user, cookieToSet: user.id };
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

