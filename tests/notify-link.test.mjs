import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const fixtureSecret = "fixture-notify-link-secret";
const otherSecret = "fixture-notify-link-other";
const inquiryId = "11111111-1111-4111-8111-111111111111";
const reservationId = "22222222-2222-4222-8222-222222222222";
const guestEmail = "guest@example.invalid";
const now = 1_700_000_000_000;

function loadModule(file, adapters = {}) {
  const compiled = ts.transpileModule(
    readFileSync(new URL(file, import.meta.url), "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText;
  const exports = {};
  new Function("require", "exports", compiled)((name) => {
    if (!(name in adapters)) throw new Error(`Unexpected dependency: ${name}`);
    return adapters[name];
  }, exports);
  return exports;
}

function loadTree(specifier) {
  const cache = new Map();
  function resolveFile(name, parent) {
    const raw = name.startsWith("@/")
      ? new URL(`../${name.slice(2)}`, import.meta.url)
      : new URL(name, parent);
    const path = fileURLToPath(raw);
    const found = [path, `${path}.ts`, `${path}.tsx`].find((item) =>
      existsSync(item),
    );
    if (!found) throw new Error(`Missing module: ${name}`);
    return found;
  }
  function instantiate(filename) {
    if (cache.has(filename)) return cache.get(filename).exports;
    const compiled = ts.transpileModule(readFileSync(filename, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText;
    const commonjs = { exports: {} };
    cache.set(filename, commonjs);
    const parent = new URL(`file:///${filename.replaceAll("\\", "/")}`);
    new Function("require", "exports", "module", compiled)(
      (name) => {
        if (name === "server-only") return {};
        if (name === "next/headers") {
          return {
            headers: async () => ({
              get() {
                return null;
              },
            }),
          };
        }
        if (name.startsWith("node:")) return require(name);
        if (name.startsWith(".") || name.startsWith("@/"))
          return instantiate(resolveFile(name, parent));
        throw new Error(`Unexpected dependency: ${name}`);
      },
      commonjs.exports,
      commonjs,
    );
    return commonjs.exports;
  }
  return instantiate(resolveFile(specifier, import.meta.url));
}

const tokenApi = loadTree("../lib/notify-link/token.ts");
const messages = loadTree("../lib/notify-link/messages.ts");
const queryApi = loadTree("../lib/notify-link/query.ts");
const { notifyLinkTtlMs, createNotifyToken, verifyNotifyToken } = tokenApi;

function sourceFiles(dir, found = []) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next" || name === "tmp") continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) sourceFiles(path, found);
    else if (/\.(ts|tsx)$/.test(name)) found.push(path);
  }
  return found;
}

async function withSecret(value, run) {
  const had = Object.prototype.hasOwnProperty.call(
    process.env,
    "NOTIFY_LINK_SECRET",
  );
  const previous = process.env.NOTIFY_LINK_SECRET;
  if (value === undefined) delete process.env.NOTIFY_LINK_SECRET;
  else process.env.NOTIFY_LINK_SECRET = value;
  try {
    return await run();
  } finally {
    if (!had) delete process.env.NOTIFY_LINK_SECRET;
    else process.env.NOTIFY_LINK_SECRET = previous;
  }
}

function payloadOf(token) {
  return JSON.parse(
    Buffer.from(token.split(".")[0], "base64url").toString("utf8"),
  );
}

function flip(value) {
  const last = value.at(-1);
  return `${value.slice(0, -1)}${last === "A" ? "B" : "A"}`;
}

test("NOTIFY_LINK_SECRET is read only by the token module", () => {
  const root = fileURLToPath(new URL("..", import.meta.url));
  const hits = [];
  for (const folder of ["app", "components", "lib"]) {
    for (const file of sourceFiles(join(root, folder))) {
      if (readFileSync(file, "utf8").includes("NOTIFY_LINK_SECRET"))
        hits.push(relative(root, file).replaceAll("\\", "/"));
    }
  }
  assert.deepEqual(hits, ["lib/notify-link/token.ts"]);
  assert.match(
    readFileSync(
      new URL("../lib/notify-link/token.ts", import.meta.url),
      "utf8",
    ),
    /timingSafeEqual/,
  );
});

test("a signed token verifies and keeps only kind, id, and expiry", async () => {
  await withSecret(fixtureSecret, () => {
    const token = createNotifyToken({
      kind: "inquiry",
      id: inquiryId,
      now,
    });
    assert.equal(typeof token, "string");
    assert.equal(token.includes(fixtureSecret), false);
    assert.equal(token.includes(guestEmail), false);
    assert.equal(token.includes("I-20261126"), false);
    const payload = payloadOf(token);
    assert.deepEqual(Object.keys(payload).sort(), ["exp", "id", "kind", "v"]);
    assert.equal(payload.v, 1);
    assert.equal(payload.kind, "inquiry");
    assert.equal(payload.id, inquiryId);
    assert.equal(payload.exp, now + notifyLinkTtlMs);
    assert.equal(notifyLinkTtlMs, 30 * 24 * 60 * 60 * 1000);
    assert.deepEqual(
      verifyNotifyToken(token, "inquiry", now + notifyLinkTtlMs - 1),
      {
        id: inquiryId,
      },
    );
  });
});

test("a tampered token is rejected", async () => {
  await withSecret(fixtureSecret, () => {
    const token = createNotifyToken({
      kind: "inquiry",
      id: inquiryId,
      now,
    });
    const [body, mac] = token.split(".");
    assert.equal(
      verifyNotifyToken(`${flip(body)}.${mac}`, "inquiry", now),
      null,
    );
    assert.equal(
      verifyNotifyToken(`${body}.${flip(mac)}`, "inquiry", now),
      null,
    );
    assert.equal(
      verifyNotifyToken(`${body}.${mac}.extra`, "inquiry", now),
      null,
    );
    assert.equal(verifyNotifyToken("", "inquiry", now), null);
    const changed = payloadOf(token);
    changed.exp = now + notifyLinkTtlMs + 1;
    const resigned = Buffer.from(JSON.stringify(changed), "utf8").toString(
      "base64url",
    );
    assert.equal(verifyNotifyToken(`${resigned}.${mac}`, "inquiry", now), null);
  });
});

test("an expired token is rejected at the expiry instant", async () => {
  await withSecret(fixtureSecret, () => {
    const token = createNotifyToken({
      kind: "reservation",
      id: reservationId,
      now,
    });
    assert.equal(
      verifyNotifyToken(token, "reservation", now + notifyLinkTtlMs),
      null,
    );
  });
});

test("a token for the other record kind is rejected", async () => {
  await withSecret(fixtureSecret, () => {
    const inquiry = createNotifyToken({ kind: "inquiry", id: inquiryId, now });
    const reservation = createNotifyToken({
      kind: "reservation",
      id: reservationId,
      now,
    });
    assert.equal(verifyNotifyToken(inquiry, "reservation", now), null);
    assert.equal(verifyNotifyToken(reservation, "inquiry", now), null);
    assert.deepEqual(verifyNotifyToken(reservation, "reservation", now), {
      id: reservationId,
    });
  });
});

test("a missing or blank secret does not sign or verify", async () => {
  const signed = await withSecret(fixtureSecret, () =>
    createNotifyToken({ kind: "inquiry", id: inquiryId, now }),
  );
  for (const secret of [undefined, "", "   "]) {
    await withSecret(secret, () => {
      assert.equal(
        createNotifyToken({ kind: "inquiry", id: inquiryId, now }),
        null,
      );
      assert.equal(verifyNotifyToken(signed, "inquiry", now), null);
    });
  }
  await withSecret(otherSecret, () => {
    assert.equal(verifyNotifyToken(signed, "inquiry", now), null);
  });
  await withSecret(fixtureSecret, () => {
    assert.equal(
      createNotifyToken({ kind: "inquiry", id: "not-a-uuid", now }),
      null,
    );
  });
});

test("lookup messages stay on the manual form", () => {
  assert.equal(
    messages.inquiryLinkExpiredMessage,
    "링크가 만료됐어요. 문의번호와 이메일로 조회해 주세요.",
  );
  assert.equal(
    messages.reservationLinkExpiredMessage,
    "링크가 만료됐어요. 예약번호와 이메일로 조회해 주세요.",
  );
  assert.deepEqual(queryApi.notifyTokenQuery(undefined), {
    present: false,
    token: null,
  });
  assert.deepEqual(queryApi.notifyTokenQuery(["a", "b"]), {
    present: true,
    token: null,
  });
  assert.deepEqual(queryApi.notifyTokenQuery("  signed  "), {
    present: true,
    token: "signed",
  });
});

function mailAdapters(sent) {
  return {
    "server-only": {},
    "next/headers": {
      headers: async () => ({
        get() {
          return null;
        },
      }),
    },
    "@/lib/member-auth/redirect": {
      resolveTrustedOrigin() {
        return null;
      },
    },
    "@/lib/reservations/rules": loadTree("../lib/reservations/rules.ts"),
    "@/lib/site-config": loadTree("../lib/site-config.ts"),
    "@/lib/site-origin": loadTree("../lib/site-origin.ts"),
    "@/lib/notify-link/token": tokenApi,
    "./deliver-once": loadTree("../lib/email/deliver-once.ts"),
    "./inquiry-answered-message": loadTree(
      "../lib/email/inquiry-answered-message.ts",
    ),
    "./reservation-confirmed-message": loadTree(
      "../lib/email/reservation-confirmed-message.ts",
    ),
    "./send-resend": {
      async sendResendMail(mail) {
        sent.push(mail);
        return { ok: true };
      },
    },
  };
}

function lookupUrl(text, label) {
  const line = text.split("\n").find((item) => item.startsWith(label));
  return new URL(line.slice(label.length));
}

test("mails use a signed link and fall back to the plain lookup url", async () => {
  await withSecret(fixtureSecret, async () => {
    const inquirySent = [];
    const inquiry = loadModule(
      "../lib/email/notify-inquiry.ts",
      mailAdapters(inquirySent),
    );
    assert.equal(
      await inquiry.notifyInquiryAnswered({
        id: inquiryId,
        email: ` ${guestEmail.toUpperCase()} `,
      }),
      "sent",
    );
    const inquiryLink = lookupUrl(inquirySent[0].text, "문의 조회: ");
    assert.equal(
      `${inquiryLink.origin}${inquiryLink.pathname}`,
      "https://angelsaju.com/support/lookup",
    );
    assert.deepEqual([...inquiryLink.searchParams.keys()], ["t"]);
    const inquiryToken = inquiryLink.searchParams.get("t");
    assert.deepEqual(verifyNotifyToken(inquiryToken, "inquiry"), {
      id: inquiryId,
    });
    assert.equal(verifyNotifyToken(inquiryToken, "reservation"), null);
    assert.equal(inquiryLink.href.includes(guestEmail), false);
    assert.equal(inquiryLink.href.includes(fixtureSecret), false);
    assert.equal(JSON.stringify(payloadOf(inquiryToken)).includes("@"), false);

    const reservationSent = [];
    const reservation = loadModule(
      "../lib/email/notify-reservation.ts",
      mailAdapters(reservationSent),
    );
    assert.equal(
      await reservation.notifyReservationConfirmed({
        id: reservationId,
        reservationNo: "R-20261201-0001",
        counselors: { name: "상담사 A" },
        productName: "사주 30분",
        startsAt: "2026-12-01T03:00:00.000Z",
        confirmedAt: "2026-11-26T00:00:00.000Z",
        email: guestEmail,
      }),
      "sent",
    );
    const reservationLink = lookupUrl(reservationSent[0].text, "예약 조회: ");
    assert.equal(
      `${reservationLink.origin}${reservationLink.pathname}`,
      "https://angelsaju.com/booking/lookup",
    );
    assert.deepEqual([...reservationLink.searchParams.keys()], ["t"]);
    const reservationToken = reservationLink.searchParams.get("t");
    assert.deepEqual(verifyNotifyToken(reservationToken, "reservation"), {
      id: reservationId,
    });
    assert.equal(reservationLink.href.includes("R-20261201-0001"), false);
    assert.equal(reservationLink.href.includes(guestEmail), false);
    assert.equal(
      JSON.stringify(payloadOf(reservationToken)).includes("R-20261201"),
      false,
    );
  });

  await withSecret(undefined, async () => {
    const inquirySent = [];
    const inquiry = loadModule(
      "../lib/email/notify-inquiry.ts",
      mailAdapters(inquirySent),
    );
    assert.equal(
      await inquiry.notifyInquiryAnswered({
        id: inquiryId,
        email: guestEmail,
      }),
      "sent",
    );
    assert.match(
      inquirySent[0].text,
      /문의 조회: https:\/\/angelsaju\.com\/support\/lookup\n/,
    );
    assert.equal(inquirySent[0].text.includes("?t="), false);
    const reservationSent = [];
    const reservation = loadModule(
      "../lib/email/notify-reservation.ts",
      mailAdapters(reservationSent),
    );
    assert.equal(
      await reservation.notifyReservationConfirmed({
        id: reservationId,
        reservationNo: "R-20261201-0001",
        counselors: { name: "상담사 A" },
        productName: "사주 30분",
        startsAt: "2026-12-01T03:00:00.000Z",
        confirmedAt: "2026-11-26T01:00:00.000Z",
        email: guestEmail,
      }),
      "sent",
    );
    assert.match(
      reservationSent[0].text,
      /예약 조회: https:\/\/angelsaju\.com\/booking\/lookup\n/,
    );
    assert.equal(reservationSent[0].text.includes("?t="), false);
  });
});

function fakeDb(rows) {
  const calls = [];
  return {
    calls,
    from(table) {
      let columns = "";
      const filters = [];
      const query = {
        select(value) {
          columns = value;
          return query;
        },
        eq(key, value) {
          filters.push([key, value]);
          return query;
        },
        async maybeSingle() {
          calls.push({ table, columns, filters: filters.slice() });
          const id = filters.find((item) => item[0] === "id")?.[1];
          return { data: rows[table]?.[id] ?? null, error: null };
        },
      };
      return query;
    },
  };
}

test("a valid token reads that one row and a bad token does not", async () => {
  const inquiryRow = {
    inquiry_no: "I-20261126-0001",
    category: "consultation",
    created_at: "2026-11-26T01:00:00.000Z",
    status: "answered",
    reservation_no: null,
    content: "테스트 문의 내용",
    answer: "테스트 답변",
    answered_at: "2026-11-26T02:00:00.000Z",
    customer_email: guestEmail,
    customer_name: "테스트비밀이름",
  };
  const reservationRow = {
    reservation_no: "R-20261126-0001",
    status: "confirmed",
    product_name: "사주 30분",
    minutes: 30,
    price: 30000,
    starts_at: "2026-12-01T03:00:00.000Z",
    ends_at: "2026-12-01T03:30:00.000Z",
    payment_method: "card",
    cancel_reason: null,
    counselors: { name: "상담사 A" },
    customer_email: guestEmail,
    customer_name: "테스트비밀이름",
  };
  const db = fakeDb({
    inquiries: { [inquiryId]: inquiryRow },
    reservations: { [reservationId]: reservationRow },
  });
  const lookup = loadModule("../lib/notify-link/lookup.ts", {
    "server-only": {},
    "@/lib/supabase/admin": {
      createAdminClient() {
        return db;
      },
    },
    "@/lib/reservations/lookup/public-result": loadModule(
      "../lib/reservations/lookup/public-result.ts",
    ),
    "./token": tokenApi,
  });
  await withSecret(fixtureSecret, async () => {
    const inquiryToken = createNotifyToken({
      kind: "inquiry",
      id: inquiryId,
    });
    const reservationToken = createNotifyToken({
      kind: "reservation",
      id: reservationId,
    });
    const inquiry = await lookup.readNotifyInquiry(inquiryToken);
    assert.equal(inquiry.inquiryNo, "I-20261126-0001");
    assert.equal(inquiry.content, "테스트 문의 내용");
    assert.equal(inquiry.answer, "테스트 답변");
    assert.equal(JSON.stringify(inquiry).includes(guestEmail), false);
    assert.equal(JSON.stringify(inquiry).includes("테스트비밀이름"), false);
    assert.equal(db.calls[0].table, "inquiries");
    assert.deepEqual(db.calls[0].filters, [["id", inquiryId]]);
    assert.equal(db.calls[0].columns.includes("customer_email"), false);
    assert.equal(db.calls[0].columns.includes("*"), false);

    const reservation = await lookup.readNotifyReservation(reservationToken);
    assert.equal(reservation.reservationNo, "R-20261126-0001");
    assert.equal(reservation.counselorName, "상담사 A");
    assert.equal(reservation.productName, "사주 30분");
    assert.equal(reservation.status, "confirmed");
    assert.equal(JSON.stringify(reservation).includes(guestEmail), false);
    assert.equal(db.calls[1].table, "reservations");
    assert.deepEqual(db.calls[1].filters, [["id", reservationId]]);
    assert.equal(db.calls[1].columns.includes("customer_email"), false);

    assert.equal(await lookup.readNotifyInquiry(reservationToken), null);
    assert.equal(await lookup.readNotifyReservation("tampered"), null);
    assert.equal(db.calls.length, 2);
  });
  await withSecret(undefined, async () => {
    const before = db.calls.length;
    assert.equal(
      await lookup.readNotifyInquiry(
        createNotifyToken({ kind: "inquiry", id: inquiryId, now }) ?? "",
      ),
      null,
    );
    assert.equal(db.calls.length, before);
  });
});
