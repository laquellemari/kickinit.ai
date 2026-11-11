import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import PlanPage from "@/app/plan/page";

afterEach(() => vi.unstubAllGlobals());
const renderPage = async (sp: Record<string, string | string[] | undefined>) => render(await PlanPage({ searchParams: Promise.resolve(sp) }));

describe("/plan page", () => {
  it("reads q, mode and where from the URL", async () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    await renderPage({ q: " jazz tonight ", mode: "them", where: "San Diego" });
    expect(screen.getByText("“jazz tonight”")).toBeInTheDocument();
    expect(screen.getByText("For them · San Diego")).toBeInTheDocument();
  });
  it("defaults mode to you and where to Los Angeles; any other mode is treated as you", async () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    await renderPage({ q: "x", mode: "admin" });
    expect(screen.getByText("For you · Los Angeles")).toBeInTheDocument();
  });
  it("uses the first value when a param repeats, and handles no params", async () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    await renderPage({ q: ["first", "second"], where: ["Austin"] });
    expect(screen.getByText("“first”")).toBeInTheDocument();
    expect(screen.getByText("For you · Austin")).toBeInTheDocument();
  });
  it("boundary: trims an over-long request to 1,000 characters", async () => {
    const f = vi.fn(() => new Promise(() => {}));
    vi.stubGlobal("fetch", f);
    await renderPage({ q: "x".repeat(1500) });
    const body = JSON.parse((f.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body.message).toHaveLength(1000);
  });
  it("no params: empty state", async () => {
    await renderPage({});
    expect(screen.getByRole("link", { name: "home page" })).toBeInTheDocument();
  });
});
