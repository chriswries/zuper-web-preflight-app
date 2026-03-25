import { Users, UserPlus, Shield, ShieldAlert, Loader2, Ban, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useState } from "react";
import { toast } from "sonner";
import { logAudit } from "@/lib/audit";

type UserRow = {
  id: string;
  email: string;
  display_name: string | null;
  is_active: boolean;
  user_roles: { role: string }[];
};

export default function UsersPage() {
  const { user: currentUser } = useAuth();
  const queryClient = useQueryClient();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<string>("operator");
  const [inviting, setInviting] = useState(false);

  const { data: users, isLoading } = useQuery({
    queryKey: ["admin-users"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("users")
        .select("id, email, display_name, is_active, user_roles(role)")
        .order("created_at");
      if (error) throw error;
      return data as unknown as UserRow[];
    },
  });

  const adminCount = users?.filter((u) => u.user_roles?.some((r) => r.role === "admin") && u.is_active).length ?? 0;

  const handleInvite = async () => {
    if (!inviteEmail.trim()) return;
    setInviting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/invite-user`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole }),
        }
      );
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Invite failed");

      toast.success(`Invited ${inviteEmail.trim()}`);
      setInviteEmail("");
      setInviteOpen(false);
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Invite failed");
    } finally {
      setInviting(false);
    }
  };

  const toggleRole = async (userId: string, currentRole: string) => {
    const newRole = currentRole === "admin" ? "operator" : "admin";

    // Last-admin protection
    if (currentRole === "admin" && adminCount <= 1) {
      toast.error("Cannot demote the last admin");
      return;
    }

    try {
      const { error } = await supabase
        .from("user_roles")
        .update({ role: newRole as any })
        .eq("user_id", userId);
      if (error) throw error;

      await logAudit({
        action_type: "change_role",
        entity_type: "user",
        entity_id: userId,
        before_state: { role: currentRole },
        after_state: { role: newRole },
      });

      toast.success(`Role updated to ${newRole}`);
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  };

  const toggleActive = async (userId: string, currentlyActive: boolean) => {
    // Don't allow deactivating yourself
    if (userId === currentUser?.id) {
      toast.error("Cannot deactivate yourself");
      return;
    }

    try {
      const { error } = await supabase
        .from("users")
        .update({ is_active: !currentlyActive })
        .eq("id", userId);
      if (error) throw error;

      await logAudit({
        action_type: currentlyActive ? "deactivate_user" : "activate_user",
        entity_type: "user",
        entity_id: userId,
        before_state: { is_active: currentlyActive },
        after_state: { is_active: !currentlyActive },
      });

      toast.success(currentlyActive ? "User deactivated" : "User activated");
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-foreground">User Management</h1>
        <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
          <DialogTrigger asChild>
            <Button>
              <UserPlus className="h-4 w-4 mr-1" />
              Invite User
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Invite User</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-1">
                <label className="text-sm font-medium text-foreground">Email</label>
                <Input
                  type="email"
                  placeholder="user@example.com"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                />
                {inviteEmail && !inviteEmail.toLowerCase().endsWith("@zuper.co") && (
                  <p className="text-xs text-muted-foreground">
                    External emails (non-zuper.co) will be granted access via invitation only.
                  </p>
                )}
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-foreground">Role</label>
                <Select value={inviteRole} onValueChange={setInviteRole}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="operator">Operator</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setInviteOpen(false)}>Cancel</Button>
              <Button onClick={handleInvite} disabled={inviting || !inviteEmail.trim()}>
                {inviting && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                Send Invite
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {(!users || users.length === 0) ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted mb-4">
            <Users className="h-7 w-7 text-muted-foreground" />
          </div>
          <h2 className="text-lg font-medium text-foreground mb-1">No users yet</h2>
          <p className="text-sm text-muted-foreground max-w-sm">
            Invite team members to start using Zuper Web Preflight.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {users.map((u) => {
            const role = u.user_roles?.[0]?.role ?? "operator";
            const isCurrentUser = u.id === currentUser?.id;
            const isLastAdmin = role === "admin" && adminCount <= 1;
            return (
              <Card key={u.id} className={!u.is_active ? "opacity-60" : ""}>
                <CardContent className="flex items-center gap-4 py-3 px-5">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-foreground">{u.display_name || u.email}</span>
                      {isCurrentUser && (
                        <Badge variant="secondary" className="text-[10px] h-4">You</Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">{u.email}</p>
                  </div>

                  <Badge
                    variant={role === "admin" ? "default" : "secondary"}
                    className="text-xs cursor-pointer"
                    onClick={() => toggleRole(u.id, role)}
                    title={isLastAdmin ? "Cannot demote last admin" : `Click to ${role === "admin" ? "demote" : "promote"}`}
                  >
                    {role === "admin" ? <Shield className="h-3 w-3 mr-1" /> : <ShieldAlert className="h-3 w-3 mr-1" />}
                    {role}
                  </Badge>

                  <Button
                    size="sm"
                    variant={u.is_active ? "outline" : "default"}
                    className="h-7 text-xs"
                    onClick={() => toggleActive(u.id, u.is_active)}
                    disabled={isCurrentUser}
                  >
                    {u.is_active ? (
                      <>
                        <Ban className="h-3 w-3 mr-1" />
                        Deactivate
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        Activate
                      </>
                    )}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
