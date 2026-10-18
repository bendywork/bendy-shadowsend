import { ApiError } from "@/lib/api";
import { UPLOAD_DAILY_BYTES_PER_USER } from "@/lib/upload/constants";
import { prisma } from "@/lib/prisma";

const DAY_MS = 24 * 60 * 60 * 1000;

export async function assertDailyUploadQuota(
  userId: string,
  additionalBytes: number,
): Promise<{ usedBytes: number; limitBytes: number }> {
  if (!Number.isSafeInteger(additionalBytes) || additionalBytes <= 0) {
    throw new ApiError(400, "上传大小无效", "UPLOAD_SIZE_INVALID");
  }

  const since = new Date(Date.now() - DAY_MS);
  const aggregate = await prisma.messageAttachment.aggregate({
    where: {
      uploaderId: userId,
      createdAt: { gte: since },
    },
    _sum: { sizeBytes: true },
  });

  const usedBytes = Number(aggregate._sum.sizeBytes ?? BigInt(0));

  if (usedBytes + additionalBytes > UPLOAD_DAILY_BYTES_PER_USER) {
    throw new ApiError(
      429,
      `超出每日上传额度（${Math.floor(UPLOAD_DAILY_BYTES_PER_USER / 1024 / 1024 / 1024)}GB）`,
      "UPLOAD_DAILY_QUOTA_EXCEEDED",
    );
  }

  return { usedBytes, limitBytes: UPLOAD_DAILY_BYTES_PER_USER };
}
