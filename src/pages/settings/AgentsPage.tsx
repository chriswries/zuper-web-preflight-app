import { Bot } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

const agentStubs = [
  { number: 1, name: "Content Parity Agent" },
  { number: 2, name: "Copy Editing Agent" },
  { number: 3, name: "Link & Asset Integrity Agent" },
  { number: 4, name: "Redirect Validation Agent" },
  { number: 5, name: "Technical SEO Agent" },
  { number: 6, name: "On-Page SEO Agent" },
  { number: 7, name: "Structured Data Agent" },
  { number: 8, name: "Brand Voice Agent" },
  { number: 9, name: "Visual Design & Brand Compliance" },
  { number: 10, name: "Component Functionality Agent" },
  { number: 11, name: "Tracking & Analytics Agent" },
  { number: 12, name: "Performance Benchmarking Agent" },
  { number: 13, name: "Responsive & Cross-Browser Agent" },
  { number: 14, name: "Accessibility Agent" },
  { number: 15, name: "Security & Headers Agent" },
];

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
