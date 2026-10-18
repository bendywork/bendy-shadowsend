import { jsonError } from "@/lib/api";
import { throwLegacyStorageUploadDisabled } from "@/lib/storage-policy";

/**
 * REQ-202610-0516（up-07）：DUFS 分片写入属于旧存储写路径，已整体停用。
 * 分片能力将在 up-04 基于新通道重新接入；存量 DUFS 附件读取不受影响。
 */
export async function POST() {
  try {
    throwLegacyStorageUploadDisabled();
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE() {
  try {
    throwLegacyStorageUploadDisabled();
  } catch (error) {
    return jsonError(error);
  }
}
