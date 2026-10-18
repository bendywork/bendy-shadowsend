"use client";

/* eslint-disable @next/next/no-img-element */
import { LoaderCircle, X } from "lucide-react";

type Props = {
  open: boolean;
  qr: string | null;
  joinLink: string;
  onClose: () => void;
};

export function RoomQrDialog({ open, qr, joinLink, onClose }: Props) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-overlay-strong p-4">
      <section className="w-full max-w-sm rounded-2xl border border-line bg-canvas p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-semibold text-ink">房间二维码</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-line p-1 text-ink-soft"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {qr ? (
          <img
            src={qr}
            alt="room-qr"
            className="mx-auto h-64 w-64 rounded-lg border border-line bg-qr-surface p-2"
          />
        ) : (
          <div className="flex h-64 items-center justify-center">
            <LoaderCircle className="h-5 w-5 animate-spin text-ink-muted" />
          </div>
        )}
        <p className="mt-3 break-all text-xs text-ink-muted">{joinLink}</p>
      </section>
    </div>
  );
}
