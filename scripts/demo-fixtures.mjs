/**
 * 视觉基线与移动端验收共用的固定演示数据。
 *
 * 所有数据均为虚构，不包含真实用户信息；通过 Playwright 的 route 拦截返回，
 * 保证截图与性能测量在同一份数据下可复现。
 */

export const DEMO_OWNER = Object.freeze({
  id: "user-demo-owner",
  nickname: "演示房主",
  avatarInitial: "演",
  avatarColor: "#52525b",
});

export const DEMO_MEMBER = Object.freeze({
  id: "user-demo-member",
  nickname: "视觉验收员",
  avatarInitial: "视",
  avatarColor: "#71717a",
});

export const DEMO_PENDING = Object.freeze({
  id: "user-demo-pending",
  nickname: "等待审批的用户",
  avatarInitial: "等",
  avatarColor: "#a1a1aa",
});

export const DEMO_APP = Object.freeze({
  name: "临时笨迪",
  version: "0.1.69",
  openSource: "MIT",
});

export const DEMO_BOOTSTRAP = Object.freeze({
  app: DEMO_APP,
  me: DEMO_OWNER,
  tree: {
    createdRooms: [
      {
        id: "room-demo",
        roomCode: "DEMO01",
        name: "视觉验收演示房间",
        ownerId: DEMO_OWNER.id,
        hasGateCode: true,
        gateCodeExpiresAt: "2026-10-18T12:00:00.000Z",
        createdAt: "2026-10-18T01:00:00.000Z",
        role: "OWNER",
      },
    ],
    joinedRooms: [],
  },
  stats: { totalOnline: 12 },
});

const BASE_MESSAGES = Object.freeze([
  Object.freeze({
    id: "message-text",
    roomId: "room-demo",
    type: "TEXT",
    content: "这是第一条演示消息，用于检查气泡、时间戳与发送者信息。",
    createdAt: "2026-10-18T02:01:00.000Z",
    sender: DEMO_MEMBER,
    attachments: [],
  }),
  Object.freeze({
    id: "message-file",
    roomId: "room-demo",
    type: "FILE",
    content: "",
    createdAt: "2026-10-18T02:02:00.000Z",
    sender: DEMO_MEMBER,
    attachments: [
      {
        id: "attachment-file",
        fileName: "视觉验收清单.pdf",
        mimeType: "application/pdf",
        sizeBytes: 348160,
        storage: "S3",
        previewType: "NONE",
        previewUrl: null,
        createdAt: "2026-10-18T02:02:00.000Z",
      },
    ],
  }),
  Object.freeze({
    id: "message-mixed",
    roomId: "room-demo",
    type: "MIXED",
    content: "附上一张示意图，检查图片附件与混合消息布局。",
    createdAt: "2026-10-18T02:03:00.000Z",
    sender: DEMO_OWNER,
    attachments: [
      {
        id: "attachment-image",
        fileName: "design-token.png",
        mimeType: "image/png",
        sizeBytes: 102400,
        storage: "S3",
        previewType: "IMAGE",
        previewUrl: "/1.png",
        createdAt: "2026-10-18T02:03:00.000Z",
      },
    ],
  }),
]);

export function buildDemoMessages(count = 3) {
  if (!Number.isInteger(count) || count < 1) {
    throw new Error("演示消息数量必须是正整数");
  }
  if (count <= BASE_MESSAGES.length) return BASE_MESSAGES.slice(0, count).map(cloneMessage);

  const messages = BASE_MESSAGES.map(cloneMessage);
  const start = Date.parse("2026-10-18T02:04:00.000Z");
  for (let index = BASE_MESSAGES.length; index < count; index += 1) {
    const sender = index % 3 === 0 ? DEMO_OWNER : DEMO_MEMBER;
    messages.push({
      id: `message-generated-${index}`,
      roomId: "room-demo",
      type: "TEXT",
      content: `性能滚动演示消息 #${index + 1}：检查长列表滚动、消息气泡与时间戳的渲染稳定性。`,
      createdAt: new Date(start + index * 30_000).toISOString(),
      sender,
      attachments: [],
    });
  }
  return messages;
}

function cloneMessage(message) {
  return {
    ...message,
    sender: { ...message.sender },
    attachments: message.attachments.map((attachment) => ({ ...attachment })),
  };
}

