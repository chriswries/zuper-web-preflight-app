import { ArrowLeft, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useNavigate } from "react-router-dom";

export default function AddPagePage() {
  const navigate = useNavigate();

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/pages")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-2xl font-semibold text-foreground">Add Page</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Page Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="new_url">New URL (staging) *</Label>
            <Input id="new_url" placeholder="https://staging.zuper.co/page-slug" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="old_url">Old URL (optional — enables Migration mode)</Label>
            <Input id="old_url" placeholder="https://zuper.co/old-page" />
          </div>
          <div className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
            Mode: <span className="font-medium text-foreground">Ongoing</span>
            <span className="ml-1">(add an Old URL to switch to Migration mode)</span>
          </div>
          <div className="space-y-2">
            <Label htmlFor="slug">Slug</Label>
            <Input id="slug" placeholder="page-slug" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="keyword">Target Keyword</Label>
            <Input id="keyword" placeholder="primary keyword" />
          </div>
          <div className="space-y-2">
            <Label>Figma Comp (optional)</Label>
            <div className="flex items-center justify-center rounded-md border border-dashed border-border py-8 text-sm text-muted-foreground cursor-pointer hover:bg-accent/50 transition-colors">
              <Upload className="h-4 w-4 mr-2" />
              Click to upload PNG or JPG (max 5 MB)
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <Button>Save Page</Button>
            <Button variant="outline" onClick={() => navigate("/pages")}>Cancel</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
