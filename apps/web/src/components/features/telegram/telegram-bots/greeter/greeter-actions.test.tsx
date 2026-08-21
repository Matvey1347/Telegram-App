import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GreeterAutomationsSection } from "./greeter-automations-section";
import {
  GreeterAnalyticsSection,
  GreeterUsersSection,
} from "./greeter-audience-sections";
import { GreeterBroadcastsSection } from "./greeter-broadcasts-section";
import { GreeterCaptchaSection } from "./greeter-captcha-section";
import { GreeterTestModeSection } from "./greeter-test-mode-section";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  mutate: vi.fn(),
  invalidateQueries: vi.fn(),
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: (options: { queryKey: readonly unknown[] }) =>
    options.queryKey[0] === "auth"
      ? queryState({ user: { editorShortcuts: null } })
      : mocks.query(options.queryKey),
  useMutation: () => ({ mutate: mocks.mutate, isPending: false }),
  useQueryClient: () => ({ invalidateQueries: mocks.invalidateQueries }),
}));

vi.mock("@/providers/toast-provider", () => ({
  useAppToast: () => ({ pushToast: vi.fn() }),
}));

vi.mock("@/lib/api", () => ({
  greeterApi: {},
  authApi: { getMe: vi.fn() },
}));

const queryState = (data: unknown) => ({
  data,
  isLoading: false,
  isError: false,
  isFetching: false,
  isSuccess: true,
  refetch: vi.fn(),
});

const sequence = {
  id: "sequence-1",
  name: "Welcome",
  trigger: "AFTER_START",
  scope: { type: "GLOBAL", channel: null },
  enabled: true,
  draftRevision: 2,
  draftStepCount: 1,
  currentVersion: null,
  updatedAt: "2026-08-09T00:00:00.000Z",
};

const detail = {
  ...sequence,
  draftSteps: [
    {
      id: "step-1",
      position: 0,
      delaySeconds: 60,
      enabled: true,
      messageText: "Welcome",
      buttons: [],
    },
  ],
  versions: [],
  testSession: {
    enabled: true,
    tester: { id: "tester-1", displayName: "Alex", username: "alex" },
    channel: { id: "channel-1", title: "Source", username: null },
    runNumber: 1,
    generation: 2,
    startedAt: null,
    lastInteractionAt: null,
    enabledAt: "2026-08-09T00:00:00.000Z",
    disabledAt: null,
  },
};