export function buildDemoRoom(options = {}) {
  const messageCount = options.messageCount ?? 3;
  return {
    app: DEMO_APP,
    room: {
      id: "room-demo",
      roomCode: "DEMO01",
      name: "视觉验收演示房间",
      ownerId: DEMO_OWNER.id,
      owner: DEMO_OWNER,
      hasGateCode: true,
      gateCodeExpiresAt: "2026-10-18T12:00:00.000Z",
      gateCode: "123456",
      neverExpire: false,
      allowJoinRequest: true,
    },
    announcement: {
      text: "欢迎来到视觉验收演示房间。请按 docs/mobile-acceptance.md 与 docs/visual-acceptance-checklist.md 逐项检查。",
      imageUrl: "/1.png",
      imageName: "announcement.png",
      images: [{ imageUrl: "/1.png", imageName: "announcement.png" }],
      updatedAt: "2026-10-18T02:00:00.000Z",
      showToMe: false,
    },
    me: { ...DEMO_OWNER, role: "OWNER" },
    members: [
      {
        id: "member-owner",
        userId: DEMO_OWNER.id,
        role: "OWNER",
        status: "ACTIVE",
        joinedAt: "2026-10-18T01:00:00.000Z",
        lastSeenAt: "2026-10-18T02:10:00.000Z",
        user: DEMO_OWNER,
      },
      {
        id: "member-member",
        userId: DEMO_MEMBER.id,
        role: "MEMBER",
        status: "ACTIVE",
        joinedAt: "2026-10-18T01:05:00.000Z",
        lastSeenAt: "2026-10-18T02:09:00.000Z",
        user: DEMO_MEMBER,
      },
    ],
    pendingRequests: [
      {
        id: "request-pending",
        userId: DEMO_PENDING.id,
        status: "PENDING",
        reason: "想加入查看视觉验收演示。",
        createdAt: "2026-10-18T02:05:00.000Z",
        user: DEMO_PENDING,
      },
    ],
    messages: buildDemoMessages(messageCount),
    stats: { roomOnline: 2, totalOnline: 12 },
    // 故意保留彩色 color 字段：验证广告位忽略服务端颜色，仍显示黑白灰。
    adBoard: {
      items: [
        { content: "视觉验收基线 · 双主题 × 三断点", color: "#0a84ff", url: "https://example.com" },
        { content: "黑白灰纪律 · 语义状态色除外", color: "#0071e3", url: "" },
      ],
      maxContentChars: 120,
    },
  };
}

function jsonResponse(route, data, status = 200) {
  return route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify({ ok: true, data }),
  });
}

function errorResponse(route, status, code, message) {
  return route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify({ ok: false, error: { code, message } }),
  });
}

/**
 * 安装固定 API 拦截。默认消息数 3；性能测量可传 200 条以覆盖长列表滚动。
 */
export async function installMockApi(context, options = {}) {
  const room = buildDemoRoom({ messageCount: options.messageCount ?? 3 });
  let nextMessageId = 1;

  await context.route("**/api/**", async (route) => {
    const request = route.request();
    const method = request.method();
    const url = new URL(request.url());
    const pathname = url.pathname;

    if (pathname === "/api/me") {
      await jsonResponse(route, { user: DEMO_OWNER });
      return;
    }
    if (pathname === "/api/bootstrap") {
      await jsonResponse(route, DEMO_BOOTSTRAP);
      return;
    }
    if (pathname === "/api/presence") {
      await jsonResponse(route, { success: true });
      return;
    }
    if (pathname === "/api/rooms" && method === "POST") {
      await jsonResponse(route, {
        room: { id: "room-demo", roomCode: "DEMO01", name: "移动端验收演示房间" },
      });
      return;
    }
    if (/^\/api\/rooms\/[^/]+\/join$/.test(pathname) && method === "POST") {
      await jsonResponse(route, { joined: true, roomCode: "DEMO01" });
      return;
    }
    if (/^\/api\/rooms\/[^/]+\/messages$/.test(pathname)) {
      if (method === "POST") {
        let content = "";
        try {
          const body = request.postDataJSON();
          content = typeof body?.content === "string" ? body.content : "";
        } catch {
          content = "";
        }
        const message = {
          id: `message-sent-${nextMessageId}`,
          roomId: "room-demo",
          type: "TEXT",
          content,
          createdAt: new Date().toISOString(),
          sender: DEMO_OWNER,
          attachments: [],
        };
        nextMessageId += 1;
        await jsonResponse(route, { message });
        return;
      }
      await jsonResponse(route, { messages: room.messages });
      return;
    }
    if (/^\/api\/rooms\/[^/]+\/upload-url$/.test(pathname)) {
      // 让前端走代理上传回退路径，避免测试依赖真实 S3 预签名。
      await errorResponse(route, 500, "MOCK_DIRECT_UPLOAD_DISABLED", "演示环境禁用直传");
      return;
    }
    if (/^\/api\/rooms\/[^/]+\/upload$/.test(pathname) && method === "POST") {
      await jsonResponse(route, {
        s3Key: "https://example.invalid/mobile-smoke-upload.png",
        fileName: "mobile-smoke.png",
        mimeType: "image/png",
        sizeBytes: 68,
        storage: "S3",
        previewUrl: null,
      });
      return;
    }
    if (/^\/api\/rooms\/[^/]+\/upload\/chunk$/.test(pathname)) {
      await jsonResponse(route, {
        s3Key: "https://example.invalid/mobile-smoke-chunk.png",
        fileName: "mobile-smoke.png",
        mimeType: "image/png",
        sizeBytes: 68,
        storage: "S3",
        previewUrl: null,
        dufsPath: "/demo/chunk",
      });
      return;
    }
    if (/^\/api\/rooms\/[^/]+$/.test(pathname)) {
      await jsonResponse(route, room);
      return;
    }
    await jsonResponse(route, { success: true });
  });
}
