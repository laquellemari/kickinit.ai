import { vi } from "vitest";
import type { ReactNode } from "react";

/** Stand-in for PayPal's buttons: clicking runs createOrder, then onApprove with that order id (like a real approval). */
type PayPalReactState = { options: unknown; approve: boolean };
const g = globalThis as unknown as { __paypalReact?: PayPalReactState };
export const paypalReact: PayPalReactState = (g.__paypalReact ??= { options: null, approve: true });

vi.mock("@paypal/react-paypal-js", () => ({
  PayPalScriptProvider: ({ children, options }: { children: ReactNode; options: unknown }) => {
    (globalThis as unknown as { __paypalReact: PayPalReactState }).__paypalReact.options = options;
    return <>{children}</>;
  },
  PayPalButtons: (p: { createOrder: () => Promise<string>; onApprove: (d: { orderID: string }) => Promise<void>; onError: (e: unknown) => void }) => (
    <button
      type="button"
      onClick={async () => {
        try {
          const id = await p.createOrder();
          if ((globalThis as unknown as { __paypalReact: PayPalReactState }).__paypalReact.approve) await p.onApprove({ orderID: id });
          else p.onError(new Error("popup closed with error"));
        } catch {
          /* PayPal swallows createOrder errors and shows its own state */
        }
      }}
    >
      PayPal
    </button>
  ),
}));
