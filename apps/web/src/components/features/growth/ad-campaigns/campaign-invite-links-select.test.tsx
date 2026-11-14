import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { CampaignInviteLinksSelect } from "./campaign-invite-links-select";

vi.mock("@/lib/features/telegram/use-telegram-invite-link-options", () => ({
  useTelegramInviteLinkOptions: () => ({ links: [{ id: "a", name: "Первая", url: "a", creatorPhotoUrl: "https://example.test/a.jpg", creatorFirstName: "А" }, { id: "b", name: "Вторая", url: "b", creatorPhotoUrl: "https://example.test/b.jpg", creatorFirstName: "Б" }], loading: false, requestAll: vi.fn() }),
}));
vi.mock("@/lib/features/telegram/use-register-telegram-invite-link", () => ({ useRegisterTelegramInviteLink: () => ({ mutateAsync: vi.fn() }) }));
vi.mock("./campaign-multi-value-select", () => ({ CampaignMultiValueSelect: () => null }));
vi.mock("@/components/ui/primitives", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/components/ui/primitives")>()), DateInput: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input type="date" {...props} /> }));

describe("campaign invite link dates", () => {
  it("shows and updates the date of each selected link independently", () => {
    const change = vi.fn();
    render(<CampaignInviteLinksSelect channelId="channel" value={["a", "b"]} initialLinks={[]} enabled onChange={vi.fn()} windows={{ a: "2026-11-01" }} onWindowChange={change} />);
    expect(screen.getByLabelText("Считать с даты: Первая")).toHaveValue("2026-11-01");
    expect(screen.getByRole("img", { name: "А" })).toHaveAttribute("src", "https://example.test/a.jpg");
    fireEvent.click(screen.getByRole("button", { name: "Ограничить ссылку по дате" }));
    expect(screen.getByRole("img", { name: "Б" })).toHaveAttribute("src", "https://example.test/b.jpg");
    fireEvent.click(screen.getByRole("button", { name: /Вторая/ }));
    const date = screen.getByLabelText("Считать с даты: Вторая");
    expect(date).toHaveValue("");
    fireEvent.change(date, { target: { value: "2026-11-12" } });
    expect(change).toHaveBeenCalledWith("b", "2026-11-12");
    expect(screen.getByRole("button", { name: "Убрать ограничение: Вторая" })).toHaveClass("border-red-600", "text-red-400");
    fireEvent.click(screen.getByRole("button", { name: "Убрать ограничение: Вторая" }));
    expect(screen.queryByLabelText("Считать с даты: Вторая")).not.toBeInTheDocument();
  });
  it("hides the restriction selector when no links are selected", () => {
    render(<CampaignInviteLinksSelect channelId="channel" value={[]} initialLinks={[]} enabled onChange={vi.fn()} windows={{}} onWindowChange={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "Ограничить ссылку по дате" })).not.toBeInTheDocument();
  });
  it("moves the date with the restriction when another link is selected", () => {
    function Form() {
      const [windows, setWindows] = useState<Record<string, string>>({ a: "2026-11-01" });
      return <CampaignInviteLinksSelect channelId="channel" value={["a", "b"]} initialLinks={[]} enabled onChange={vi.fn()} windows={windows} onWindowChange={(id, date) => setWindows((current) => ({ ...current, [id]: date }))} />;
    }
    render(<Form />);
    fireEvent.click(screen.getByRole("button", { name: "Ссылка для ограничения: Первая" }));
    fireEvent.click(screen.getByRole("button", { name: /Вторая/ }));
    expect(screen.getByLabelText("Считать с даты: Вторая")).toHaveValue("2026-11-01");
    expect(screen.queryByLabelText("Считать с даты: Первая")).not.toBeInTheDocument();
  });
});
