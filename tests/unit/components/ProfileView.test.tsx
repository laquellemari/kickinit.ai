import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { computePassport } from "@/lib/passport/passport";
import { HOME } from "../../helpers/factories";

vi.mock("@/components/PlansCalendar", () => ({
  default: ({ bookings }: { bookings: { id: string; name: string }[] }) => <div data-testid="calendar">{bookings.map((b) => b.name).join(", ")}</div>,
}));
const { ProfileView, toAvatarDataUrl, CalendarLoading } = await import("@/components/ProfileView");

const NOW = new Date("2026-11-11T20:00:00Z");
const passport = () => JSON.parse(JSON.stringify(computePassport({ bookings: [], ctx: HOME, questProgress: [], counters: { poolsFundedAsOrganizer: 0, poolContributions: 0, giftsRedeemed: 0, referralsConverted: 0, reviews: 0 } })));
const bk = (o: Record<string, unknown>) => ({ id: "b", kind: "partner", itemId: "carasau-pasta-bar", name: "Marea", partySize: 2, startsAt: "2026-11-15T02:30:00.000Z", amount: "180.00", currency: "USD", status: "confirmed", paypalOrderId: "O", holdExpiresAt: null, createdAt: "x", checkedInAt: null, city: "Miami", ...o });
const profile = (o: Record<string, unknown> = {}) => ({ userId: "u", displayName: "", homeCity: "Miami", homeCountry: "US", avatar: null, ...o });

function server(o: { profile?: unknown; bookings?: unknown[]; put?: { status: number; body: unknown }[]; fail?: boolean } = {}) {
  const puts = [...(o.put ?? [])];
  const f = vi.fn(async (url: string, init?: RequestInit) => {
    if (o.fail) return new Response("{}", { status: 500 });
    if (url === "/api/profile" && init?.method === "PUT") { const r = puts.shift()!; return new Response(JSON.stringify(r.body), { status: r.status }); }
    if (url === "/api/profile") return new Response(JSON.stringify(o.profile ?? profile()));
    if (url === "/api/passport") return new Response(JSON.stringify(passport()));
    return new Response(JSON.stringify({ bookings: o.bookings ?? [] }));
  });
  vi.stubGlobal("fetch", f);
  return f;
}
const putBody = (f: ReturnType<typeof vi.fn>) => JSON.parse((f.mock.calls.find((c) => (c[1] as RequestInit | undefined)?.method === "PUT")![1] as RequestInit).body as string);

beforeEach(() => vi.unstubAllGlobals());
afterEach(() => vi.unstubAllGlobals());

