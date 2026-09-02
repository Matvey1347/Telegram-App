import { screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProtectedRoute } from "@/components/features/identity/auth/protected-route";
import { renderWithProviders } from "@/test/render-with-providers";
import { createNavigationMocks } from "@/test/router-mocks";

const navigationMocks = createNavigationMocks();
const useAuthMock = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: vi.fn(),
  useRouter: () => navigationMocks,
}));

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => useAuthMock(),
}));

const { usePathname } = await import("next/navigation");

describe("ProtectedRoute", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState({}, "", "/");
  });

  it.each(["/login", "/register"])(
    "renders %s immediately while the local session is still unresolved",
    (pathname) => {
      vi.mocked(usePathname).mockReturnValue(pathname);
      window.history.replaceState({}, "", pathname);
      useAuthMock.mockReturnValue({
        token: null,
        isTokenReady: false,
        isAuthResolved: false,
        isLoading: true,
        isAuthenticated: false,
        error: null,
      });

      renderWithProviders(
        <ProtectedRoute>
          <div>Public auth page</div>
        </ProtectedRoute>,
      );

      expect(screen.getByText("Public auth page")).toBeInTheDocument();
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
    },
  );

  it("keeps the protected loader while a protected route session is unresolved", () => {
    vi.mocked(usePathname).mockReturnValue("/settings");
    window.history.replaceState({}, "", "/settings");
    useAuthMock.mockReturnValue({
      token: null,
      isTokenReady: false,
      isAuthResolved: false,
      isLoading: true,
      isAuthenticated: false,
      error: null,
    });

    renderWithProviders(
      <ProtectedRoute>
        <div>Settings page</div>
      </ProtectedRoute>,
    );

    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.queryByText("Settings page")).not.toBeInTheDocument();
  });

  it("redirects a resolved authenticated login visit to its safe return path", async () => {
    vi.mocked(usePathname).mockReturnValue("/login");
    window.history.replaceState({}, "", "/login?redirect=%2Fsettings");
    useAuthMock.mockReturnValue({
      token: "active-session",
      isTokenReady: true,
      isAuthResolved: true,
      isLoading: false,
      isAuthenticated: true,
      error: null,
    });

    renderWithProviders(
      <ProtectedRoute>
        <div>Login page</div>
      </ProtectedRoute>,
    );

    expect(screen.getByText("Login page")).toBeInTheDocument();
    await waitFor(() => {
      expect(navigationMocks.replace).toHaveBeenCalledWith("/settings");
    });
  });

  it("renders the registration page without redirecting guests to login", async () => {
    vi.mocked(usePathname).mockReturnValue("/register");
    window.history.replaceState({}, "", "/register");
    useAuthMock.mockReturnValue({
      token: null,
      isTokenReady: true,
      isAuthResolved: true,
      isLoading: false,
      isAuthenticated: false,
      error: null,
    });

    renderWithProviders(
      <ProtectedRoute>
        <div>Register page</div>
      </ProtectedRoute>,
    );

    expect(await screen.findByText("Register page")).toBeInTheDocument();
    await waitFor(() => {
      expect(navigationMocks.replace).not.toHaveBeenCalled();
    });
  });

  it("keeps password reset pages public for signed-out users", async () => {
    vi.mocked(usePathname).mockReturnValue("/reset-password");
    window.history.replaceState({}, "", "/reset-password?token=reset-token");
    useAuthMock.mockReturnValue({
      token: null,
      isTokenReady: true,
      isAuthResolved: true,
      isLoading: false,
      isAuthenticated: false,
      error: null,
    });

    renderWithProviders(
      <ProtectedRoute>
        <div>Reset password page</div>
      </ProtectedRoute>,
    );

    expect(await screen.findByText("Reset password page")).toBeInTheDocument();
    expect(navigationMocks.replace).not.toHaveBeenCalled();
  });

  it("allows an authenticated user to open an emailed password reset link", async () => {
    vi.mocked(usePathname).mockReturnValue("/reset-password");
    window.history.replaceState({}, "", "/reset-password?token=reset-token");
    useAuthMock.mockReturnValue({
      token: "active-session",
      isTokenReady: true,
      isAuthResolved: true,
      isLoading: false,
      isAuthenticated: true,
      error: null,
    });

    renderWithProviders(
      <ProtectedRoute>
        <div>Authenticated reset page</div>
      </ProtectedRoute>,
    );

    expect(await screen.findByText("Authenticated reset page")).toBeInTheDocument();
    expect(navigationMocks.replace).not.toHaveBeenCalled();
  });

  it("redirects guests from protected pages to login", async () => {
    vi.mocked(usePathname).mockReturnValue("/settings");
    window.history.replaceState({}, "", "/settings");
    useAuthMock.mockReturnValue({
      token: null,
      isTokenReady: true,
      isAuthResolved: true,
      isLoading: false,
      isAuthenticated: false,
      error: null,
    });

    renderWithProviders(
      <ProtectedRoute>
        <div>Settings page</div>
      </ProtectedRoute>,
    );

    await waitFor(() => {
      expect(navigationMocks.replace).toHaveBeenCalledWith("/login?redirect=%2Fsettings");
    });
  });
});