describe("Greeter destructive action confirmations", () => {
  beforeEach(() => {
    mocks.query.mockReset();
    mocks.mutate.mockReset();
    mocks.invalidateQueries.mockReset();
  });

  it("requires explicit confirmation before publishing a draft", async () => {
    mocks.query.mockImplementation((key: readonly unknown[]) =>
      key.length === 3 ? queryState([sequence]) : queryState(detail),
    );
    render(<GreeterAutomationsSection botId="bot-1" channels={[]} />);

    await userEvent.click(screen.getByRole("button", { name: /Welcome/ }));
    await userEvent.click(screen.getByRole("button", { name: "Publish" }));

    expect(screen.getByText("Publish automation")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Confirm publish" }),
    ).toBeInTheDocument();
  });

  it("shows unpublished captcha state and confirms configuration publish", async () => {
    mocks.query.mockReturnValue(queryState([]));
    render(
      <GreeterCaptchaSection
        botId="bot-1"
        config={{
          source: "GLOBAL",
          captchaEnabled: true,
          captchaType: "BUTTON_CONFIRM",
          captchaMessage: "Confirm",
          confirmButtonText: "Continue",
          choicePrompt: "Choose",
          timeoutMinutes: 10,
          successMessage: null,
          failureMessage: null,
          failureBehavior: "KEEP_PENDING",
        }}
        configuration={{
          draftRevision: 3,
          publishedRevision: 2,
          publishedAt: "2026-08-09T00:00:00.000Z",
          hasUnpublishedChanges: true,
        }}
      />,
    );
    expect(screen.getByText("Unpublished changes")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Publish" }));
    expect(screen.getByText(/Publish draft revision 3/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Confirm publish" }),
    ).toBeInTheDocument();
  });

  it("shows persisted estimate before broadcast confirmation", async () => {
    const broadcast = {
      id: "broadcast-1",
      name: "News",
      messageText: "Hello",
      buttons: [],
      audience: "ALL_ALIVE",
      userState: null,
      channelId: null,
      channel: null,
      status: "DRAFT",
      scheduledAt: null,
      confirmedAt: null,
      completedAt: null,
      progress: { total: 0, pending: 0, sent: 0, failed: 0, blocked: 0 },
      createdAt: "2026-08-09T00:00:00.000Z",
      updatedAt: "2026-08-09T00:00:00.000Z",
    };
    mocks.query.mockImplementation((key: readonly unknown[]) =>
      key.at(-1) === "estimate"
        ? queryState({ recipients: 42, audience: "ALL_ALIVE", channel: null })
        : queryState([broadcast]),
    );
    render(<GreeterBroadcastsSection botId="bot-1" channels={[]} />);

    await userEvent.click(screen.getByRole("button", { name: "Send now" }));

    expect(screen.getByText(/message 42 recipients/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirm send" })).toBeEnabled();
  });

  it("explains reset isolation before cancelling TEST state", async () => {
    mocks.query.mockReturnValue(queryState(detail.testSession));
    render(<GreeterTestModeSection botId="bot-1" channels={[]} />);

    await userEvent.click(screen.getByRole("button", { name: "Reset test user" }));

    expect(
      screen.getByRole("heading", { name: "Reset test user" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Production analytics, payments and history remain intact/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Confirm reset" }),
    ).toBeInTheDocument();
  });
});

describe("Greeter section query states", () => {
  beforeEach(() => mocks.query.mockReset());

  it.each([
    [
      "loading",
      { isLoading: true, isError: false, data: undefined },
      "Loading automations",
    ],
    [
      "error",
      { isLoading: false, isError: true, data: undefined },
      "Failed to load automations.",
    ],
    [
      "empty",
      { isLoading: false, isError: false, data: [] },
      "No automations yet",
    ],
  ])("renders the automation %s state", (_name, state, text) => {
    mocks.query.mockReturnValue({ ...state, refetch: vi.fn() });
    render(<GreeterAutomationsSection botId="bot-1" channels={[]} />);
    expect(screen.getByText(text)).toBeInTheDocument();
  });

  it.each([
    [
      "users error",
      () => <GreeterUsersSection botId="bot-1" channels={[]} />,
      { isLoading: false, isError: true, data: undefined },
      "Failed to load Greeter users.",
    ],
    [
      "users empty",
      () => <GreeterUsersSection botId="bot-1" channels={[]} />,
      { isLoading: false, isError: false, data: { items: [] } },
      "No users match these filters",
    ],
    [
      "analytics error",
      () => <GreeterAnalyticsSection botId="bot-1" channels={[]} />,
      { isLoading: false, isError: true, data: undefined },
      "Failed to load Greeter analytics.",
    ],
    [
      "analytics empty",
      () => <GreeterAnalyticsSection botId="bot-1" channels={[]} />,
      { isLoading: false, isError: false, data: undefined },
      "No analytics available",
    ],
    [
      "broadcast error",
      () => <GreeterBroadcastsSection botId="bot-1" channels={[]} />,
      { isLoading: false, isError: true, data: undefined },
      "Failed to load broadcasts.",
    ],
    [
      "broadcast empty",
      () => <GreeterBroadcastsSection botId="bot-1" channels={[]} />,
      { isLoading: false, isError: false, data: [] },
      "No broadcasts yet",
    ],
  ])("renders the %s state", (_name, renderSection, state, text) => {
    mocks.query.mockReturnValue({
      ...state,
      isFetching: false,
      refetch: vi.fn(),
    });
    render(renderSection());
    expect(screen.getByText(text)).toBeInTheDocument();
  });

  it.each([
    [
      { isLoading: true, isError: false, isSuccess: false, data: undefined },
      "Loading test mode",
    ],
    [
      { isLoading: false, isError: true, isSuccess: false, data: undefined },
      "Failed to load test mode.",
    ],
  ])("renders the Test Mode query state", (state, text) => {
    mocks.query.mockReturnValue({
      ...state,
      isFetching: false,
      refetch: vi.fn(),
    });
    render(<GreeterTestModeSection botId="bot-1" channels={[]} />);
    expect(screen.getByText(text)).toBeInTheDocument();
  });
});
