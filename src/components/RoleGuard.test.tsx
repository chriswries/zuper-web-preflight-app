import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const mockUseAuth = vi.fn();
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => mockUseAuth(),
}));

import { RoleGuard } from "./RoleGuard";

describe("RoleGuard", () => {
  it("shows access denied for non-admin when admin required", () => {
    mockUseAuth.mockReturnValue({ role: "operator", loading: false });
    render(
      <RoleGuard requiredRole="admin">
        <div>Admin Content</div>
      </RoleGuard>
    );
    expect(screen.getByText("Access Denied")).toBeInTheDocument();
    expect(screen.queryByText("Admin Content")).not.toBeInTheDocument();
  });

  it("renders children for admin user", () => {
    mockUseAuth.mockReturnValue({ role: "admin", loading: false });
    render(
      <RoleGuard requiredRole="admin">
        <div>Admin Content</div>
      </RoleGuard>
    );
    expect(screen.getByText("Admin Content")).toBeInTheDocument();
  });

  it("returns null while loading", () => {
    mockUseAuth.mockReturnValue({ role: null, loading: true });
    const { container } = render(
      <RoleGuard requiredRole="admin">
        <div>Admin Content</div>
      </RoleGuard>
    );
    expect(container.innerHTML).toBe("");
  });
});
