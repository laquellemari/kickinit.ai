
## Issue: Concierge 502 "`temperature` is deprecated for this model"
AI SDK v4 always sends temperature (default 0); current Claude models reject it. Fix: `stripTemperature` middleware in `src/lib/concierge/runtime.ts`, covered by a test that inspects the real request body.
