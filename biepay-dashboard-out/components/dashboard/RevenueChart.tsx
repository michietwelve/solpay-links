"use client";

interface ChartData {
  date: string;
  volume: number;
}

interface RevenueChartProps {
  data: ChartData[];
}

export default function RevenueChart({ data }: RevenueChartProps) {
  if (!data || data.length === 0) return null;

  const maxVolume = Math.max(...data.map(d => d.volume), 1);
  const height = 100;
  const width = 300;
  const padding = 20;

  // Generate SVG path points
  const points = data.map((d, i) => {
    const x = (i / (data.length - 1)) * (width - padding * 2) + padding;
    const y = height - (d.volume / maxVolume) * (height - padding * 2) - padding;
    return `${x},${y}`;
  });

  const pathData = `M ${points.join(" L ")}`;

  return (
    <div className="w-full h-32 relative group">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-full overflow-visible"
        preserveAspectRatio="none"
      >
        {/* Gradient Definition */}
        <defs>
          <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#c5a36e" stopOpacity="0.2" />
            <stop offset="100%" stopColor="#c5a36e" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Area under the line */}
        <path
          d={`${pathData} L ${width - padding},${height} L ${padding},${height} Z`}
          fill="url(#chartGradient)"
          className="transition-all duration-700 ease-out"
        />

        {/* The Line */}
        <path
          d={pathData}
          fill="none"
          stroke="#c5a36e"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="transition-all duration-700 ease-out"
        />

        {/* Data Points */}
        {data.map((d, i) => {
          const [x, y] = points[i].split(",");
          return (
            <circle
              key={i}
              cx={x}
              cy={y}
              r="3"
              fill="#c5a36e"
              className="opacity-0 group-hover:opacity-100 transition-opacity duration-300"
            />
          );
        })}
      </svg>
      
      {/* Date Labels */}
      <div className="absolute bottom-0 left-0 w-full flex justify-between px-2">
        {data.map((d, i) => (
          <span key={i} className="text-[8px] text-zinc-400 font-medium uppercase tracking-tighter">
            {d.date.split("-")[2]}
          </span>
        ))}
      </div>
    </div>
  );
}
