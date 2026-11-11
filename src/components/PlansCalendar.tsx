"use client";

import "@bryntum/calendar/calendar.css";
import "@bryntum/calendar/svalbard-light.css";
import "@bryntum/calendar/fontawesome/css/fontawesome.css";
import "@bryntum/calendar/fontawesome/css/solid.css";
import { BryntumCalendar } from "@bryntum/calendar-react";
import { useRouter } from "next/navigation";
import type { PublicBooking } from "@/lib/bookings/public";

const COLOR: Record<PublicBooking["status"], string> = { confirmed: "blue", held: "orange", declined: "gray", failed: "gray" };
const SUFFIX: Record<PublicBooking["status"], string> = { confirmed: "", held: " (on hold)", declined: " (released)", failed: " (failed)" };

/** "My plans": every booking on a Bryntum month calendar. Click one to open it. */
export default function PlansCalendar({ bookings, now }: { bookings: PublicBooking[]; now: Date }) {
  const router = useRouter();
  const events = bookings.map((b) => ({
    id: b.id,
    name: `${b.name}${SUFFIX[b.status]}`,
    startDate: new Date(b.startsAt),
    endDate: new Date(new Date(b.startsAt).getTime() + 2 * 3_600_000),
    eventColor: COLOR[b.status],
  }));
  const next = bookings.map((b) => new Date(b.startsAt)).filter((d) => d >= now).sort((a, b) => a.getTime() - b.getTime())[0];
  return (
    <div style={{ height: 620 }} aria-label="My plans calendar">
      <BryntumCalendar
        date={next ?? now}
        mode="month"
        readOnly
        sidebar={false}
        events={events}
        onEventClick={({ eventRecord }: { eventRecord: { id: string | number } }) => router.push(`/booking/${eventRecord.id}`)}
      />
    </div>
  );
}
