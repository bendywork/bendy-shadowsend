import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { messages, type MessageKey } from "./messages";

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));

const UI_FILES = [
  "src/app/page.tsx",
  "src/app/room/[roomCode]/page.tsx",
  "src/components/ui/popover.tsx",
];

function read(relativePath: string): string {
  return readFileSync(`${ROOT}${relativePath}`, "utf8");
}

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((line) => line.replace(/\/\/.*$/, ""))
    .join("\n");
}

function interpolationParams(value: string): string[] {
  return Array.from(value.matchAll(/\{(\w+)\}/g), (match) => match[1]).sort();
}

describe("i18n messages", () => {
  it("keeps zh and en keys in parity", () => {
    expect(Object.keys(messages.en).sort()).toEqual(Object.keys(messages.zh).sort());
  });

  it("has no empty copy", () => {
    for (const lang of ["zh", "en"] as const) {
      for (const [key, value] of Object.entries(messages[lang])) {
        expect(value.trim(), `${lang}.${key}`).not.toBe("");
      }
    }
  });

  it("uses the same interpolation params in both languages", () => {
    for (const key of Object.keys(messages.zh) as MessageKey[]) {
      expect(interpolationParams(messages.en[key]), key).toEqual(
        interpolationParams(messages.zh[key]),
      );
    }
  });
});

describe("UI copy wiring", () => {
  it("references only existing message keys", () => {
    const pattern = /\bt\("([^"]+)"/g;

    for (const file of UI_FILES) {
      const source = read(file);
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(source)) !== null) {
        expect(
          Object.prototype.hasOwnProperty.call(messages.zh, match[1]),
          `${file}: ${match[1]}`,
        ).toBe(true);
      }
    }
  });

  it("contains no hardcoded Chinese UI copy", () => {
    for (const file of UI_FILES) {
      expect(/\p{Script=Han}/u.test(stripComments(read(file))), file).toBe(false);
    }
  });
});
