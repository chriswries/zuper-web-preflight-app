import { ArrowLeft, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/StatusBadge";
import { useNavigate, useParams } from "react-router-dom";

export default function AgentReportPage() {
  const navigate = useNavigate();
  const { id, agentId } = useParams();

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(`/pages/${id}`)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-semibold text-foreground">Agent #{agentId}</h1>
          <p className="text-sm text-muted-foreground">staging.zuper.co/example</p>
        </div>
        <StatusBadge status="not_started" />
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-4 gap-4">
        {["Checks", "Passed", "Failed", "Warnings"].map((label) => (
          <Card key={label}>
            <CardContent className="py-4 text-center">
              <p className="text-2xl font-semibold text-foreground">0</p>
              <p className="text-sm text-muted-foreground">{label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Empty state */}
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <AlertTriangle className="h-8 w-8 text-muted-foreground mb-3" />
          <p className="text-sm text-muted-foreground">
            No report data yet. Run this agent to see results.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
