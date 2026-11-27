// 강의 열람 브라우저 테스트 전용이다.
// next dev 자식 프로세스가 LECTURE_VIEWER_DIST로 빌드 폴더를 나누게 한다.
// next.config.ts는 바꾸지 않는다.
import { Module } from "node:module";
import path from "node:path";

const dist = process.env.LECTURE_VIEWER_DIST;
const originalRequire = Module.prototype.require;
const proxies = new WeakMap();

function applyLectureViewerDist(config) {
  if (!dist || !config || typeof config.distDir !== "string") return config;
  const normalized = config.distDir.replaceAll("\\", "/");
  if (normalized === ".next") {
    config.distDir = dist;
    if (config.distDirRoot === ".next") config.distDirRoot = dist;
    return config;
  }
  const root = config.distDirRoot;
  const rootIsDefault =
    root == null || String(root).replaceAll("\\", "/") === ".next";
  if (normalized === ".next/dev" && rootIsDefault) {
    config.distDirRoot = dist;
    config.distDir = path.join(dist, "dev");
  }
  return config;
}

function wrapConfig(exported) {
  const existing = proxies.get(exported);
  if (existing) return existing;
  if (typeof exported.default !== "function") return exported;
  let patched = null;
  const proxy = new Proxy(exported, {
    get(target, prop, receiver) {
      if (prop === "default") {
        const original = Reflect.get(target, "default", target);
        if (typeof original !== "function") return original;
        if (!patched) {
          patched = async function loadConfigWithLectureDist(...args) {
            const config = await original.apply(this, args);
            return applyLectureViewerDist(config);
          };
        }
        return patched;
      }
      return Reflect.get(target, prop, receiver);
    },
  });
  proxies.set(exported, proxy);
  return proxy;
}

Module.prototype.require = function lectureViewerDistRequire(request) {
  const exported = originalRequire.apply(this, arguments);
  if (!dist || !exported || typeof request !== "string") return exported;
  let resolved = "";
  try {
    resolved = Module._resolveFilename(request, this);
  } catch {
    return exported;
  }
  const normalized = String(resolved).replaceAll("\\", "/");
  if (!normalized.endsWith("/next/dist/server/config.js")) return exported;
  return wrapConfig(exported);
};
