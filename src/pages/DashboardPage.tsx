import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart3 } from "lucide-react";

const metrics = [
  { label: "Pages QA'd", value: "0" },
  { label: "Avg. Turnaround", value: "—" },
  { label: "First-Pass Rate", value: "—" },
  { label: "Gate Overrides", value: "0" },
];

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-foreground">Dashboard</h1>

      <div className="grid grid-cols-4 gap-4">
        {metrics.map((m) => (
          <Card key={m.label}>
            <CardContent className="py-5 text-center">
              <p className="text-3xl font-bold text-foreground">{m.value}</p>
              <p className="text-sm text-muted-foreground mt-1">{m.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Chart placeholder */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Pipeline Activity</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <BarChart3 className="h-8 w-8 text-muted-foreground mb-3" />
          <p className="text-sm text-muted-foreground">
            Charts will appear here once pages are processed.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
