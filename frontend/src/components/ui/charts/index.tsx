import {
  LineChart as RechartsLineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart as RechartsBarChart,
  Bar,
  Cell,
  AreaChart as RechartsAreaChart,
  Area,
} from 'recharts';

// ============ Line Chart ============
interface LineChartProps {
  series: Array<{ name: string; data: number[] }>;
  categories: string[];
  height?: number;
  colors?: string[];
  title?: string;
  yAxisTitle?: string;
  showGrid?: boolean;
}

export function LineChart({
  series,
  categories,
  height = 300,
  colors = ['#3b82f6', '#10b981', '#f59e0b'],
}: LineChartProps) {
  // Guard against empty data
  if (!series || series.length === 0 || !series[0].data || series[0].data.length === 0) {
    return (
      <div
        className="flex items-center justify-center bg-muted/20 rounded-lg"
        style={{ height, minHeight: height }}
      >
        <span className="text-muted-foreground text-sm">No data available</span>
      </div>
    );
  }

  // Transform data for Recharts format
  const data = categories.map((cat, index) => {
    const point: Record<string, string | number> = { name: cat };
    series.forEach((s) => {
      point[s.name] = s.data[index] ?? 0;
    });
    return point;
  });

  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer width="100%" height="100%">
        <RechartsLineChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis
            dataKey="name"
            tick={{ fill: '#6b7280', fontSize: 12 }}
            axisLine={{ stroke: '#e5e7eb' }}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: '#6b7280', fontSize: 12 }}
            axisLine={{ stroke: '#e5e7eb' }}
            tickLine={false}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: 'white',
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
            }}
          />
          {series.map((s, i) => (
            <Line
              key={s.name}
              type="monotone"
              dataKey={s.name}
              stroke={colors[i % colors.length]}
              strokeWidth={3}
              dot={{ fill: colors[i % colors.length], strokeWidth: 2, r: 4 }}
              activeDot={{ r: 6 }}
            />
          ))}
        </RechartsLineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ============ Bar Chart (for Domain Performance) ============
interface DomainPerformanceProps {
  domains: Array<{ domain: string; correct: number; total: number; percentage: number }>;
  height?: number;
  title?: string;
}

export function DomainPerformance({
  domains,
  height = 300,
}: DomainPerformanceProps) {
  if (!domains || domains.length === 0) {
    return (
      <div
        className="flex items-center justify-center bg-muted/20 rounded-lg"
        style={{ height, minHeight: height }}
      >
        <span className="text-muted-foreground text-sm">No domain data available</span>
      </div>
    );
  }

  const formatDomain = (domain: string) =>
    domain.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

  const data = domains.map(d => ({
    name: formatDomain(d.domain),
    accuracy: d.percentage,
    correct: d.correct,
    total: d.total,
  }));

  const getColor = (accuracy: number) => {
    if (accuracy >= 80) return '#10b981';
    if (accuracy >= 60) return '#3b82f6';
    if (accuracy >= 40) return '#f59e0b';
    return '#ef4444';
  };

  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer width="100%" height="100%">
        <RechartsBarChart
          data={data}
          layout="vertical"
          margin={{ top: 5, right: 30, left: 80, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" horizontal={true} vertical={false} />
          <XAxis
            type="number"
            domain={[0, 100]}
            tick={{ fill: '#6b7280', fontSize: 12 }}
            axisLine={{ stroke: '#e5e7eb' }}
            tickFormatter={(value) => `${value}%`}
          />
          <YAxis
            type="category"
            dataKey="name"
            tick={{ fill: '#6b7280', fontSize: 11 }}
            axisLine={{ stroke: '#e5e7eb' }}
            width={80}
          />
          <Tooltip
            formatter={(value, _name, props) => [
              `${Number(value).toFixed(1)}% (${props.payload.correct}/${props.payload.total})`,
              'Accuracy'
            ]}
            contentStyle={{
              backgroundColor: 'white',
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
            }}
          />
          <Bar dataKey="accuracy" radius={[0, 4, 4, 0]}>
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={getColor(entry.accuracy)} />
            ))}
          </Bar>
        </RechartsBarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ============ Simple Score Distribution ============
interface ScoreDistributionProps {
  distribution: Record<string, number>;
  height?: number;
  title?: string;
}

export function ScoreDistribution({
  distribution,
  height = 300,
}: ScoreDistributionProps) {
  const data = Object.entries(distribution).map(([range, count]) => ({
    range,
    count,
  }));

  if (data.length === 0) {
    return (
      <div
        className="flex items-center justify-center bg-muted/20 rounded-lg"
        style={{ height, minHeight: height }}
      >
        <span className="text-muted-foreground text-sm">No distribution data</span>
      </div>
    );
  }

  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer width="100%" height="100%">
        <RechartsBarChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis dataKey="range" tick={{ fill: '#6b7280', fontSize: 11 }} />
          <YAxis tick={{ fill: '#6b7280', fontSize: 12 }} />
          <Tooltip
            formatter={(value) => [`${value} students`, 'Count']}
            contentStyle={{
              backgroundColor: 'white',
              border: '1px solid #e5e7eb',
              borderRadius: '8px'
            }}
          />
          <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} />
        </RechartsBarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ============ Area Chart ============
interface AreaChartProps {
  series: Array<{ name: string; data: number[] }>;
  categories: string[];
  height?: number;
  colors?: string[];
  gradient?: boolean;
}

export function AreaChart({
  series,
  categories,
  height = 300,
  colors = ['#3b82f6'],
}: AreaChartProps) {
  if (!series || series.length === 0 || !series[0].data || series[0].data.length === 0) {
    return (
      <div
        className="flex items-center justify-center bg-muted/20 rounded-lg"
        style={{ height, minHeight: height }}
      >
        <span className="text-muted-foreground text-sm">No data available</span>
      </div>
    );
  }

  const data = categories.map((cat, index) => {
    const point: Record<string, string | number> = { name: cat };
    series.forEach((s) => {
      point[s.name] = s.data[index] ?? 0;
    });
    return point;
  });

  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer width="100%" height="100%">
        <RechartsAreaChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
          <defs>
            {series.map((s, i) => (
              <linearGradient key={s.name} id={`color-${s.name}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={colors[i % colors.length]} stopOpacity={0.3} />
                <stop offset="95%" stopColor={colors[i % colors.length]} stopOpacity={0} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis dataKey="name" tick={{ fill: '#6b7280', fontSize: 12 }} />
          <YAxis tick={{ fill: '#6b7280', fontSize: 12 }} />
          <Tooltip />
          {series.map((s, i) => (
            <Area
              key={s.name}
              type="monotone"
              dataKey={s.name}
              stroke={colors[i % colors.length]}
              fillOpacity={1}
              fill={`url(#color-${s.name})`}
            />
          ))}
        </RechartsAreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// Export for backwards compatibility
export default {
  LineChart,
  AreaChart,
  DomainPerformance,
  ScoreDistribution,
};
