import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertCircle } from "lucide-react";

const secrets = [
  { name: "Anthropic API Key", configured: false },
  { name: "Browserless API Key", configured: false },
];

export default function SystemPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-foreground">System Settings</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">API Keys</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {secrets.map((s) => (
            <div key={s.name} className="flex items-center justify-between rounded-md border px-4 py-3">
              <span className="text-sm font-medium text-foreground">{s.name}</span>
              <div className="flex items-center gap-2 text-sm text-zuper-amber">
                <AlertCircle className="h-4 w-4" />
                Not configured
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">General</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Baseline minutes per page and other system settings will be configurable here.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
