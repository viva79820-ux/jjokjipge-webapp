import { spawn, execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
export { delay };
export async function until(fn, label, ms = 45000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await fn()) return;
    await delay(100);
  }
  throw Error(`Timed out: ${label}`);
}
export function stop(child) {
  if (!child?.pid) return;
  try {
    if (process.platform === "win32")
      execFileSync("taskkill", ["/pid", String(child.pid), "/t", "/f"], {
        windowsHide: true,
        stdio: "ignore",
      });
    else process.kill(-child.pid, "SIGTERM");
  } catch {}
}
export function server(port, env = process.env) {
  return spawn(
    process.execPath,
    [
      "node_modules/next/dist/bin/next",
      "start",
      "--hostname",
      "127.0.0.1",
      "--port",
      String(port),
    ],
    {
      env,
      windowsHide: true,
      detached: process.platform !== "win32",
      stdio: env.NOTICES_MOCK_TRACE ? ["ignore", "ignore", "pipe"] : "ignore",
    },
  );
}
export async function browser(visible = false) {
  const candidates = [
    process.env.NOTICES_CHROME,
    process.env.SUPPORT_CHROME,
    process.env.LOCALAPPDATA &&
      join(
        process.env.LOCALAPPDATA,
        "ms-playwright/chromium-1223/chrome-win64/chrome.exe",
      ),
    "/usr/bin/chromium",
    "/usr/bin/google-chrome",
  ];
  const exe = candidates.find((p) => p && existsSync(p));
  if (!exe) throw Error("Set NOTICES_CHROME to an installed Chromium path");
  const profile = mkdtempSync(join(tmpdir(), "notices-browser-"));
  const child = spawn(
    exe,
    [
      ...(!visible ? ["--headless=new"] : []),
      "--no-sandbox",
      "--disable-gpu",
      "--disable-background-networking",
      "--no-first-run",
      "--remote-debugging-port=0",
      `--user-data-dir=${profile}`,
      "about:blank",
    ],
    {
      windowsHide: !visible,
      detached: process.platform !== "win32",
      stdio: "ignore",
    },
  );
  const sockets = [];
  try {
    let port = "";
    await until(() => {
      try {
        port = readFileSync(join(profile, "DevToolsActivePort"), "utf8").split(
          "\n",
        )[0];
        return Boolean(port);
      } catch {
        return false;
      }
    }, "Chromium start");
    const attach = async (wsUrl) => {
      const socket = new WebSocket(wsUrl);
      sockets.push(socket);
      await new Promise((r, j) => {
        socket.onopen = r;
        socket.onerror = j;
      });
      let serial = 0;
      const pending = new Map();
      socket.onmessage = (e) => {
        const msg = JSON.parse(e.data);
        if (msg.id && pending.has(msg.id)) {
          const item = pending.get(msg.id);
          pending.delete(msg.id);
          clearTimeout(item.timer);
          if (msg.error) item.reject(Error(msg.error.message));
          else item.resolve(msg.result);
        }
      };
      const call = (method, params = {}) =>
        new Promise((resolve, reject) => {
          const id = ++serial;
          const timer = setTimeout(() => {
            pending.delete(id);
            reject(Error(`CDP timeout ${method}`));
          }, 30000);
          pending.set(id, { resolve, reject, timer });
          socket.send(JSON.stringify({ id, method, params }));
        });
      const evaluate = async (expression) => {
        const r = await call("Runtime.evaluate", {
          expression,
          awaitPromise: true,
          returnByValue: true,
        });
        if (r.exceptionDetails)
          throw Error(
            r.exceptionDetails.exception?.description ||
              r.exceptionDetails.text ||
              "Browser evaluation failed",
          );
        return r.result.value;
      };
      const go = async (url) => {
        await call("Page.bringToFront");
        await call("Page.stopLoading");
        const navigation = await call("Page.navigate", { url });
        if (navigation.errorText) throw Error(navigation.errorText);
        await until(
          () =>
            evaluate(
              `location.href===${JSON.stringify(url)}&&document.readyState==='complete'`,
            ),
          "page load",
        );
        await delay(600);
      };
      const button = async (text) => {
        await call("Page.bringToFront");
        await until(
          () =>
            evaluate(
              `Array.from(document.querySelectorAll('button')).some(e=>e.checkVisibility()&&!e.disabled&&e.textContent.trim()===${JSON.stringify(text)})`,
            ),
          text,
        );
        await evaluate(
          `Array.from(document.querySelectorAll('button')).find(e=>e.checkVisibility()&&!e.disabled&&e.textContent.trim()===${JSON.stringify(text)}).click()`,
        );
        await delay(150);
      };
      const fill = async (name, value) => {
        await until(
          () =>
            evaluate(
              `Array.from(document.querySelectorAll('[name=${name}]')).some(e=>e.checkVisibility()&&!e.matches(':disabled'))`,
            ),
          name,
        );
        await evaluate(
          `(()=>{const e=Array.from(document.querySelectorAll('[name=${name}]')).find(e=>e.checkVisibility());e.focus();e.select();})()`,
        );
        for (const type of ["keyDown", "keyUp"])
          await call("Input.dispatchKeyEvent", {
            type,
            key: "a",
            code: "KeyA",
            windowsVirtualKeyCode: 65,
            modifiers: 2,
          });
        await call("Input.insertText", { text: value });
      };
      await call("Page.enable");
      await call("Runtime.enable");
      return { call, evaluate, go, button, fill };
    };
    const pages = await (
      await fetch(`http://127.0.0.1:${port}/json/list`)
    ).json();
    const page = await attach(
      pages.find((item) => item.type === "page").webSocketDebuggerUrl,
    );
    const openTab = async (url) => {
      const response = await fetch(`http://127.0.0.1:${port}/json/new?${url}`, {
        method: "PUT",
      });
      if (!response.ok) throw Error("new tab");
      const created = await response.json();
      const tab = await attach(created.webSocketDebuggerUrl);
      await tab.go(url);
      return tab;
    };
    return {
      ...page,
      openTab,
      close: async () => {
        try {
          await page.call("Browser.close");
        } catch {}
        for (const socket of sockets) socket.close();
        stop(child);
        if (
          resolve(profile).startsWith(
            resolve(tmpdir()) + (process.platform === "win32" ? "\\" : "/"),
          )
        )
          rmSync(profile, {
            recursive: true,
            force: true,
            maxRetries: 10,
            retryDelay: 200,
          });
      },
    };
  } catch (e) {
    for (const socket of sockets) socket.close();
    stop(child);
    throw e;
  }
}
