import { useAuth, type AppRole } from "@/contexts/AuthContext";
import { ShieldX } from "lucide-react";

interface RoleGuardProps {
  requiredRole: AppRole;
  children: React.ReactNode;
}

export function RoleGuard({ requiredRole, children }: RoleGuardProps) {
  const { role, loading } = useAuth();

  if (loading) {
    return null;
  }

  if (requiredRole === "admin" && role !== "admin") {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center space-y-3">
        <ShieldX className="h-12 w-12 text-muted-foreground" />
        <h1 className="text-xl font-semibold text-foreground">Access Denied</h1>
        <p className="text-sm text-muted-foreground max-w-sm">
          You don't have permission to view this page. Contact an admin if you need access.
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
