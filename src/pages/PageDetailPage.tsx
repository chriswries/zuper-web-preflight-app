import { ArrowLeft, Play, RotateCcw, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/StatusBadge";
import { useNavigate, useParams } from "react-router-dom";

const stages = [
  { number: 1, name: "Content & Migration", agents: [1, 2, 3, 4] },
  { number: 2, name: "SEO & Discoverability", agents: [5, 6, 7] },
  { number: 3, name: "Brand & Voice", agents: [8, 9] },
  { number: 4, name: "Functionality", agents: [10, 11] },
  { number: 5, name: "Performance & Compat.", agents: [12, 13, 14] },
  { number: 6, name: "Security", agents: [15] },
];

export default function PageDetailPage() {
  const navigate = useNavigate();
  const { id } = useParams();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/pages")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-semibold text-foreground truncate">
            staging.zuper.co/example
          </h1>
          <p className="text-sm text-muted-foreground">Added Jan 1, 2025 • Ongoing mode</p>
        </div>
        <StatusBadge status="pending" />
      </div>

      {/* Action bar */}
      <div className="flex gap-2">
        <Button disabled>
          <Play className="h-4 w-4 mr-1" />
          Run All
        </Button>
        <Button variant="outline" disabled>
          <RotateCcw className="h-4 w-4 mr-1" />
          Re-Run Failed
        </Button>
        <Button variant="outline" disabled>
          <Download className="h-4 w-4 mr-1" />
          Export
        </Button>
      </div>

      {/* Pipeline stages */}
      <div className="space-y-4">
        <h2 className="text-lg font-medium text-foreground">Pipeline</h2>

        {/* Stage indicator bar */}
        <div className="flex gap-1">
          {stages.map((stage) => (
            <div key={stage.number} className="flex-1 h-2 rounded-full bg-muted" />
          ))}
        </div>

        {/* Stage cards */}
        <div className="grid gap-4">
          {stages.map((stage) => (
            <Card key={stage.number}>
              <CardContent className="py-4 px-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
                      {stage.number}
                    </span>
                    <span className="font-medium text-foreground">{stage.name}</span>
                    <span className="text-sm text-muted-foreground">
                      {stage.agents.length} agent{stage.agents.length > 1 ? "s" : ""}
                    </span>
                  </div>
                  <StatusBadge status="not_started" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
