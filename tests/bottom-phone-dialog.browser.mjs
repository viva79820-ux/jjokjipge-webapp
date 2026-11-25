// Isolated fixture only. No real Supabase credentials or resources.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawnSync } from "node:child_process";
import { rmSync } from "node:fs";
import {
  browser,
  delay,
  server,
  stop,
  until,
} from "./notices-browser-tools.mjs";

const stores = [
  {
    slug: "store-own",
    name: "자체번호 매장",
    address: "대구 중구 동성로 1",
    hours: "매일 10:00~20:00",
    description: "",
    phone: "053-000-1111",
    image_path: null,
  },
  {
    slug: "store-empty",
    name: "번호없는 매장",
    address: "",
    hours: "",
    description: "",
    phone: "",
    image_path: null,
  },
];
const json = (res, body, status = 200) => {
  res.writeHead(status, {
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "*",
    "content-type": "application/json",
  });
  res.end(body === undefined ? "" : JSON.stringify(body));
};
const fixture = createServer((req, res) => {
  const url = new URL(req.url || "/", "http://fixture.invalid");
  if (req.method === "OPTIONS") {
    json(res, undefined, 204);
    return;
  }
  req.resume();
  if (url.pathname.startsWith("/auth/")) {
    json(res, { message: "no session" }, 401);
    return;
  }
  const table = url.pathname.split("/").at(-1);
  const object = req.headers.accept?.includes("object+json");
  if (table === "stores") {
    json(res, object ? stores[0] : stores);
    return;
  }
  json(res, object ? null : []);
});
await new Promise((done) => fixture.listen(0, "127.0.0.1", done));
const fakeUrl = `http://127.0.0.1:${fixture.address().port}`;
const port = 4371;
const base = `http://127.0.0.1:${port}`;
const env = {
  ...process.env,
  CI: "1",
  NEXT_TELEMETRY_DISABLED: "1",
  NEXT_PUBLIC_SUPABASE_URL: fakeUrl,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "fixture-public-key",
  SUPABASE_SECRET_KEY: "fixture-server-key",
};
let app;
let chrome;
try {
  rmSync(".next", { recursive: true, force: true });
  const build = spawnSync(
    process.execPath,
    ["node_modules/next/dist/bin/next", "build"],
    { env, encoding: "utf8", windowsHide: true },
  );
  assert.equal(
    build.status,
    0,
    `next build failed\n${build.stdout || ""}\n${build.stderr || ""}`,
  );
  app = server(port, env);
  await until(async () => {
    try {
      return (await fetch(base)).ok;
    } catch {
      return false;
    }
  }, "production server");
  chrome = await browser();
  const evaluate = (expression) => chrome.evaluate(expression);
  const go = async (path) => {
    await chrome.go(`${base}${path}`);
  };
  const emulate = async ({ width, height, fine }) => {
    await chrome.call("Emulation.setDeviceMetricsOverride", {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: !fine,
    });
    await chrome.call("Emulation.setTouchEmulationEnabled", {
      enabled: !fine,
      maxTouchPoints: fine ? 1 : 5,
    });
    await chrome.call("Emulation.setEmulatedMedia", {
      media: "screen",
      features: fine
        ? [
            { name: "hover", value: "hover" },
            { name: "pointer", value: "fine" },
          ]
        : [
            { name: "hover", value: "none" },
            { name: "pointer", value: "coarse" },
          ],
    });
    await delay(200);
  };
  const press = async (key, code, windowsVirtualKeyCode) => {
    const event = {
      key,
      code,
      windowsVirtualKeyCode,
      nativeVirtualKeyCode: windowsVirtualKeyCode,
    };
    await chrome.call("Input.dispatchKeyEvent", {
      type: "keyDown",
      ...event,
      ...(key === "Enter" ? { text: "\r", unmodifiedText: "\r" } : {}),
    });
    await chrome.call("Input.dispatchKeyEvent", { type: "keyUp", ...event });
  };
  const waitPhone = () =>
    until(
      () =>
        evaluate(
          "!!document.querySelector('[data-app-bar][data-bottom-tabs-ready=\"yes\"] #bottom-phone-call')",
        ),
      "phone button",
    );
  const openDialog = async (fine) => {
    const before = await evaluate("location.pathname");
    await chrome.call("Page.bringToFront");
    if (fine) {
      await evaluate("document.getElementById('bottom-phone-call').focus()");
      assert.equal(
        await evaluate("document.activeElement.id"),
        "bottom-phone-call",
      );
      await press("Enter", "Enter", 13);
    } else {
      const box = await evaluate(`(() => {
        const rect = document.getElementById("bottom-phone-call").getBoundingClientRect();
        return {
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2,
        };
      })()`);
      await chrome.call("Input.dispatchMouseEvent", {
        type: "mousePressed",
        x: box.x,
        y: box.y,
        button: "left",
        clickCount: 1,
      });
      await chrome.call("Input.dispatchMouseEvent", {
        type: "mouseReleased",
        x: box.x,
        y: box.y,
        button: "left",
        clickCount: 1,
      });
    }
    await until(
      () => evaluate("!!document.querySelector('dialog[open]')"),
      "phone dialog",
    );
    assert.equal(await evaluate("location.pathname"), before);
    assert.equal(
      await evaluate(
        'document.querySelectorAll(\'nav[aria-label="하단 메뉴"] a[href^="tel:"]\').length',
      ),
      0,
    );
    assert.equal(
      await evaluate(
        "document.activeElement.closest('dialog') === document.querySelector('dialog[open]')",
      ),
      true,
    );
  };
  const dialogState = () =>
    evaluate(`(() => {
      const dialog = document.querySelector("dialog[open]");
      if (!dialog) return { open: false };
      const box = dialog.getBoundingClientRect();
      const link = dialog.querySelector("a");
      const controls = [...dialog.querySelectorAll("button, a")].map((node) => {
        const control = node.getBoundingClientRect();
        return {
          text: node.textContent.trim(),
          href: node.getAttribute("href"),
          height: control.height,
          left: control.left,
          right: control.right,
        };
      });
      const navTels = document.querySelectorAll(
        'nav[aria-label="하단 메뉴"] a[href^="tel:"]',
      ).length;
      return {
        open: true,
        title: dialog.querySelector("h2")?.textContent.trim() ?? "",
        body: dialog.querySelector("p")?.textContent.trim() ?? "",
        href: link?.getAttribute("href") ?? "",
        controls,
        navTels,
        overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
        inside:
          box.left >= -1 &&
          box.right <= window.innerWidth + 1 &&
          box.top >= -1 &&
          box.bottom <= window.innerHeight + 1,
        app: Math.round(
          document.querySelector("[data-app-shell]").getBoundingClientRect().width,
        ),
        fine: matchMedia("(hover: hover) and (pointer: fine)").matches,
      };
    })()`);
  const phoneShape = () =>
    evaluate(`(() => {
      const bar = document.querySelector('[data-app-bar]');
      const button = document.getElementById("bottom-phone-call");
      const circle = button.querySelector("span");
      const barBox = bar.getBoundingClientRect();
      const circleBox = circle.getBoundingClientRect();
      return {
        tag: button.tagName,
        href: button.getAttribute("href"),
        expanded: button.getAttribute("aria-expanded"),
        width: Math.round(circleBox.width),
        raised: Math.round(barBox.top - circleBox.top),
        overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
        labels: [...bar.children].map(
          (node) => node.querySelectorAll("span")[1]?.textContent.trim() ?? "",
        ),
        hrefs: [...bar.querySelectorAll("a")].map((link) => link.getAttribute("href")),
      };
    })()`);
  const assertDialog = (state) => {
    assert.equal(state.open, true);
    assert.equal(state.title, "쪽집게천사에 전화하기");
    assert.equal(state.body, "0507-1498-0232");
    assert.equal(state.href, "tel:050714980232");
    assert.equal(state.navTels, 0);
    assert.equal(state.overflow, false);
    assert.equal(state.inside, true);
    assert.deepEqual(
      state.controls.map((control) => control.text),
      ["닫기", "전화 연결"],
    );
    assert.equal(state.controls[1].href, "tel:050714980232");
    for (const control of state.controls) {
      assert.ok(control.height >= 44, JSON.stringify(control));
      assert.ok(control.left >= -1, JSON.stringify(control));
      assert.ok(control.right <= 2000, JSON.stringify(control));
    }
  };
  const closeWithEscape = async () => {
    await press("Escape", "Escape", 27);
    await until(
      () => evaluate("!document.querySelector('dialog[open]')"),
      "dialog escaped",
    );
    await until(
      () => evaluate("document.activeElement.id === 'bottom-phone-call'"),
      "focus after escape",
    );
  };
  const closeWithButton = async () => {
    await chrome.button("닫기");
    await until(
      () => evaluate("!document.querySelector('dialog[open]')"),
      "dialog closed",
    );
    await until(
      () => evaluate("document.activeElement.id === 'bottom-phone-call'"),
      "focus after close",
    );
  };
  const activateCall = async () => {
    await evaluate(`(() => {
      const link = document.querySelector("dialog[open] a");
      link.addEventListener("click", (event) => {
        event.preventDefault();
        link.dataset.activated = "yes";
      }, { once: true });
      link.focus();
    })()`);
    await press("Enter", "Enter", 13);
    await until(
      () =>
        evaluate(
          "document.querySelector('dialog[open] a')?.dataset.activated === 'yes'",
        ),
      "call link activated",
    );
    assert.equal(
      await evaluate(
        "document.querySelector('dialog[open] a').getAttribute('href')",
      ),
      "tel:050714980232",
    );
  };

  const viewports = [
    { name: "360", width: 360, height: 800, fine: false, app: 360 },
    { name: "390", width: 390, height: 844, fine: false, app: 390 },
    { name: "pc", width: 1280, height: 900, fine: true, app: 560 },
  ];
  for (const viewport of viewports) {
    await emulate(viewport);
    await go("/");
    await waitPhone();
    const closed = await phoneShape();
    assert.equal(closed.tag, "BUTTON", viewport.name);
    assert.equal(closed.href, null, viewport.name);
    assert.equal(closed.expanded, "false", viewport.name);
    assert.equal(closed.width, 54, viewport.name);
    assert.ok(
      closed.raised >= 16 && closed.raised <= 24,
      `${viewport.name} ${closed.raised}`,
    );
    assert.equal(closed.overflow, false, viewport.name);
    assert.deepEqual(closed.labels, [
      "홈",
      "카테고리",
      "전화하기",
      "예약조회",
      "로그인",
    ]);
    assert.deepEqual(closed.hrefs, [
      "/",
      "/category",
      "/booking/lookup",
      "/login",
    ]);
    const frame = await evaluate(`(() => {
      const shell = document.querySelector("[data-app-shell]");
      return {
        app: Math.round(shell.getBoundingClientRect().width),
        fine: matchMedia("(hover: hover) and (pointer: fine)").matches,
      };
    })()`);
    assert.equal(frame.app, viewport.app, viewport.name);
    assert.equal(frame.fine, viewport.fine, viewport.name);

    await openDialog(viewport.fine);
    const opened = await dialogState();
    assertDialog(opened);
    assert.equal(opened.app, viewport.app, viewport.name);
    assert.equal(opened.fine, viewport.fine, viewport.name);
    for (const control of opened.controls) {
      assert.ok(control.right <= viewport.width + 1, JSON.stringify(control));
    }
    await activateCall();
    assert.equal(await evaluate("location.pathname"), "/");
    await closeWithEscape();
    const afterEscape = await phoneShape();
    assert.equal(afterEscape.expanded, "false");
    assert.equal(afterEscape.overflow, false);

    await openDialog(viewport.fine);
    await closeWithButton();
    assert.equal(
      await evaluate("document.activeElement.id"),
      "bottom-phone-call",
    );

    await evaluate(
      'document.querySelector(\'nav[aria-label="하단 메뉴"] a[href="/category"]\').click()',
    );
    await until(
      () => evaluate("location.pathname === '/category'"),
      `${viewport.name} category`,
    );
    await until(
      () => evaluate("document.body.innerText.includes('카테고리')"),
      `${viewport.name} category text`,
    );
    await evaluate(
      'document.querySelector(\'nav[aria-label="하단 메뉴"] a[href="/booking/lookup"]\').click()',
    );
    await until(
      () => evaluate("location.pathname === '/booking/lookup'"),
      `${viewport.name} lookup`,
    );
    await until(
      () => evaluate("document.body.innerText.includes('예약 조회')"),
      `${viewport.name} lookup text`,
    );
    await evaluate(
      'document.querySelector(\'nav[aria-label="하단 메뉴"] a[href="/login"]\').click()',
    );
    await until(
      () => evaluate("location.pathname === '/login'"),
      `${viewport.name} login`,
    );
    await until(
      () => evaluate("document.body.innerText.includes('로그인')"),
      `${viewport.name} login text`,
    );
    await evaluate(
      'document.querySelector(\'nav[aria-label="하단 메뉴"] a[href="/"]\').click()',
    );
    await until(
      () => evaluate("location.pathname === '/'"),
      `${viewport.name} home`,
    );
    await waitPhone();
    assert.equal(
      await evaluate(
        'document.querySelector(\'nav[aria-label="하단 메뉴"] [aria-current="page"]\').textContent.trim()',
      ),
      "홈",
    );
    assert.equal(
      await evaluate(
        "document.documentElement.scrollWidth <= window.innerWidth + 1",
      ),
      true,
      viewport.name,
    );
  }

  await emulate(viewports[1]);
  await go("/stores");
  await until(
    () =>
      evaluate("!!document.querySelector('[data-store-slug=\"store-own\"]')"),
    "store cards",
  );
  assert.equal(
    await evaluate(
      'document.querySelector(\'[data-store-slug="store-own"] a[href^="tel:"]\').getAttribute("href")',
    ),
    "tel:0530001111",
  );
  assert.equal(
    await evaluate(
      'document.querySelector(\'[data-store-slug="store-empty"] a[href^="tel:"]\').getAttribute("href")',
    ),
    "tel:0507-1498-0232",
  );
  assert.equal(
    await evaluate("!!document.querySelector('dialog[open]')"),
    false,
  );
  const storeBar = await phoneShape();
  assert.equal(storeBar.tag, "BUTTON");
  assert.equal(storeBar.href, null);
  assert.equal(storeBar.overflow, false);
  console.log("bottom phone dialog browser checks passed");
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  if (chrome) {
    try {
      await chrome.close();
    } catch (error) {
      console.error(error);
    }
  }
  stop(app);
  fixture.close();
}
