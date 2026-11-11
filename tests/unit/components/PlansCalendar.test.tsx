import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { routerPush } from "../../helpers/setup";

const seen = vi.hoisted(() => ({ props: null as null | Record<string, unknown> }));
vi.mock("@bryntum/calendar-react", () => ({
  BryntumCalendar: (props: Record<string, unknown>) => {
    seen.props = props;
    return <button onClick={() => (props.onEventClick as (e: unknown) => void)({ eventRecord: { id: "b1" } })}>event</button>;
  },
}));
vi.mock("@bryntum/calendar/calendar.css", () => ({}));
vi.mock("@bryntum/calendar/svalbard-light.css", () => ({}));
vi.mock("@bryntum/calendar/fontawesome/css/fontawesome.css", () => ({}));
vi.mock("@bryntum/calendar/fontawesome/css/solid.css", () => ({}));
const { default: PlansCalendar } = await import("@/components/PlansCalendar");

const NOW = new Date("2026-11-11T20:00:00Z");
const bk = (id: string, startsAt: string, status: string, name = id) => ({ id, name, startsAt, status, kind: "partner", itemId: "x", partySize: 2, amount: "1", currency: "USD", paypalOrderId: "O", holdExpiresAt: null, createdAt: "x", checkedInAt: null, city: "Miami" });

describe("PlansCalendar", () => {
  it("passes bookings as 2-hour events coloured by status, opens on the next upcoming one, read-only month view", () => {
    render(<PlansCalendar now={NOW} bookings={[
      bk("past", "2026-11-01T02:00:00.000Z", "confirmed", "Old"),
      bk("b1", "2026-11-20T02:00:00.000Z", "held", "Spa"),
      bk("b2", "2026-11-15T02:00:00.000Z", "confirmed", "Dinner"),
      bk("b3", "2026-11-16T02:00:00.000Z", "declined", "Nope"),
      bk("b4", "2026-11-17T02:00:00.000Z", "failed", "Broke"),
    ] as never} />);
    const p = seen.props!;
    expect(p).toMatchObject({ mode: "month", readOnly: true, sidebar: false });
    expect((p.date as Date).toISOString()).toBe("2026-11-15T02:00:00.000Z");
    expect(p.events).toEqual([
      { id: "past", name: "Old", startDate: new Date("2026-11-01T02:00:00.000Z"), endDate: new Date("2026-11-01T04:00:00.000Z"), eventColor: "blue" },
      { id: "b1", name: "Spa (on hold)", startDate: new Date("2026-11-20T02:00:00.000Z"), endDate: new Date("2026-11-20T04:00:00.000Z"), eventColor: "orange" },
      { id: "b2", name: "Dinner", startDate: new Date("2026-11-15T02:00:00.000Z"), endDate: new Date("2026-11-15T04:00:00.000Z"), eventColor: "blue" },
      { id: "b3", name: "Nope (released)", startDate: new Date("2026-11-16T02:00:00.000Z"), endDate: new Date("2026-11-16T04:00:00.000Z"), eventColor: "gray" },
      { id: "b4", name: "Broke (failed)", startDate: new Date("2026-11-17T02:00:00.000Z"), endDate: new Date("2026-11-17T04:00:00.000Z"), eventColor: "gray" },
    ]);
    fireEvent.click(screen.getByRole("button", { name: "event" }));
    expect(routerPush).toHaveBeenCalledWith("/booking/b1");
    expect(screen.getByLabelText("My plans calendar")).toBeInTheDocument();
  });
  it("with nothing upcoming, opens on today", () => {
    render(<PlansCalendar now={NOW} bookings={[]} />);
    expect(seen.props!.date).toBe(NOW);
  });
});
