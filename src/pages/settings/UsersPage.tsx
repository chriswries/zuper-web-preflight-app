import { Users, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function UsersPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-foreground">User Management</h1>
        <Button>
          <UserPlus className="h-4 w-4 mr-1" />
          Invite User
        </Button>
      </div>

      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted mb-4">
          <Users className="h-7 w-7 text-muted-foreground" />
        </div>
        <h2 className="text-lg font-medium text-foreground mb-1">No users yet</h2>
        <p className="text-sm text-muted-foreground max-w-sm">
          Invite team members to start using Zuper Web Preflight.
        </p>
      </div>
    </div>
  );
}
