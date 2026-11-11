// @vitest-environment node
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { GET } from "@/app/api/gifts/mine/route";
import { insertGift, insertContribution, setContributionStatus } from "@/lib/gifts/repo";
import { useTestDb } from "../../helpers/db";
import { createNewGift, createNewContribution } from "../../helpers/factories";

const ME = "11111111-1111-4111-8111-111111111111";
let t: Awaited<ReturnType<typeof useTestDb>>;
beforeAll(async () => { t = await useTestDb(); });
beforeEach(async () => { await t.reset(); });

describe("GET /api/gifts/mine", () => {
  it("my gifts with how much is raised, and what I chipped in to", async () => {
    const mine = await insertGift(createNewGift({ organizerId: ME }));
    await insertContribution(createNewContribution(mine.id, { amountCents: 4000 }));
    const v = await insertContribution(createNewContribution(mine.id, { amountCents: 1000 }));
    await setContributionStatus(v.id, "held", "voided");
    const theirs = await insertGift(createNewGift({ organizerId: "someone", recipientName: "Ben", name: "Blue Room" }));
    await insertContribution(createNewContribution(theirs.id, { contributorId: ME, amountCents: 2500 }));
    const res = await GET(new Request("http://x", { headers: { cookie: `kid=${ME}` } }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      organized: [{ id: mine.id, name: "Hugh Spa", recipientName: "Mom", status: "open", mode: "pool", amount: "190.00", raised: "40.00" }],
      chippedIn: [{ giftId: theirs.id, giftName: "Blue Room", recipientName: "Ben", amount: "25.00", status: "held", giftStatus: "open" }],
    });
  });
  it("401 without a visitor", async () => {
    expect((await GET(new Request("http://x"))).status).toBe(401);
  });
});
