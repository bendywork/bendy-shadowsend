/**
 * Next.js 启动钩子：进程启动时预热配置中心，并开启 TTL 后台刷新。
 *
 * 只在 Node.js runtime 执行（Edge runtime 不支持长驻定时器，也无需预热）。
 * 配置中心不可用时 initializeConfigCenter 内部会降级并记录警告，不会阻塞启动。
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  try {
    const { initializeConfigCenter, startConfigAutoRefresh } = await import(
      "@/lib/config-center"
    );
    await initializeConfigCenter();
    startConfigAutoRefresh();
  } catch (error) {
    console.warn("[config-center] initialization failed; falling back to VercelEnv", {
      reason: error instanceof Error ? error.message : String(error),
    });
  }
}
