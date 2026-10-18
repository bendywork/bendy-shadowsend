import { ApiError } from "@/lib/api";

/**
 * REQ-202610-0516 / up-07 / dc-05 = A
 *
 * 旧存储（S3 / DUFS / OSS Preview）配置只服务于存量附件读取。
 * 新上传必须全部走 file.sang.pub（图片）或 pic.sl.al（非图片），
 * 即使旧环境变量仍然存在也不得参与任何写入路径。
 */
export const LEGACY_STORAGE_UPLOAD_ENABLED = false;
export const LEGACY_STORAGE_READ_ENABLED = true;

export const LEGACY_STORAGE_UPLOAD_DISABLED_CODE =
  "LEGACY_STORAGE_UPLOAD_DISABLED";

export const LEGACY_STORAGE_UPLOAD_DISABLED_MESSAGE =
  "旧存储上传通道已停用，请使用 file.sang.pub（图片）或 pic.sl.al（非图片）上传";

export function isLegacyStorageUploadEnabled(): boolean {
  return LEGACY_STORAGE_UPLOAD_ENABLED;
}

export function isLegacyStorageReadEnabled(): boolean {
  return LEGACY_STORAGE_READ_ENABLED;
}

export function createLegacyStorageUploadDisabledError(): ApiError {
  return new ApiError(
    410,
    LEGACY_STORAGE_UPLOAD_DISABLED_MESSAGE,
    LEGACY_STORAGE_UPLOAD_DISABLED_CODE,
  );
}

/**
 * 旧存储写入入口的统一守卫：只要策略仍为旁路（默认且唯一状态），
 * 直接抛出 410，调用方不得再触碰 S3/DUFS/OSS 写配置。
 */
export function throwLegacyStorageUploadDisabled(): never {
  if (isLegacyStorageUploadEnabled()) {
    throw new Error("legacy storage upload policy is inconsistent");
  }

  throw createLegacyStorageUploadDisabledError();
}
