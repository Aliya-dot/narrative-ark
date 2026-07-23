"use client";
import { AlertTriangle, LoaderCircle } from "lucide-react";
export function LoadingState({
  text = "正在读取本地档案…",
}: {
  text?: string;
}) {
  return (
    <div className="panel grid min-h-40 place-items-center p-8 muted">
      <LoaderCircle className="animate-spin" />
      <p>{text}</p>
    </div>
  );
}
export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="panel py-14 text-center">
      <p className="display text-xl">{title}</p>
      <p className="muted mt-2 text-sm">{description}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
export function ErrorState({
  message,
  retry,
}: {
  message: string;
  retry?: () => void;
}) {
  return (
    <div className="panel border-[#713f3d] p-5 text-[#edaaa5]">
      <AlertTriangle />
      <p className="mt-2">{message}</p>
      {retry && (
        <button className="btn mt-4" onClick={retry}>
          重试
        </button>
      )}
    </div>
  );
}
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "确认",
  onCancel,
  onConfirm,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[80] grid place-items-center bg-black/70 p-5"
      role="dialog"
      aria-modal
    >
      <div className="panel w-full max-w-md p-6">
        <h2 className="display text-xl">{title}</h2>
        <p className="muted mt-3 text-sm leading-6">{description}</p>
        <div className="mt-6 flex justify-end gap-2">
          <button className="btn" onClick={onCancel}>
            取消
          </button>
          <button className="btn btn-danger" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
