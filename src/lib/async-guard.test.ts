import { describe, expect, it } from "vitest";
import { createAsyncGuard } from "@/lib/async-guard";

describe("createAsyncGuard", () => {
  it("locks a key once until it is released", () => {
    const guard = createAsyncGuard();

    expect(guard.tryLock("save")).toBe(true);
    expect(guard.tryLock("save")).toBe(false);
    expect(guard.isLocked("save")).toBe(true);

    guard.unlock("save");

    expect(guard.isLocked("save")).toBe(false);
    expect(guard.tryLock("save")).toBe(true);
  });

  it("keeps different action keys independent", () => {
    const guard = createAsyncGuard();

    expect(guard.tryLock("room-name")).toBe(true);
    expect(guard.tryLock("gate-code")).toBe(true);
    expect(guard.isLocked("room-name")).toBe(true);
    expect(guard.isLocked("gate-code")).toBe(true);

    guard.unlock("room-name");

    expect(guard.isLocked("room-name")).toBe(false);
    expect(guard.isLocked("gate-code")).toBe(true);
  });

  it("rejects blank keys so a missing action name cannot lock everything", () => {
    const guard = createAsyncGuard();

    expect(guard.tryLock("")).toBe(false);
    expect(guard.tryLock("   ")).toBe(false);
    expect(guard.isLocked("")).toBe(false);
  });

  it("normalizes surrounding whitespace when locking and unlocking", () => {
    const guard = createAsyncGuard();

    expect(guard.tryLock(" save ")).toBe(true);
    expect(guard.isLocked("save")).toBe(true);
    guard.unlock("save");
    expect(guard.tryLock("save")).toBe(true);
  });
});
