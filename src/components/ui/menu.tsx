"use client";

import clsx from "clsx";
import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Check } from "lucide-react";

type MenuProps = {
  label: string;
  trigger: ReactNode;
  children: ReactNode;
  align?: "start" | "end";
  className?: string;
};

const MenuCloseContext = createContext<() => void>(() => {});

// 轻量操作菜单：点击触发、点击外部 / Esc 关闭，键盘聚焦首个菜单项。
// 面板与菜单项复用设计系统的 .menu-panel / .menu-item。
export function Menu({ label, trigger, children, align = "end", className }: MenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const firstItem = panelRef.current?.querySelector<HTMLElement>(
      '[role="menuitem"]:not(:disabled)',
    );
    firstItem?.focus();
  }, [open]);

  return (
    <div ref={rootRef} className="relative inline-flex">
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((prev) => !prev)}
        className={clsx("icon-btn", open && "icon-btn--active")}
      >
        {trigger}
      </button>
      {open ? (
        <div
          ref={panelRef}
          id={menuId}
          role="menu"
          aria-label={label}
          className={clsx(
            "menu-panel absolute top-[calc(100%+6px)] z-50 min-w-56",
            align === "end" ? "right-0" : "left-0",
            className,
          )}
        >
          <MenuCloseContext.Provider value={() => setOpen(false)}>
            {children}
          </MenuCloseContext.Provider>
        </div>
      ) : null}
    </div>
  );
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return (
    <p className="px-2 pb-1 pt-2 text-[10px] font-medium uppercase tracking-[0.16em] text-ink-faint">
      {children}
    </p>
  );
}

export function MenuSeparator() {
  return <div role="separator" className="my-1 h-px bg-line-subtle" />;
}

export function MenuItem({
  icon,
  children,
  onSelect,
  disabled,
  danger,
  checked,
}: {
  icon?: ReactNode;
  children: ReactNode;
  onSelect?: () => void;
  disabled?: boolean;
  danger?: boolean;
  checked?: boolean;
}) {
  const close = useContext(MenuCloseContext);

  return (
    <button
      type="button"
      role={checked === undefined ? "menuitem" : "menuitemcheckbox"}
      aria-checked={checked === undefined ? undefined : checked}
      disabled={disabled}
      onClick={() => {
        close();
        onSelect?.();
      }}
      className={clsx(
        "menu-item gap-2",
        danger && "menu-item--danger",
        checked && "text-ink",
      )}
    >
      {icon ? (
        <span className="shrink-0 text-ink-muted" aria-hidden>
          {icon}
        </span>
      ) : null}
      <span className="min-w-0 flex-1 truncate text-left">{children}</span>
      {checked ? <Check className="h-3.5 w-3.5 shrink-0" aria-hidden /> : null}
    </button>
  );
}
