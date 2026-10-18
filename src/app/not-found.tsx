"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft, Home, SearchX } from "lucide-react";
import { StatusPageContent } from "@/components/system/status-page";
import { useT } from "@/lib/i18n/context";

export default function NotFoundPage() {
  const t = useT();
  const router = useRouter();

  function goBack() {
    if (window.history.length > 1) {
      router.back();
      return;
    }
    router.push("/");
  }

  return (
    <StatusPageContent
      code="404"
      brandLabel={t("status.brand")}
      eyebrow={t("status.notFound.eyebrow")}
      title={t("status.notFound.title")}
      description={t("status.notFound.description")}
      icon={<SearchX className="h-6 w-6" />}
      actions={[
        {
          key: "home",
          label: t("status.backHome"),
          href: "/",
          variant: "primary",
          icon: <Home className="h-4 w-4" />,
        },
        {
          key: "back",
          label: t("status.back"),
          onClick: goBack,
          variant: "secondary",
          icon: <ArrowLeft className="h-4 w-4" />,
        },
      ]}
      footnote={t("status.notFound.footnote")}
    />
  );
}
