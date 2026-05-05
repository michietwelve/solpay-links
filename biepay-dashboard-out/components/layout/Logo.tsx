"use client";

interface LogoProps {
  className?: string;
  variant?: "gold" | "black" | "icon";
}

export default function Logo({ className = "w-8 h-8", variant = "gold" }: LogoProps) {
  const isIcon = variant === "icon";
  const isGold = variant === "gold";

  return (
    <div className={`${className} flex items-center justify-center overflow-hidden rounded-xl ${isIcon ? "" : isGold ? "bg-[#c5a36e]" : "bg-zinc-900"} transition-all shadow-sm`}>
      <img 
        src="/logo.png" 
        alt="BiePay Logo" 
        className={isIcon ? "w-full h-full object-cover" : "w-full h-full object-contain p-1"} 
      />
    </div>
  );
}
