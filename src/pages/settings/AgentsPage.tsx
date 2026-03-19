import { Bot } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

const agentStubs = Array.from({ length: 15 }, (_, i) => ({
  number: i + 1,
  name: `Agent ${i + 1}`,
}));

export default function AgentsPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-foreground">Agent Settings</h1>

      <div className="grid gap-3">
        {agentStubs.map((agent) => (
          <Card key={agent.number}>
            <CardContent className="flex items-center gap-3 py-3 px-5">
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-muted">
                <Bot className="h-4 w-4 text-muted-foreground" />
              </div>
              <span className="font-medium text-foreground">{agent.name}</span>
              <span className="text-sm text-muted-foreground ml-auto">Not configured</span>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
