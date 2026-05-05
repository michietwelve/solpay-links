"use client";

interface ConfirmModalProps {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: "danger" | "gold";
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

  return (
    <div 
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-300"
      onClick={(e) => e.target === e.currentTarget && onCancel()}
    >
      <div className="w-full max-w-sm bg-zinc-950 rounded-[2.5rem] border border-white/10 shadow-[0_32px_64px_-12px_rgba(0,0,0,0.8)] overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-4 duration-300">
        <div className="p-8 text-center space-y-6">
          {/* Icon Header */}
          <div className={`w-16 h-16 mx-auto rounded-2xl flex items-center justify-center ${isDanger ? "bg-red-500/10 text-red-500" : "bg-[#c5a36e]/10 text-[#c5a36e]"} border ${isDanger ? "border-red-500/20" : "border-[#c5a36e]/20"}`}>
            {isDanger ? (
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            ) : (
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            )}
          </div>

          <div className="space-y-2">
            <h3 className="text-xl font-black text-white tracking-tight">{title}</h3>
            <p className="text-sm text-zinc-400 leading-relaxed px-2">{message}</p>
          </div>

          <div className="flex flex-col gap-3 pt-2">
            <button
              onClick={onConfirm}
              className={`w-full py-4 rounded-2xl font-black text-xs uppercase tracking-[0.2em] transition-all shadow-lg active:scale-95 ${
                isDanger 
                ? "bg-red-600 text-white hover:bg-red-500 shadow-red-900/20" 
                : "bg-[#c5a36e] text-black hover:bg-[#d4b98c] shadow-[#c5a36e]/20"
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
