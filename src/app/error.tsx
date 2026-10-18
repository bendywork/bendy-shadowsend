"use client";

import { useEffect } from "react";
import { Home, RotateCcw, TriangleAlert } from "lucide-react";
import { StatusPageContent } from "@/components/system/status-page";
import { useT } from "@/lib/i18n/context";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useT();

  useEffect(() => {
    console.error("[app:error]", error);
  }, [error]);

  return (
    <StatusPageContent
      code="500"
      tone="danger"
      brandLabel={t("status.brand")}
      eyebrow={t("status.error.eyebrow")}
      title={t("status.error.title")}
      description={t("status.error.description")}
      icon={<TriangleAlert className="h-6 w-6" />}
      details={
        error.digest ? (
          <p className="status-page__digest">
            {t("status.error.digest", { digest: error.digest })}
          </p>
        ) : null
      }
      actions={[
        {
          key: "retry",
          label: t("status.retry"),
          onClick: reset,
          variant: "primary",
          icon: <RotateCcw className="h-4 w-4" />,
        },
        {
          key: "home",
          label: t("status.backHome"),
          href: "/",
          variant: "secondary",
          icon: <Home className="h-4 w-4" />,
        },
      ]}
      footnote={t("status.error.footnote")}
    />
  );
}
