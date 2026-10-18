import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");

describe("typography scale", () => {
  it("defines the full type token set", () => {
    for (const token of [
      "--type-display-size",
      "--type-title-size",
      "--type-heading-size",
      "--type-subheading-size",
      "--type-body-size",
      "--type-body-sm-size",
      "--type-caption-size",
      "--type-micro-size",
      "--type-weight-regular",
      "--type-weight-medium",
      "--type-weight-semibold",
      "--type-tracking-overline",
    ]) {
      expect(css).toContain(token);
    }
  });

  it("ships semantic classes and tabular numerals", () => {
    for (const className of [
      ".type-display",
      ".type-title",
      ".type-heading",
      ".type-subheading",
      ".type-body",
      ".type-body-sm",
      ".type-caption",
      ".type-micro",
      ".type-overline",
      ".type-numeric",
    ]) {
      expect(css).toContain(className);
    }

    expect(css).toContain("font-variant-numeric: tabular-nums");
  });
});
