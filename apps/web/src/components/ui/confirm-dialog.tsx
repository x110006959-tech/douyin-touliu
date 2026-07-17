"use client";

import { useEffect, useId, type ReactNode } from "react";

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  loadingLabel?: string;
  isLoading?: boolean;
  error?: string;
  children?: ReactNode;
  onCancel: () => void;
  onConfirm: () => void;
};

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  loadingLabel = "处理中...",
  isLoading = false,
  error,
  children,
  onCancel,
  onConfirm
}: ConfirmDialogProps) {
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isLoading) onCancel();
    };
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isLoading, onCancel, open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#0f172a]/55 px-4 py-8"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target && !isLoading) onCancel();
      }}
    >
      <section
        aria-describedby={descriptionId}
        aria-labelledby={titleId}
        aria-modal="true"
        className="w-full max-w-lg rounded-lg border border-[#e2e8f0] bg-white shadow-[0_24px_80px_rgba(15,23,42,0.24)]"
        role="alertdialog"
      >
        <div className="flex items-start justify-between gap-4 border-b border-border px-6 py-5">
          <div>
            <p className="text-xs font-semibold text-danger">危险操作</p>
            <h2 className="mt-1 text-xl font-bold text-foreground" id={titleId}>{title}</h2>
          </div>
          <button
            aria-label="关闭删除确认"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-xl leading-none text-muted transition hover:bg-[#f1f5f9] hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
            disabled={isLoading}
            title="关闭"
            type="button"
            onClick={onCancel}
          >
            ×
          </button>
        </div>

        <div className="px-6 py-5">
          <p className="text-sm leading-6 text-foreground" id={descriptionId}>{description}</p>
          {children}
          {error ? <div className="mt-4 rounded-md border border-danger bg-[#fff7f7] px-3 py-2 text-sm text-danger">{error}</div> : null}
        </div>

        <div className="flex flex-col-reverse gap-3 border-t border-border bg-[#f8fafc] px-6 py-4 sm:flex-row sm:justify-end">
          <button
            autoFocus
            className="h-10 rounded-md border border-border bg-white px-4 text-sm font-medium text-foreground transition hover:bg-[#f1f5f9] disabled:cursor-not-allowed disabled:opacity-50"
            disabled={isLoading}
            type="button"
            onClick={onCancel}
          >
            取消
          </button>
          <button
            className="h-10 rounded-md bg-danger px-4 text-sm font-semibold text-white transition hover:bg-[#b91c1c] disabled:cursor-not-allowed disabled:opacity-50"
            disabled={isLoading}
            type="button"
            onClick={onConfirm}
          >
            {isLoading ? loadingLabel : confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}
