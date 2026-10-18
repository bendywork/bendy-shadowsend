/**
 * 文案规范的可执行规则。
 *
 * 规范文档见 docs/design-system-copywriting.md；本模块把「语气 / 长度 / 格式 /
 * 错误可执行性 / i18n 占位符对齐」落成可测试的审计函数，供 Vitest 在每次改动
 * 文案表时兜底。组件侧只需继续通过 t() 引用 messages，不直接依赖本模块。
 */

export type CopyCatalog = {
  zh: Readonly<Record<string, string>>;
  en: Readonly<Record<string, string>>;
};

export type CopyAuditRule =
  | "missing-translation"
  | "placeholder-mismatch"
  | "emoji"
  | "outer-whitespace"
  | "double-space"
  | "zh-ascii-punctuation"
  | "en-fullwidth-punctuation"
  | "ellipsis"
  | "toast-terminal-punctuation"
  | "placeholder-terminal-punctuation"
  | "hint-terminal-punctuation"
  | "empty-terminal-punctuation"
  | "error-guidance"
  | "length-budget";

export type CopyAuditIssue = {
  key: string;
  rule: CopyAuditRule;
  detail: string;
};

const EMOJI_PATTERN =
  /[\u{1F1E6}-\u{1F1FF}\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/u;

const BILINGUAL_KEYS = new Set(["lang.name.zh", "lang.name.en"]);

/** 错误文案必须给出下一步：重试、检查权限或具体原因。 */
const ERROR_GUIDANCE_KEYS = new Set([
  "toast.copyFailed",
  "toast.downloadFailed",
  "toast.networkError",
  "toast.initFailed",
  "toast.loadFailed",
  "toast.messageRefreshFailed",
  "toast.roomSyncFailed",
  "toast.createRoomFailed",
  "toast.joinRoomFailed",
  "toast.sendFailed",
  "toast.uploadFailed",
  "toast.uploadTooLarge",
  "toast.memberRemoveFailed",
  "toast.transferFailed",
  "toast.approvalFailed",
  "toast.leaveRoomFailed",
  "toast.noticeSaveFailed",
  "toast.noticeSeenFailed",
  "toast.dissolveFailed",
  "toast.roomNameUpdateFailed",
  "toast.gateCodeUpdateFailed",
  "toast.joinPolicyUpdateFailed",
  "toast.neverExpireUpdateFailed",
  "toast.clipboardReadFailed",
  "toast.noticeEmpty",
]);

export function containsEmoji(text: string): boolean {
  return EMOJI_PATTERN.test(text);
}

export function extractPlaceholders(text: string): string[] {
  const matches = text.match(/\{[a-zA-Z0-9_]+\}/g) ?? [];
  return [...new Set(matches.map((match) => match.slice(1, -1)))];
}

function isTerminalPunctuation(text: string, pattern: RegExp): boolean {
  return pattern.test(text);
}

function pushIssue(
  issues: CopyAuditIssue[],
  key: string,
  rule: CopyAuditRule,
  detail: string,
): void {
  issues.push({ key, rule, detail });
}

function checkLength(
  issues: CopyAuditIssue[],
  key: string,
  zh: string,
  en: string,
): void {
  let budget: { zh: number; en: number } | null = null;

  if (key.startsWith("toast.")) {
    budget = { zh: 32, en: 80 };
  } else if (key.startsWith("form.")) {
    budget = { zh: 28, en: 70 };
  } else if (key.endsWith(".hint")) {
    budget = { zh: 40, en: 90 };
  } else if (key.endsWith(".placeholder")) {
    budget = { zh: 40, en: 90 };
  } else if (key === "chat.empty") {
    budget = { zh: 30, en: 70 };
  } else if (
    !BILINGUAL_KEYS.has(key) &&
    !zh.includes("{") &&
    !en.includes("{") &&
    !key.endsWith(".current")
  ) {
    budget = { zh: 8, en: 28 };
  }

  if (!budget) return;

  if (zh.length > budget.zh) {
    pushIssue(
      issues,
      key,
      "length-budget",
      `zh ${zh.length} > ${budget.zh}`,
    );
  }
  if (en.length > budget.en) {
    pushIssue(
      issues,
      key,
      "length-budget",
      `en ${en.length} > ${budget.en}`,
    );
  }
}

export function auditCopyCatalog(catalog: CopyCatalog): CopyAuditIssue[] {
  const issues: CopyAuditIssue[] = [];

  for (const key of Object.keys(catalog.zh)) {
    const zh = catalog.zh[key];
    const en = catalog.en[key];

    if (en === undefined) {
      pushIssue(issues, key, "missing-translation", "missing en copy");
      continue;
    }

    const zhPlaceholders = extractPlaceholders(zh);
    const enPlaceholders = extractPlaceholders(en);
    if (zhPlaceholders.join("|") !== enPlaceholders.join("|")) {
      pushIssue(
        issues,
        key,
        "placeholder-mismatch",
        `zh [${zhPlaceholders.join(", ")}] / en [${enPlaceholders.join(", ")}]`,
      );
    }

    if (containsEmoji(zh) || containsEmoji(en)) {
      pushIssue(issues, key, "emoji", "emoji is not part of the copy system");
    }

    if (zh !== zh.trim() || en !== en.trim()) {
      pushIssue(issues, key, "outer-whitespace", "leading or trailing whitespace");
    }

    if (/\s{2,}/.test(zh) || /\s{2,}/.test(en)) {
      pushIssue(issues, key, "double-space", "consecutive spaces");
    }

    if (!BILINGUAL_KEYS.has(key)) {
      if (/[,.?!:;]/.test(zh)) {
        pushIssue(
          issues,
          key,
          "zh-ascii-punctuation",
          "use full-width Chinese punctuation",
        );
      }
      if (/[，。？！：；「」]/.test(en)) {
        pushIssue(
          issues,
          key,
          "en-fullwidth-punctuation",
          "use half-width English punctuation",
        );
      }
      if (zh.includes("...")) {
        pushIssue(issues, key, "ellipsis", "use the … character");
      }
    }

    if (
      key.startsWith("toast.") &&
      (isTerminalPunctuation(zh, /[。？！]$/) ||
        isTerminalPunctuation(en, /[.?!]$/))
    ) {
      pushIssue(
        issues,
        key,
        "toast-terminal-punctuation",
        "toast copy should not end with a period",
      );
    }

    if (
      key.endsWith(".placeholder") &&
      (isTerminalPunctuation(zh, /[。？！]$/) ||
        isTerminalPunctuation(en, /[.?!]$/))
    ) {
      pushIssue(
        issues,
        key,
        "placeholder-terminal-punctuation",
        "placeholder copy should not end with a period",
      );
    }

    if (
      key.endsWith(".hint") &&
      (isTerminalPunctuation(zh, /[。？！]$/) ||
        isTerminalPunctuation(en, /[.?!]$/))
    ) {
      pushIssue(
        issues,
        key,
        "hint-terminal-punctuation",
        "hint copy should not end with a period",
      );
    }

    if (key === "chat.empty") {
      if (!zh.endsWith("。") || !en.endsWith(".")) {
        pushIssue(
          issues,
          key,
          "empty-terminal-punctuation",
          "empty-state sentence should end with a period",
        );
      }
    } else if (
      (key === "nav.empty" || key === "approvals.empty") &&
      (isTerminalPunctuation(zh, /[。？！]$/) ||
        isTerminalPunctuation(en, /[.?!]$/))
    ) {
      pushIssue(
        issues,
        key,
        "empty-terminal-punctuation",
        "short empty label should not end with a period",
      );
    }

    if (ERROR_GUIDANCE_KEYS.has(key)) {
      if (!/(请|：)/.test(zh) || !/(please|check|try|:)/i.test(en)) {
        pushIssue(
          issues,
          key,
          "error-guidance",
          "error copy needs an actionable next step",
        );
      }
    }

    checkLength(issues, key, zh, en);
  }

  return issues;
}
