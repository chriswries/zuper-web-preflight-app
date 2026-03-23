import { Bot, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export default function AgentsPage() {
  const { data: agents, isLoading } = useQuery({
    queryKey: ["agents-settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("agents")
        .select("id, agent_number, name, model_tier, confidence_tier, is_active, system_prompt")
        .order("agent_number");
      if (error) throw error;
      return data;
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-foreground">Agent Settings</h1>

      <div className="grid gap-3">
        {agents?.map((agent) => {
          const hasPrompt = !!agent.system_prompt && agent.system_prompt.length > 0;
          return (
            <Card key={agent.id}>
              <CardContent className="flex items-center gap-3 py-3 px-5">
                <div className="flex h-8 w-8 items-center justify-center rounded-md bg-muted">
                  <Bot className="h-4 w-4 text-muted-foreground" />
                </div>
                <span className="font-medium text-foreground">{agent.name}</span>
                <Badge variant="outline" className="ml-2 text-xs">
                  {agent.model_tier}
                </Badge>
                <Badge variant="outline" className="text-xs">
                  {agent.confidence_tier}
                </Badge>
                <span className="ml-auto text-sm">
                  {hasPrompt ? (
                    <span className="text-green-600">Configured</span>
                  ) : (
                    <span className="text-muted-foreground">Not configured</span>
                  )}
                </span>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
