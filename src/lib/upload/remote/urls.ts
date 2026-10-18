import type { UploadServiceId } from "@/lib/upload/types";

const SANG_HOST_SUFFIXES = ["meitudata.com", "icve.com.cn", "sang.pub"];
const PIC_SL_HOST_SUFFIXES = ["pic.sl.al"];

function matchesHost(host: string, suffixes: string[]): boolean {
  return suffixes.some(
    (suffix) => host === suffix || host.endsWith(`.${suffix}`),
  );
}

export function isAllowedRemoteUrl(
  service: UploadServiceId,
  value: string,
): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }

  if (url.protocol !== "https:") {
    return false;
  }

  const host = url.hostname.toLowerCase();
  return matchesHost(
    host,
    service === "sang" ? SANG_HOST_SUFFIXES : PIC_SL_HOST_SUFFIXES,
  );
}
