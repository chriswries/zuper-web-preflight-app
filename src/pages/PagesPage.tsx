import { FileText, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

export default function PagesPage() {
  const navigate = useNavigate();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-foreground">Pages</h1>
        <Button onClick={() => navigate("/pages/new")}>
          <Plus className="h-4 w-4 mr-1" />
          Add Page
        </Button>
      </div>

      {/* Empty state */}
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted mb-4">
          <FileText className="h-7 w-7 text-muted-foreground" />
        </div>
        <h2 className="text-lg font-medium text-foreground mb-1">No pages yet</h2>
        <p className="text-sm text-muted-foreground mb-4 max-w-sm">
          Add your first page to start running QA checks against it.
        </p>
        <Button variant="outline" onClick={() => navigate("/pages/new")}>
          <Plus className="h-4 w-4 mr-1" />
          Add your first page
        </Button>
      </div>
    </div>
  );
}
