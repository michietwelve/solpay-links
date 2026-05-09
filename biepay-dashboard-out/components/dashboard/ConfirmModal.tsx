"use client";

interface ConfirmModalProps {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: "danger" | "gold" | "warning";
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmModal({
  title,
  message,
  confirmText = "Confirm",
  cancelText = "Cancel",
  variant = "gold",
  onConfirm,
  onCancel
}: ConfirmModalProps) {
  const isDanger = variant === "danger";
  const isWarning = variant === "warning";

  return (
    <div 
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-300"
      onClick={(e) => e.target === e.currentTarget && onCancel()}
    >
      <div className="w-full max-w-sm bg-zinc-950 rounded-[2.5rem] border border-white/10 shadow-[0_32px_64px_-12px_rgba(0,0,0,0.8)] overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-4 duration-300">
        <div className="p-8 text-center space-y-6">
          {/* Icon Header - Premium SVG Suite */}
          <div className={`w-16 h-16 mx-auto rounded-2xl flex items-center justify-center border ${
            isDanger ? "bg-red-500/10 text-red-500 border-red-500/20" : 
            isWarning ? "bg-amber-500/10 text-amber-500 border-amber-500/20" :
            "bg-[#c5a36e]/10 text-[#c5a36e] border-[#c5a36e]/20"
          }`}>
            {isDanger ? (
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            ) : isWarning ? (
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            ) : (
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            )}
          </div>

          <div className="space-y-2">
            <h3 className="text-xl font-black text-white tracking-tight leading-none">{title}</h3>
            <p className="text-sm text-zinc-400 leading-relaxed px-4">{message}</p>
          </div>

          <div className="flex flex-col gap-3 pt-2">
            <button
              onClick={onConfirm}
              className={`w-full py-4 rounded-2xl font-black text-[11px] uppercase tracking-[0.2em] transition-all shadow-2xl active:scale-95 ${
                isDanger 
                ? "bg-red-600 text-white hover:bg-red-500 shadow-red-900/40" 
                : isWarning
                ? "bg-amber-500 text-black hover:bg-amber-400 shadow-amber-900/40"
                : "bg-[#c5a36e] text-black hover:bg-[#d4b98c] shadow-[#c5a36e]/40"
              }`}
            >
              {confirmText}
            </button>
            <button
              onClick={onCancel}
              className="w-full py-4 rounded-2xl font-black text-xs uppercase tracking-[0.2em] text-zinc-500 hover:text-white hover:bg-white/5 transition-all"
            >
              {cancelText}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
