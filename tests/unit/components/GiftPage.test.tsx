import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { paypalReact } from "../../helpers/paypal-react";
import { GiftPage } from "@/components/GiftPage";

const view = (o: Record<string, unknown> = {}) => ({
  id: "g1", experienceId: "hugh-spa", name: "Hugh Spa", partySize: 2, mode: "pool", status: "open",
  amount: "190.00", raised: "50.00", remaining: "140.00", minContribution: "5.00", maxContribution: "140.00", currency: "USD",
  recipientName: "Mom", organizerName: "Kavon", note: "Happy 60th", deadline: "2026-11-15T05:00:00.000Z",
  contributors: [{ name: "Ana", amount: "50.00" }], isOrganizer: false, redeemCode: null, ...o,
});
type Reply = { status: number; body: unknown };
/** Replies in order for app calls; /api/addons always answers with none (covered in AddOns tests). */
function mockApi(...replies: Reply[]) {
  const all = vi.fn(async (url: string) => {
    if (url.startsWith("/api/addons")) return new Response(JSON.stringify({ addOns: [] }));
    const r = replies.shift()!;
    return new Response(JSON.stringify(r.body), { status: r.status });
  });
  vi.stubGlobal("fetch", all);
  return { mock: { get calls() { return all.mock.calls.filter((c) => !(c[0] as string).startsWith("/api/addons")); } } } as unknown as ReturnType<typeof vi.fn>;
}
const call = (f: ReturnType<typeof vi.fn>, n: number) => {
  const [url, init] = f.mock.calls[n] as unknown as [string, RequestInit | undefined];
  return { url, body: init?.body ? JSON.parse(init.body as string) : undefined };
};
const page = (o: { clientId?: string } = {}) => render(<GiftPage id="g1" clientId={o.clientId ?? "cid"} origin="https://kickinit.test" />);
const chipIn = (name = "Ben", amount = "40") => {
  fireEvent.change(screen.getByLabelText("Your name"), { target: { value: name } });
  fireEvent.change(screen.getByLabelText("Amount (USD)"), { target: { value: amount } });
};

beforeEach(() => { paypalReact.approve = true; });
afterEach(() => vi.unstubAllGlobals());

