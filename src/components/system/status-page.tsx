import clsx from "clsx";
import Image from "next/image";
import Link from "next/link";
import { Check } from "lucide-react";
import type { ReactNode } from "react";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { LanguageToggle } from "@/components/ui/language-toggle";

export type StatusTone = "neutral" | "danger" | "warning";

export type StatusActionVariant = "primary" | "secondary" | "ghost";

export type StatusAction = {
  key: string;
  label: string;
  href?: string;
  onClick?: () => void;
  variant?: StatusActionVariant;
  icon?: ReactNode;
  disabled?: boolean;
};

export type StatusPageContentProps = {
  code: string;
  eyebrow: string;
  title: string;
  description: string;
  brandLabel: string;
  tone?: StatusTone;
  icon?: ReactNode;
  actions?: StatusAction[];
  details?: ReactNode;
  footnote?: string;
  children?: ReactNode;
  className?: string;
};

export type StatusStepState = "done" | "current" | "upcoming";

export type StatusStep = {
  key: string;
  label: string;
  state: StatusStepState;
};

function StatusActionNode({ action }: { action: StatusAction }) {
  const className = clsx(
    "status-page__action",
    `status-page__action--${action.variant ?? "secondary"}`,
  );
  const content = (
    <>
      {action.icon ? <span className="status-page__action-icon">{action.icon}</span> : null}
      <span>{action.label}</span>
    </>
  );

  if (action.href) {
    return (
      <Link href={action.href} className={className}>
        {content}
      </Link>
    );
  }

  return (
    <button
      type="button"
      className={className}
      onClick={action.onClick}
      disabled={action.disabled}
    >
      {content}
    </button>
  );
}

/**
 * Full-page status surface shared by 404, the route error boundary and the
 * room waiting-approval / load-failure states.
 *
 * The layout is intentionally editorial rather than a generic centred card:
 * a hairline meta row, an oversized ghost code in the background and a single
 * asymmetric panel carry the hierarchy. Every value comes from --ds-* tokens.
 */
export function StatusPageContent({
  code,
  eyebrow,
  title,
  description,
  brandLabel,
  tone = "neutral",
  icon,
  actions,
  details,
  footnote,
  children,
  className,
}: StatusPageContentProps) {
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className={clsx("status-page", className)}
      data-tone={tone}
    >
      <div className="status-page__texture" aria-hidden="true" />
      <span className="status-page__ghost" aria-hidden="true">
        {code}
      </span>

      <div className="status-page__inner">
        <header className="status-page__header">
          <Link href="/" className="status-page__brand" aria-label={brandLabel}>
            <span className="status-page__brand-mark" aria-hidden="true">
              <Image
                src="/1.png"
                alt=""
                width={22}
                height={22}
                className="theme-dark-only status-page__brand-art"
              />
              <Image
                src="/1-light.png"
                alt=""
                width={22}
                height={22}
                className="theme-light-only status-page__brand-art"
              />
            </span>
            <span className="status-page__brand-name">{brandLabel}</span>
          </Link>

          <div className="status-page__controls">
            <ThemeToggle />
            <LanguageToggle />
          </div>
        </header>

        <section className="status-page__panel" aria-labelledby="status-page-title">
          <div className="status-page__meta">
            <span className="status-page__code">{code}</span>
            <span className="status-page__meta-rule" aria-hidden="true" />
            <span className="status-page__eyebrow">{eyebrow}</span>
          </div>

          {icon ? (
            <div className="status-page__signal" aria-hidden="true">
              {icon}
            </div>
          ) : null}

          <h1 id="status-page-title" className="status-page__title">
            {title}
          </h1>
          <p className="status-page__description">{description}</p>

          {children ? <div className="status-page__body">{children}</div> : null}
          {details ? <div className="status-page__details">{details}</div> : null}

          {actions && actions.length > 0 ? (
            <div className="status-page__actions">
              {actions.map((action) => (
                <StatusActionNode key={action.key} action={action} />
              ))}
            </div>
          ) : null}

          {footnote ? <p className="status-page__footnote">{footnote}</p> : null}
        </section>
      </div>
    </main>
  );
}

/** Three-step progress rail used by the waiting-approval page. */
export function StatusSteps({
  steps,
  label,
}: {
  steps: StatusStep[];
  label: string;
}) {
  return (
    <ol className="status-steps" aria-label={label}>
      {steps.map((step, index) => (
        <li key={step.key} className="status-steps__item" data-state={step.state}>
          <span className="status-steps__marker" aria-hidden="true">
            {step.state === "done" ? (
              <Check className="h-3.5 w-3.5" />
            ) : (
              <span className="status-steps__dot" />
            )}
          </span>
          <span className="status-steps__label">{step.label}</span>
          {index < steps.length - 1 ? (
            <span className="status-steps__line" aria-hidden="true" />
          ) : null}
        </li>
      ))}
    </ol>
  );
}
