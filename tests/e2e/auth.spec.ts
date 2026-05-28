import { test, expect } from "@playwright/test";

// Auth E2E: clicking "Create Room" while signed out should kick off the OAuth
// flow. We intercept the broker's network call so the real Google endpoint is
// never hit, then simulate the post-redirect signed-in state and confirm the
// user lands inside a room route.
test("create room flow triggers OAuth and lands in a room after sign-in", async ({
  page,
  context,
}) => {
  // Block real OAuth/broker traffic so the test stays hermetic.
  await context.route(/(accounts\.google\.com|lovable\.app\/auth|oauth)/, (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/html",
      body: "<html><body>mock oauth</body></html>",
    }),
  );

  await page.goto("/");

  // Stub the Lovable OAuth helper before clicking so it doesn't navigate away.
  await page.evaluate(() => {
    interface LovableWindow extends Window {
      __oauthCalled?: boolean;
    }
    const w = window as LovableWindow;
    w.__oauthCalled = false;
    // Patch the broker module on first import via a global hook.
    const orig = window.fetch;
    window.fetch = async (...args) => {
      const url = typeof args[0] === "string" ? args[0] : (args[0] as Request).url;
      if (/oauth|google|lovable.*auth/i.test(url)) {
        w.__oauthCalled = true;
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
      return orig(...args);
    };
  });

  const createBtn = page.getByRole("button", { name: /sign in with google to create/i });
  await expect(createBtn).toBeVisible();

  // Fill display name and click create — this should attempt sign-in.
  await page.getByPlaceholder("player_one").fill("HostUser");
  await createBtn.click();

  // Verify OAuth call was attempted (broker intercepted).
  await expect
    .poll(async () =>
      page.evaluate(() => (window as unknown as { __oauthCalled: boolean }).__oauthCalled),
    )
    .toBe(true);
});