describe("GiftPage", () => {
  it("shows the gift, progress, contributors and the chip-in panel", async () => {
    mockApi({ status: 200, body: view() });
    page();
    expect(screen.getByRole("status")).toHaveTextContent("Loading the gift");
    expect(await screen.findByRole("heading", { name: "A gift for Mom" })).toBeInTheDocument();
    expect(screen.getByText("Hugh Spa · 2 guests · from Kavon")).toBeInTheDocument();
    expect(screen.getByText("“Happy 60th”")).toBeInTheDocument();
    expect(screen.getByTestId("raised")).toHaveTextContent("$50");
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "26");
    expect(within(screen.getByRole("list", { name: "Contributors" })).getByText("Ana")).toBeInTheDocument();
    expect(screen.getByText("Between $5 and $140")).toBeInTheDocument();
    expect(screen.getByText(/closes Nov/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Share this link/)).toBeNull();
  });
  it("chipping in: order for the amount, then the contribution, then the page updates", async () => {
    const f = mockApi(
      { status: 200, body: view() },
      { status: 201, body: { id: "GO1", amount: "40.00" } },
      { status: 201, body: view({ raised: "90.00", contributors: [{ name: "Ana", amount: "50.00" }, { name: "Ben", amount: "40.00" }] }) },
    );
    page();
    await screen.findByLabelText("Your name");
    expect(screen.getByText("Add your name and an amount to continue.")).toBeInTheDocument();
    chipIn();
    fireEvent.click(screen.getByRole("button", { name: "PayPal" }));
    await waitFor(() => expect(screen.getByTestId("raised")).toHaveTextContent("$90"));
    expect(call(f, 1)).toEqual({ url: "/api/paypal/orders", body: { kind: "gift", giftId: "g1", amount: "40" } });
    expect(call(f, 2)).toEqual({ url: "/api/gifts/g1/contributions", body: { orderId: "GO1", name: "Ben" } });
    expect((screen.getByLabelText("Amount (USD)") as HTMLInputElement).value).toBe("");
  });
  it("solo: the full amount is prefilled and locked", async () => {
    mockApi({ status: 200, body: view({ mode: "solo", raised: "0.00", minContribution: "190.00", maxContribution: "190.00", contributors: [] }) });
    page();
    const amount = (await screen.findByLabelText("Amount (USD)")) as HTMLInputElement;
    expect(amount.value).toBe("190.00");
    expect(amount.readOnly).toBe(true);
    expect(screen.getByText("$190 in full")).toBeInTheDocument();
    expect(screen.getByText("Pay for the gift")).toBeInTheDocument();
  });
  it("solo paid: the next solo amount resets to what's left", async () => {
    mockApi(
      { status: 200, body: view({ mode: "solo", raised: "0.00", minContribution: "190.00", maxContribution: "190.00", contributors: [] }) },
      { status: 201, body: { id: "GO1" } },
      { status: 201, body: view({ mode: "solo", status: "open", raised: "0.00", minContribution: "190.00", maxContribution: "190.00", contributors: [] }) },
    );
    page();
    fireEvent.change(await screen.findByLabelText("Your name"), { target: { value: "Kavon" } });
    fireEvent.click(screen.getByRole("button", { name: "PayPal" }));
    await waitFor(() => expect((screen.getByLabelText("Amount (USD)") as HTMLInputElement).value).toBe("190.00"));
  });
  describe("validation: no PayPal button until name and a valid amount", () => {
    it.each([["below min", "4.99"], ["above max", "140.01"], ["not a number", "abc"], ["3 decimals", "5.001"]])("%s", async (_l, amount) => {
      mockApi({ status: 200, body: view() });
      page();
      await screen.findByLabelText("Your name");
      chipIn("Ben", amount);
      expect(screen.queryByRole("button", { name: "PayPal" })).toBeNull();
    });
    it("blank name", async () => {
      mockApi({ status: 200, body: view() });
      page();
      await screen.findByLabelText("Your name");
      chipIn("  ", "40");
      expect(screen.queryByRole("button", { name: "PayPal" })).toBeNull();
    });
    it("boundary: exactly min and exactly max work", async () => {
      mockApi({ status: 200, body: view() });
      page();
      await screen.findByLabelText("Your name");
      chipIn("Ben", "5");
      expect(screen.getByRole("button", { name: "PayPal" })).toBeInTheDocument();
      chipIn("Ben", "140.00");
      expect(screen.getByRole("button", { name: "PayPal" })).toBeInTheDocument();
    });
  });
  describe("organizer", () => {
    it("open pool: sees the share link and can copy it", async () => {
      const write = vi.fn(async () => {});
      Object.assign(navigator, { clipboard: { writeText: write } });
      mockApi({ status: 200, body: view({ isOrganizer: true }) });
      page();
      const box = await screen.findByLabelText("Share this link so friends can chip in");
      expect(box).toHaveValue("https://kickinit.test/gift/g1");
      fireEvent.focus(box);
      fireEvent.click(screen.getByRole("button", { name: "Copy" }));
      await waitFor(() => expect(screen.getByRole("button", { name: "Copied" })).toBeInTheDocument());
      expect(write).toHaveBeenCalledWith("https://kickinit.test/gift/g1");
    });
    it("copy failure leaves the button as Copy", async () => {
      Object.assign(navigator, { clipboard: { writeText: vi.fn(async () => { throw new Error("denied"); }) } });
      mockApi({ status: 200, body: view({ isOrganizer: true }) });
      page();
      await screen.findByLabelText("Share this link so friends can chip in");
      fireEvent.click(screen.getByRole("button", { name: "Copy" }));
      await waitFor(() => expect(screen.getByRole("button", { name: "Copy" })).toBeInTheDocument());
    });
    it.each(["funded", "redeemed"])("%s: sees the redeem link to send", async (status) => {
      mockApi({ status: 200, body: view({ isOrganizer: true, status, redeemCode: "CODE1234567890123456789" }) });
      page();
      expect(await screen.findByLabelText("Send this to Mom to redeem")).toHaveValue("https://kickinit.test/gift/redeem/CODE1234567890123456789");
      expect(screen.queryByRole("complementary", { name: "Chip in" })).toBeNull();
    });
    it("solo gifts don't show a share link", async () => {
      mockApi({ status: 200, body: view({ isOrganizer: true, mode: "solo" }) });
      page();
      await screen.findByRole("heading", { name: "A gift for Mom" });
      expect(screen.queryByLabelText(/Share this link/)).toBeNull();
    });
  });
  it.each([
    ["funded", "Fully funded."],
    ["redeemed", "They've redeemed it"],
    ["expired", "every hold was released. Nobody was charged."],
  ])("%s gifts explain themselves and hide chip-in", async (status, text) => {
    mockApi({ status: 200, body: view({ status }) });
    page();
    expect(await screen.findByText(text, { exact: false })).toBeInTheDocument();
    expect(screen.queryByLabelText("Your name")).toBeNull();
  });
  it("no note and no contributors: those sections are hidden", async () => {
    mockApi({ status: 200, body: view({ note: "", contributors: [] }) });
    page();
    await screen.findByRole("heading", { name: "A gift for Mom" });
    expect(screen.queryByRole("list", { name: "Contributors" })).toBeNull();
  });
  describe("errors", () => {
    it("gift not found", async () => {
      mockApi({ status: 404, body: { error: "Gift not found" } });
      page();
      expect(await screen.findByRole("alert")).toHaveTextContent("Gift not found");
    });
    it("load failure with no message", async () => {
      mockApi({ status: 500, body: {} });
      page();
      expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't load this gift.");
    });
    it("order refused (e.g. pool just filled)", async () => {
      mockApi({ status: 200, body: view() }, { status: 409, body: { error: "This gift isn't taking contributions anymore" } });
      page();
      await screen.findByLabelText("Your name");
      chipIn();
      fireEvent.click(screen.getByRole("button", { name: "PayPal" }));
      expect(await screen.findByRole("alert")).toHaveTextContent("isn't taking contributions");
    });
    it("order refused with no message", async () => {
      mockApi({ status: 200, body: view() }, { status: 500, body: {} });
      page();
      await screen.findByLabelText("Your name");
      chipIn();
      fireEvent.click(screen.getByRole("button", { name: "PayPal" }));
      expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't start the payment.");
    });
    it("contribution failed", async () => {
      mockApi({ status: 200, body: view() }, { status: 201, body: { id: "O" } }, { status: 400, body: { error: "Chip in between $5.00 and $10.00" } });
      page();
      await screen.findByLabelText("Your name");
      chipIn();
      fireEvent.click(screen.getByRole("button", { name: "PayPal" }));
      expect(await screen.findByRole("alert")).toHaveTextContent("Chip in between $5.00 and $10.00");
    });
    it("contribution failed with no message", async () => {
      mockApi({ status: 200, body: view() }, { status: 201, body: { id: "O" } }, { status: 500, body: {} });
      page();
      await screen.findByLabelText("Your name");
      chipIn();
      fireEvent.click(screen.getByRole("button", { name: "PayPal" }));
      expect(await screen.findByRole("alert")).toHaveTextContent("Nothing was charged");
    });
    it("PayPal error", async () => {
      paypalReact.approve = false;
      mockApi({ status: 200, body: view() }, { status: 201, body: { id: "O" } });
      page();
      await screen.findByLabelText("Your name");
      chipIn();
      fireEvent.click(screen.getByRole("button", { name: "PayPal" }));
      expect(await screen.findByRole("alert")).toHaveTextContent("PayPal ran into a problem");
    });
    it("no PayPal client id", async () => {
      mockApi({ status: 200, body: view() });
      page({ clientId: "" });
      expect(await screen.findByText("Payments aren’t set up yet.")).toBeInTheDocument();
    });
  });
  it("shows progress while adding your share", async () => {
    let release!: (r: Response) => void;
    const queue: (() => Promise<Response>)[] = [
      async () => new Response(JSON.stringify(view()), { status: 200 }),
      async () => new Response(JSON.stringify({ id: "O" }), { status: 201 }),
      () => new Promise<Response>((r) => { release = r; }),
    ];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => (url.startsWith("/api/addons") ? new Response(JSON.stringify({ addOns: [] })) : queue.shift()!())));
    page();
    await screen.findByLabelText("Your name");
    chipIn();
    fireEvent.click(screen.getByRole("button", { name: "PayPal" }));
    expect(await screen.findByText(/Adding your share/)).toBeInTheDocument();
    release(new Response(JSON.stringify(view({ raised: "90.00" })), { status: 201 }));
    await waitFor(() => expect(screen.getByTestId("raised")).toHaveTextContent("$90"));
  });
});
