import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export function AttendanceBreakdown({
  present,
  absent,
  late,
}: {
  present: number;
  absent: number;
  late: number;
}) {
  if (present + absent + late === 0) return null;
  const data = [
    { name: "Present", count: present },
    { name: "Absent", count: absent },
    { name: "Late", count: late },
  ];
  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div className="label">Present / absent / late</div>
      <div style={{ width: "100%", height: 160 }}>
        <ResponsiveContainer>
          <BarChart data={data}>
            <XAxis dataKey="name" />
            <YAxis allowDecimals={false} width={32} />
            <Tooltip />
            <Bar dataKey="count" fill="#0f2a24" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
