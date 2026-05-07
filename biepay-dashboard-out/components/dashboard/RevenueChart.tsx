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
      <div className="h-48 flex items-center justify-center text-zinc-400 text-xs font-bold uppercase tracking-widest bg-zinc-50/50 rounded-3xl border border-dashed border-zinc-200">
        Waiting for payment data...
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
