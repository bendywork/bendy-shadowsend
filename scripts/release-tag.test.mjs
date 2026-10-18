import assert from "node:assert/strict";
import test from "node:test";

import {
  buildTagName,
  nextFixNumber,
  parseArgs,
} from "./release-tag.mjs";

test("正常版本 tag 以 -ver 结尾", () => {
  assert.equal(buildTagName("0.1.1640"), "0.1.1640-ver");
});

test("修复版本 tag 使用 -fix-<次数>-ver", () => {
  assert.equal(
    buildTagName("0.1.164", { fix: 210 }),
    "0.1.164-fix-210-ver",
  );
});

test("版本号必须是 x.y.z", () => {
  assert.throws(() => buildTagName("0.1"), /版本号格式错误/);
  assert.throws(() => buildTagName("v0.1.2"), /版本号格式错误/);
});

test("fix 次数必须是正整数", () => {
  assert.throws(() => buildTagName("0.1.164", { fix: 0 }), /正整数/);
  assert.throws(() => buildTagName("0.1.164", { fix: 1.5 }), /正整数/);
});

test("自动修复次数取同版本已有最大值 + 1", () => {
  const tags = [
    "0.1.164-fix-2-ver",
    "0.1.164-fix-9-ver",
    "0.1.165-fix-100-ver",
    "0.1.164-ver",
  ];
  assert.equal(nextFixNumber(tags, "0.1.164"), 10);
  assert.equal(nextFixNumber([], "0.1.164"), 1);
});

test("解析 --fix 显式次数", () => {
  const options = parseArgs(["--fix", "210", "--dry-run"]);
  assert.equal(options.fixSpecified, true);
  assert.equal(options.fix, 210);
  assert.equal(options.dryRun, true);
});

test("解析 --fix 不带次数时自动取序号", () => {
  const options = parseArgs(["--fix"]);
  assert.equal(options.fixSpecified, true);
  assert.equal(options.fix, undefined);
});

test("解析发布分支与远端", () => {
  const options = parseArgs(["--branch=master", "--remote", "origin"]);
  assert.equal(options.branch, "master");
  assert.equal(options.remote, "origin");
});

test("未知参数报错", () => {
  assert.throws(() => parseArgs(["--nope"]), /未知参数/);
});
