import { useState, useEffect, useRef, useCallback } from "react";
import { ArrowLeft, Upload, AlertTriangle, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { deriveSlug, isValidUrl, createPageWithRuns, checkDuplicateUrl } from "@/lib/page-helpers";
import { toast } from "sonner";

export default function AddPagePage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [newUrl, setNewUrl] = useState("");
  const [oldUrl, setOldUrl] = useState("");
  const [slug, setSlug] = useState("");
  const [targetKeyword, setTargetKeyword] = useState("");
  const [figmaFile, setFigmaFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [duplicate, setDuplicate] = useState<{ id: string; slug: string | null } | null>(null);
  const [overrideDuplicate, setOverrideDuplicate] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const isMigration = oldUrl.trim().length > 0;
  const urlValid = isValidUrl(newUrl);
  const canSave = urlValid && !saving && (duplicate === null || overrideDuplicate);

  // Auto-derive slug
  useEffect(() => {
    if (newUrl && isValidUrl(newUrl)) {
      setSlug(deriveSlug(newUrl));
    }
  }, [newUrl]);

  // Duplicate detection with debounce
  const checkDupTimeout = useRef<ReturnType<typeof setTimeout>>();
  const handleNewUrlChange = useCallback((value: string) => {
    setNewUrl(value);
    setDuplicate(null);
    setOverrideDuplicate(false);
    clearTimeout(checkDupTimeout.current);
    if (isValidUrl(value)) {
      checkDupTimeout.current = setTimeout(async () => {
        const existing = await checkDuplicateUrl(value);
        if (existing) setDuplicate({ id: existing.id, slug: existing.slug });
      }, 500);
    }
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const validTypes = ["image/png", "image/jpeg"];
    if (!validTypes.includes(file.type)) {
      toast.error("Only PNG and JPG files are accepted");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("File must be 5MB or smaller");
      return;
    }
    setFigmaFile(file);
  };

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);

    try {
      let figmaPath: string | null = null;

      // Upload figma comp if provided
      if (figmaFile) {
        const ext = figmaFile.name.split(".").pop();
        const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from("figma-comps")
          .upload(path, figmaFile);
        if (uploadError) throw new Error(uploadError.message);
        figmaPath = path;
      }

      const pageId = await createPageWithRuns({
        newUrl: newUrl.trim(),
        oldUrl: oldUrl.trim() || null,
        slug: slug.trim() || null,
        targetKeyword: targetKeyword.trim() || null,
        figmaCompPath: figmaPath,
        createdBy: user.id,
      });

      toast.success("Page created successfully");
      navigate(`/pages/${pageId}`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to create page");
    } finally {
      setSaving(false);
    }
  };

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
          {/* New URL */}
          <div className="space-y-2">
            <Label htmlFor="new_url">New URL (staging) *</Label>
            <Input
              id="new_url"
              placeholder="https://staging.zuper.co/page-slug"
              value={newUrl}
              onChange={(e) => handleNewUrlChange(e.target.value)}
              className={newUrl && !urlValid ? "border-destructive" : ""}
            />
            {newUrl && !urlValid && (
              <p className="text-xs text-destructive">Enter a valid URL starting with http:// or https://</p>
            )}
            {duplicate && !overrideDuplicate && (
              <div className="flex items-center gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>
                  This URL already exists as{" "}
                  <button
                    className="underline font-medium"
                    onClick={() => navigate(`/pages/${duplicate.id}`)}
                  >
                    {duplicate.slug || "a page"}
                  </button>.
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  className="ml-auto shrink-0"
                  onClick={() => setOverrideDuplicate(true)}
                >
                  Add anyway
                </Button>
              </div>
            )}
          </div>

          {/* Old URL */}
          <div className="space-y-2">
            <Label htmlFor="old_url">Old URL (optional — enables Migration mode)</Label>
            <Input
              id="old_url"
              placeholder="https://zuper.co/old-page"
              value={oldUrl}
              onChange={(e) => setOldUrl(e.target.value)}
            />
          </div>

          {/* Mode indicator */}
          <div className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
            Mode:{" "}
            <span className="font-medium text-foreground">
              {isMigration ? "Migration" : "Ongoing"}
            </span>
            {!isMigration && (
              <span className="ml-1">(add an Old URL to switch to Migration mode)</span>
            )}
          </div>

          {/* Slug */}
          <div className="space-y-2">
            <Label htmlFor="slug">Slug</Label>
            <Input
              id="slug"
              placeholder="page-slug"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
            />
          </div>

          {/* Target Keyword */}
          <div className="space-y-2">
            <Label htmlFor="keyword">Target Keyword</Label>
            <Input
              id="keyword"
              placeholder="primary keyword"
              value={targetKeyword}
              onChange={(e) => setTargetKeyword(e.target.value)}
            />
          </div>

          {/* Figma Comp Upload */}
          <div className="space-y-2">
            <Label>Figma Comp (optional)</Label>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg"
              className="hidden"
              onChange={handleFileChange}
            />
            {figmaFile ? (
              <div className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm">
                <Upload className="h-4 w-4 text-muted-foreground" />
                <span className="flex-1 truncate text-foreground">{figmaFile.name}</span>
                <button onClick={() => setFigmaFile(null)} className="text-muted-foreground hover:text-foreground">
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <div
                className="flex items-center justify-center rounded-md border border-dashed border-border py-8 text-sm text-muted-foreground cursor-pointer hover:bg-accent/50 transition-colors"
                onClick={() => fileRef.current?.click()}
              >
                <Upload className="h-4 w-4 mr-2" />
                Click to upload PNG or JPG (max 5 MB)
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <Button onClick={handleSave} disabled={!canSave}>
              {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Save Page
            </Button>
            <Button variant="outline" onClick={() => navigate("/pages")}>
              Cancel
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
