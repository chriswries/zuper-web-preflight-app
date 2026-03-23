import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const mockUseAuth = vi.fn();
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => mockUseAuth(),
}));

import LoginPage from "./LoginPage";

function renderLogin() {
  return render(
    <MemoryRouter>
      <LoginPage />
    </MemoryRouter>
  );
}

describe("LoginPage", () => {
  beforeEach(() => {
    mockUseAuth.mockReturnValue({
      user: null,
      loading: false,
      signIn: vi.fn().mockResolvedValue({ error: null }),
      signUp: vi.fn().mockResolvedValue({ error: null }),
    });
  });

  it("renders sign in form by default", () => {
    renderLogin();
    expect(screen.getByText("Sign in to your account")).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
  });

  it("toggles to sign up form", () => {
    renderLogin();
    fireEvent.click(screen.getByText("Sign up"));
    expect(screen.getByText("Create your account")).toBeInTheDocument();
    expect(screen.getByLabelText("Display name")).toBeInTheDocument();
  });

  it("toggles back to sign in", () => {
    renderLogin();
    fireEvent.click(screen.getByText("Sign up"));
    fireEvent.click(screen.getByText("Sign in"));
    expect(screen.getByText("Sign in to your account")).toBeInTheDocument();
  });
});
