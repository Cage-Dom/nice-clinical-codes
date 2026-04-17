"use client";

import { useEffect, useRef, useCallback } from "react";

interface ConfirmModalProps {
  open: boolean;
  title: string;
  children: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  loadingLabel?: string;
  confirmDisabled?: boolean;
  loading?: boolean;
  variant?: "primary" | "danger";
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Accessible confirm modal used across the app for irreversible actions
 * (save-as-draft, approve codelist, reject codelist).
 *
 * Features: focus trap, Escape to close, backdrop click to close,
 * role="dialog", aria-modal, aria-labelledby, focus restoration on close.
 */
export function ConfirmModal({
  open,
  title,
  children,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  loadingLabel = "Processing…",
  confirmDisabled = false,
  loading = false,
  variant = "primary",
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<Element | null>(null);

  // Store callbacks in refs so the effect doesn't re-run on every parent render
  const onCancelRef = useRef(onCancel);
  onCancelRef.current = onCancel;

  // Focus management + Escape + scroll lock — depends only on `open`
  useEffect(() => {
    if (!open) return;

    // Capture the element that opened us so we can restore focus on close
    returnFocusRef.current = document.activeElement;

    // Focus the first focusable element inside the dialog
    requestAnimationFrame(() => {
      const el = dialogRef.current;
      if (!el) return;
      const first = el.querySelector<HTMLElement>(
        "input:not([disabled]), textarea:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex='-1'])"
      );
      first?.focus();
    });

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onCancelRef.current();
        return;
      }
      // Focus trap
      if (e.key === "Tab" && dialogRef.current) {
        const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
          "input:not([disabled]), textarea:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex='-1'])"
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = prev;
      // Restore focus to the element that triggered the modal
      if (returnFocusRef.current && returnFocusRef.current instanceof HTMLElement) {
        returnFocusRef.current.focus();
      }
    };
  }, [open]);

  const handleBackdropClick = useCallback(() => {
    onCancelRef.current();
  }, []);

  if (!open) return null;

  const confirmClass =
    variant === "danger"
      ? "bg-red-600 hover:bg-red-700 text-white"
      : "bg-[#00436C] hover:bg-[#005EA5] text-white";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={handleBackdropClick}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        className="bg-white rounded shadow-lg w-full max-w-md mx-4 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="modal-title" className="text-lg font-semibold text-[#00436C] mb-2">
          {title}
        </h3>
        <div className="text-sm text-gray-700 mb-4">{children}</div>
        <div className="flex justify-end gap-2">
          <button
            onClick={() => onCancelRef.current()}
            disabled={loading}
            className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            disabled={confirmDisabled || loading}
            className={`px-4 py-2 text-sm font-medium rounded disabled:opacity-50 disabled:cursor-not-allowed ${confirmClass}`}
          >
            {loading ? loadingLabel : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
