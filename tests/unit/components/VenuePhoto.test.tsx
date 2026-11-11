import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { VenuePhoto } from "@/components/VenuePhoto";

const mock = (status: number, body: unknown) => { const f = vi.fn(async () => new Response(JSON.stringify(body), { status })); vi.stubGlobal("fetch", f); return f; };
afterEach(() => vi.unstubAllGlobals());

describe("VenuePhoto", () => {
  it("loads the venue's photo with a linked photographer credit and Google Maps", async () => {
    const f = mock(200, { uri: "https://lh3/p.jpg", author: "Ana R", authorUri: "https://maps/contrib/1" });
    render(<VenuePhoto placeId="ChIJ/1" alt="Bestia" height={200}><span>STAMP</span></VenuePhoto>);
    expect(await screen.findByRole("img", { name: "Bestia" })).toHaveAttribute("src", "https://lh3/p.jpg");
    expect(screen.getByRole("link", { name: "Ana R" })).toHaveAttribute("href", "https://maps/contrib/1");
    expect(screen.getByText(/Photo:/)).toHaveTextContent("Photo: Ana R · Google Maps");
    expect(screen.getByText("STAMP")).toBeInTheDocument();
    expect(f).toHaveBeenCalledWith("/api/places/photo/ChIJ%2F1");
  });
  it("credit without a link is plain text", async () => {
    mock(200, { uri: "https://lh3/p.jpg", author: "Ana R", authorUri: null });
    render(<VenuePhoto placeId="A" alt="x" height={100} />);
    expect(await screen.findByText(/Photo:/)).toHaveTextContent("Photo: Ana R · Google Maps");
    expect(screen.queryByRole("link")).toBeNull();
  });
  it("no author: credits Google Maps", async () => {
    mock(200, { uri: "https://lh3/p.jpg", author: null, authorUri: null });
    render(<VenuePhoto placeId="A" alt="x" height={100} />);
    expect(await screen.findByText(/Photo:/)).toHaveTextContent(/^Photo: Google Maps$/);
  });
  it.each([[404, { error: "No photo" }], [429, {}]])("HTTP %i: keeps the colour tile, no image, no credit", async (status, body) => {
    const f = mock(status, body);
    const { container } = render(<VenuePhoto placeId="A" alt="x" height={120} bg="#123456" />);
    await waitFor(() => expect(f).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.queryByText(/Photo:/)).toBeNull();
    expect(container.firstChild).toHaveStyle({ height: "120px", background: "#123456" });
  });
  it("network failure is swallowed", async () => {
    const f = vi.fn(async () => { throw new TypeError("offline"); });
    vi.stubGlobal("fetch", f);
    render(<VenuePhoto placeId="A" alt="x" height={100} />);
    await waitFor(() => expect(f).toHaveBeenCalled());
    expect(screen.queryByRole("img")).toBeNull();
  });
  it("no place id: no request, default tile colour", () => {
    const f = mock(200, {});
    const { container } = render(<VenuePhoto alt="x" height={90} />);
    expect(f).not.toHaveBeenCalled();
    expect(container.firstChild).toHaveStyle({ background: "#E6EDF3" });
  });
  it("a response that lands after unmount is ignored", async () => {
    let resolve!: (r: Response) => void;
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((r) => { resolve = r; })));
    const { unmount } = render(<VenuePhoto placeId="A" alt="x" height={100} />);
    unmount();
    resolve(new Response(JSON.stringify({ uri: "u", author: null, authorUri: null })));
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByRole("img")).toBeNull();
  });
  it("changing venue clears the old photo and loads the new one", async () => {
    const f = vi.fn(async (url: string) => new Response(JSON.stringify({ uri: url.endsWith("A") ? "https/a" : "https/b", author: null, authorUri: null })));
    vi.stubGlobal("fetch", f);
    const { rerender } = render(<VenuePhoto placeId="A" alt="x" height={100} />);
    expect(await screen.findByRole("img")).toHaveAttribute("src", "https/a");
    rerender(<VenuePhoto placeId="B" alt="x" height={100} />);
    await waitFor(() => expect(screen.getByRole("img")).toHaveAttribute("src", "https/b"));
  });
});
