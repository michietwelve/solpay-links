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
      <svg 
        viewBox="0 0 100 100" 
        fill="none" 
        xmlns="http://www.w3.org/2000/svg"
        className={isIcon ? "w-full h-full" : "w-1/2 h-1/2"}
      >
        <path 
          d="M25 20H60C75 20 80 30 80 40C80 48 75 52 65 54C78 56 85 65 85 75C85 85 75 95 55 95H25V20ZM38 32V52H55C62 52 68 50 68 42C68 34 62 32 55 32H38ZM38 64V83H58C65 83 72 80 72 73.5C72 67 65 64 58 64H38Z" 
          fill={isIcon ? (isGold ? "#c5a36e" : "#000000") : isGold ? "#000000" : "#c5a36e"} 
        />
        {/* Stylized middle cut */}
        <rect x="25" y="52" width="30" height="4" fill={isIcon ? (isGold ? "#c5a36e" : "#000000") : isGold ? "#000000" : "#c5a36e"} />
      </svg>
    </div>
  );
}
