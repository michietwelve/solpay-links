"use client";

import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

interface ChartData {
  date: string;
  volume: number;
}

interface RevenueChartProps {
  data: ChartData[];
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-zinc-950 border border-white/10 p-3 rounded-xl shadow-2xl backdrop-blur-xl">
        <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-1">
          {new Date(label).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          })}
        </p>
        <p className="text-sm font-black text-white">
          ${payload[0].value.toFixed(2)}{" "}
          <span className="text-[10px] text-zinc-500 ml-1">VOLUME</span>
        </p>
      </div>
    );
  }
  return null;
};

export default function RevenueChart({ data }: RevenueChartProps) {
  if (!data || data.length === 0) {
    return (
      <div className="h-48 flex flex-col items-center justify-center bg-zinc-50/50 rounded-[2rem] border border-dashed border-zinc-200 group">
        <div className="w-10 h-10 rounded-full bg-zinc-100 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
          <svg className="w-5 h-5 text-zinc-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
        </div>
        <p className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em]">Live Analytics Pending</p>
        <p className="text-[8px] font-bold text-zinc-300 uppercase tracking-widest mt-1 italic">Synchronization in progress...</p>
      </div>
    );
  }

  return (
    <div className="w-full h-48">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={data}
          margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
        >
          <defs>
            <linearGradient id="colorVolume" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#c5a36e" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#c5a36e" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid
            strokeDasharray="3 3"
            vertical={false}
            stroke="rgba(0,0,0,0.03)"
          />
          <XAxis
            dataKey="date"
            hide
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 10, fontWeight: "bold", fill: "#a1a1aa" }}
          />
          <YAxis
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 10, fontWeight: "bold", fill: "#a1a1aa" }}
          />
          <Tooltip content={<CustomTooltip />} />
          <Area
            type="monotone"
            dataKey="volume"
            stroke="#c5a36e"
            strokeWidth={3}
            fillOpacity={1}
            fill="url(#colorVolume)"
            animationDuration={1500}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
