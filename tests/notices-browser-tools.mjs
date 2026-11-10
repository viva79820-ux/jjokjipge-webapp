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
  let ws;
  try {
    await until(
      () => existsSync(join(profile, "DevToolsActivePort")),
      "Chromium start",
    );
    const port = readFileSync(
      join(profile, "DevToolsActivePort"),
      "utf8",
    ).split("\n")[0];
    const pages = await (
      await fetch(`http://127.0.0.1:${port}/json/list`)
    ).json();
    ws = new WebSocket(
      pages.find((p) => p.type === "page").webSocketDebuggerUrl,
    );
    await new Promise((r, j) => {
      ws.onopen = r;
      ws.onerror = j;
    });
    let serial = 0;
    const pending = new Map();
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.id && pending.has(msg.id)) {
        const p = pending.get(msg.id);
        pending.delete(msg.id);
        clearTimeout(p.timer);
        if (msg.error) p.reject(Error(msg.error.message));
        else p.resolve(msg.result);
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
        ws.send(JSON.stringify({ id, method, params }));
      });
    const evaluate = async (expression) => {
      const r = await call("Runtime.evaluate", {
        expression,
        awaitPromise: true,
        returnByValue: true,
      });
      if (r.exceptionDetails) throw Error("Browser evaluation failed");
      return r.result.value;
    };
    const go = async (url) => {
      await call("Page.stopLoading");
      await call("Page.navigate", { url });
      await delay(600);
      await until(
        () => evaluate("document.readyState!=='loading'"),
        "page load",
      );
    };
    const button = async (text) => {
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
    return {
      call,
      evaluate,
      go,
      button,
      fill,
      close: async () => {
        try {
          await call("Browser.close");
        } catch {}
        ws.close();
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
    ws?.close();
    stop(child);
    throw e;
  }
}
