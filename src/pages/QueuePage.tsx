import { ListTodo, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function QueuePage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-foreground">QA Queue</h1>
        <Button>
          <Plus className="h-4 w-4 mr-1" />
          Add to Queue
        </Button>
      </div>

      {/* Empty state */}
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted mb-4">
          <ListTodo className="h-7 w-7 text-muted-foreground" />
        </div>
        <h2 className="text-lg font-medium text-foreground mb-1">Queue is empty</h2>
        <p className="text-sm text-muted-foreground mb-4 max-w-sm">
          Add URLs to get started. You can upload a CSV or paste multiple URLs.
        </p>
        <Button variant="outline">
          <Plus className="h-4 w-4 mr-1" />
          Add URLs to queue
        </Button>
      </div>
    </div>
  );
}
