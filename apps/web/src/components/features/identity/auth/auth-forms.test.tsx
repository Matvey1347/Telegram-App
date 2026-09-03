import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import authEn from "@/i18n/locales/en/auth";
import authRu from "@/i18n/locales/ru/auth";
import { I18nProvider } from "@/providers/i18n-provider";
import { LoginForm, RegisterForm } from "./auth-forms";

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  login: vi.fn(),
  register: vi.fn(),
  forgotPassword: vi.fn(),
  resetPassword: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/login",
  useRouter: () => ({ replace: mocks.replace }),
}));
vi.mock("@/lib/api", () => ({
  authApi: {
    login: mocks.login,
    register: mocks.register,
    forgotPassword: mocks.forgotPassword,
    resetPassword: mocks.resetPassword,
  },
  isApiNetworkError: () => false,
}));

describe("localized auth forms", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    window.history.replaceState({}, "", "/login");
  });

  it("opens publications after login when dashboard is not accessible", async () => {
    mocks.login.mockResolvedValue({
      accessToken: "content-manager-token",
      user: { locale: "en" },
      workspace: {
        id: "workspace-1",
        access: { featureIds: ["posts"] },
      },
    });
    render(
      <I18nProvider initialLocale="en" preloadedCatalogs={{ auth: authEn }}>
        <LoginForm />
      </I18nProvider>,
    );

    fireEvent.change(screen.getByLabelText(/^Email/), {
      target: { value: "olga@gmail.com" },
    });
    fireEvent.change(screen.getByLabelText(/^Password/), {
      target: { value: "password" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => {
      expect(mocks.replace).toHaveBeenCalledWith("/telegram-posts");
    });
  });

  it("switches the whole login screen and existing validation errors to Russian", async () => {
    render(
      <I18nProvider initialLocale="en" preloadedCatalogs={{ auth: authEn }}>
        <LoginForm />
      </I18nProvider>,
    );

    expect(
      screen.getByRole("heading", { name: "Welcome back" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByText("Email is required")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Russian" }));

    expect(
      await screen.findByRole("heading", { name: "С возвращением" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Укажите email")).toBeInTheDocument();
    expect(
      screen.getByText("Единое рабочее пространство для управления Telegram."),
    ).toBeInTheDocument();
    expect(document.cookie).toContain("telegram-system-locale=ru");
  });

  it("renders Russian before the first auth-form render when selected by the server", () => {
    render(
      <I18nProvider initialLocale="ru" preloadedCatalogs={{ auth: authRu }}>
        <LoginForm />
      </I18nProvider>,
    );
    expect(
      screen.getByRole("heading", { name: "С возвращением" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Welcome back")).not.toBeInTheDocument();
  });

  it("persists the selected locale when creating an account", async () => {
    mocks.register.mockResolvedValue({
      accessToken: "token",
      user: { locale: "ru" },
      workspace: { id: "workspace-1" },
    });
    render(
      <I18nProvider initialLocale="ru" preloadedCatalogs={{ auth: authRu }}>
        <RegisterForm />
      </I18nProvider>,
    );

    fireEvent.change(screen.getByLabelText(/Ваше имя/), {
      target: { value: "Ольга" },
    });
    fireEvent.change(screen.getByLabelText(/Рабочий email/), {
      target: { value: "olga@example.test" },
    });
    fireEvent.change(screen.getByLabelText(/^Пароль/), {
      target: { value: "password" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Создать пространство" }),
    );

    await waitFor(() =>
      expect(mocks.register).toHaveBeenCalledWith(
        expect.objectContaining({ locale: "ru" }),
      ),
    );
  });
});