describe("ProfileView", () => {
  it("shows level, stats, upcoming plans (soonest first, no past or released) and the calendar with every booking", async () => {
    server({ profile: profile({ displayName: "Kavon" }), bookings: [
      bk({ id: "b2", name: "Later", startsAt: "2026-11-20T02:30:00.000Z", status: "held" }),
      bk({ id: "b1", name: "Sooner", startsAt: "2026-11-15T02:30:00.000Z" }),
      bk({ id: "b0", name: "Past", startsAt: "2026-11-01T02:30:00.000Z" }),
      bk({ id: "b3", name: "Released", startsAt: "2026-11-21T02:30:00.000Z", status: "declined" }),
    ] });
    render(<ProfileView now={NOW} />);
    expect(screen.getByRole("status")).toHaveTextContent("Loading your dashboard");
    expect(await screen.findByRole("heading", { name: "Kavon" })).toBeInTheDocument();
    expect(screen.getByText(/Level 1 · Newcomer · 0 XP/)).toBeInTheDocument();
    expect(screen.getByText("500 XP to the next level")).toBeInTheDocument();
    const upcoming = within(screen.getByRole("list", { name: "Upcoming" })).getAllByRole("link").map((a) => a.textContent);
    expect(upcoming).toEqual(["Sooner", "Later"]);
    expect(screen.getByText(/on hold/)).toBeInTheDocument();
    expect(await screen.findByTestId("calendar")).toHaveTextContent("Later, Sooner, Past, Released");
  });
  it("no bookings: invites you to plan something; no name shows a generic heading and initial", async () => {
    server();
    render(<ProfileView now={NOW} />);
    expect(await screen.findByRole("heading", { name: "Your dashboard" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Plan something" })).toHaveAttribute("href", "/");
    expect(screen.getByText("Y")).toBeInTheDocument();
  });
  it("saves settings", async () => {
    const f = server({ put: [{ status: 200, body: profile({ displayName: "Kav", homeCity: "Austin" }) }] });
    render(<ProfileView now={NOW} />);
    fireEvent.change(await screen.findByLabelText("Name"), { target: { value: "Kav" } });
    fireEvent.change(screen.getByLabelText("Home city"), { target: { value: "Austin" } });
    fireEvent.change(screen.getByLabelText("Country"), { target: { value: "MX" } });
    fireEvent.click(screen.getByRole("button", { name: "Save settings" }));
    expect(await screen.findByText("Settings saved.")).toBeInTheDocument();
    expect(putBody(f)).toEqual({ displayName: "Kav", homeCity: "Austin", homeCountry: "MX" });
  });
  it("settings errors are shown", async () => {
    server({ put: [{ status: 400, body: { error: "Home city is required" } }] });
    render(<ProfileView now={NOW} />);
    fireEvent.click(await screen.findByRole("button", { name: "Save settings" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Home city is required");
  });
  it("settings error with no message", async () => {
    server({ put: [{ status: 500, body: {} }] });
    render(<ProfileView now={NOW} />);
    fireEvent.click(await screen.findByRole("button", { name: "Save settings" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't save.");
  });
  describe("photo", () => {
    beforeEach(() => {
      vi.stubGlobal("createImageBitmap", vi.fn(async () => ({ width: 1024, height: 512 })));
      HTMLCanvasElement.prototype.getContext = vi.fn(() => ({ drawImage: vi.fn() })) as never;
      HTMLCanvasElement.prototype.toDataURL = vi.fn(function (this: HTMLCanvasElement) { return `data:image/jpeg;base64,${this.width}x${this.height}`; }) as never;
    });
    it("toAvatarDataUrl shrinks the longest side to 256px as JPEG", async () => {
      expect(await toAvatarDataUrl(new File(["x"], "me.png", { type: "image/png" }))).toBe("data:image/jpeg;base64,256x128");
    });
    it("toAvatarDataUrl keeps small images at their size", async () => {
      vi.stubGlobal("createImageBitmap", vi.fn(async () => ({ width: 100, height: 80 })));
      expect(await toAvatarDataUrl(new File(["x"], "me.webp", { type: "image/webp" }))).toBe("data:image/jpeg;base64,100x80");
    });
    it("toAvatarDataUrl rejects other file types", async () => {
      await expect(toAvatarDataUrl(new File(["x"], "me.gif", { type: "image/gif" }))).rejects.toThrow("Choose a PNG, JPEG or WebP image");
    });
    it("uploading saves the resized photo and shows it; remove clears it", async () => {
      const f = server({ put: [
        { status: 200, body: profile({ avatar: "data:image/jpeg;base64,256x128" }) },
        { status: 200, body: profile({ avatar: null }) },
      ] });
      render(<ProfileView now={NOW} />);
      const input = (await screen.findByText("Change photo")).querySelector("input")!;
      fireEvent.change(input, { target: { files: [new File(["x"], "me.png", { type: "image/png" })] } });
      expect(await screen.findByRole("img", { name: "Your profile photo" })).toHaveAttribute("src", "data:image/jpeg;base64,256x128");
      expect(screen.getByText("Photo updated.")).toBeInTheDocument();
      expect(putBody(f)).toEqual({ avatar: "data:image/jpeg;base64,256x128" });
      fireEvent.click(screen.getByRole("button", { name: "Remove photo" }));
      await waitFor(() => expect(screen.queryByRole("img", { name: "Your profile photo" })).toBeNull());
    });
    it("a wrong file type shows an error and isn't sent", async () => {
      const f = server();
      render(<ProfileView now={NOW} />);
      const input = (await screen.findByText("Change photo")).querySelector("input")!;
      fireEvent.change(input, { target: { files: [new File(["x"], "me.gif", { type: "image/gif" })] } });
      expect(await screen.findByRole("alert")).toHaveTextContent("Choose a PNG, JPEG or WebP image");
      expect(f.mock.calls.some((c) => (c[1] as RequestInit | undefined)?.method === "PUT")).toBe(false);
    });
    it("cancelling the file picker does nothing", async () => {
      const f = server();
      render(<ProfileView now={NOW} />);
      const input = (await screen.findByText("Change photo")).querySelector("input")!;
      fireEvent.change(input, { target: { files: [] } });
      expect(f.mock.calls.some((c) => (c[1] as RequestInit | undefined)?.method === "PUT")).toBe(false);
    });
  });
  it("top level shows no XP-to-next line", async () => {
    const top = passport();
    top.level = { ...top.level, level: 7, title: "Legend", xp: 30000, nextLevelXp: null, progressToNext: 1 };
    vi.stubGlobal("fetch", vi.fn(async (url: string) => new Response(JSON.stringify(url === "/api/passport" ? top : url === "/api/profile" ? profile() : { bookings: [] }))));
    render(<ProfileView now={NOW} />);
    expect(await screen.findByText("Top level reached.")).toBeInTheDocument();
  });
  it("calendar placeholder while it loads", () => {
    render(<CalendarLoading />);
    expect(screen.getByRole("status")).toHaveTextContent("Loading your calendar");
  });
  it("load error", async () => {
    server({ fail: true });
    render(<ProfileView />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't load your dashboard");
  });
});
