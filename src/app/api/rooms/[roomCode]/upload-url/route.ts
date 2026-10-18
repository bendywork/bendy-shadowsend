import { jsonError } from "@/lib/api";
import { throwLegacyStorageUploadDisabled } from "@/lib/storage-policy";

/**
 * REQ-202610-0516（up-07）：S3 预签名直传属于旧存储写路径，已整体停用。
 * 即使 S3_* 环境变量仍然存在，也不再签发上传 URL；存量附件仍可读取。
 */
export async function POST() {
  try {
    throwLegacyStorageUploadDisabled();
  } catch (error) {
    return jsonError(error);
  }
}
