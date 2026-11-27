// 가입 확인 메일과 같은 표 레이아웃이다. 스타일은 인라인만 쓴다.

const fontFamily = "'Apple SD Gothic Neo','Malgun Gothic',Arial,sans-serif";
const logoUrl = "https://angelsaju.com/images/brand/logo-angel-mark.png";
const footerNote = "본인이 요청하지 않았다면 이 메일을 무시해 주세요.";

export type EmailDetail = {
  label: string;
  value: string;
};

export type EmailAction = {
  label: string;
  href: string;
};

export type EmailLayout = {
  title: string;
  heading: string;
  body: string;
  details?: EmailDetail[];
  action?: EmailAction;
  phone: string;
};

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function phoneHref(phone: string) {
  const digits = phone.replace(/\D/g, "");
  return digits ? `tel:${digits}` : "";
}

function detailRows(details: EmailDetail[]) {
  return details
    .map((row) => {
      const label = escapeHtml(row.label);
      const value = escapeHtml(row.value);
      return `<tr>
<td style="width:88px;padding:8px 12px 8px 0;border-top:1px solid #E7E1EC;font-family:${fontFamily};font-size:13px;line-height:20px;font-weight:600;color:#6B6175;vertical-align:top;">${label}</td>
<td style="padding:8px 0;border-top:1px solid #E7E1EC;font-family:${fontFamily};font-size:15px;line-height:24px;font-weight:700;color:#2A1F33;vertical-align:top;overflow-wrap:anywhere;">${value}</td>
</tr>`;
    })
    .join("");
}

function detailsTable(details: EmailDetail[] | undefined) {
  if (!details?.length) return "";
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;margin-top:16px;border-collapse:collapse;">
${detailRows(details)}
</table>`;
}

function actionButton(action: EmailAction | undefined) {
  if (!action) return "";
  const href = escapeHtml(action.href);
  const label = escapeHtml(action.label);
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:20px;">
<tr>
<td bgcolor="#7C429A" style="border-radius:24px;background:#7C429A;">
<a href="${href}" style="display:inline-block;padding:12px 26px;border-radius:24px;background:#7C429A;font-family:${fontFamily};font-size:15px;line-height:22px;font-weight:700;color:#FFFFFF;text-decoration:none;">${label}</a>
</td>
</tr>
</table>`;
}

function phoneLine(phone: string) {
  const text = escapeHtml(phone);
  const tel = phoneHref(phone);
  const shown = tel
    ? `<a href="${escapeHtml(tel)}" style="color:#6B6175;text-decoration:none;">${text}</a>`
    : text;
  return `대표번호 ${shown}`;
}

export function renderEmailLayout(input: EmailLayout) {
  const title = escapeHtml(input.title);
  const heading = escapeHtml(input.heading);
  const body = escapeHtml(input.body);
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#F7F3FA;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;background:#F7F3FA;">
<tr>
<td align="center" style="padding:24px 16px;background:#F7F3FA;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:540px;background:#FFFFFF;border:1px solid #E7E1EC;border-radius:16px;">
<tr>
<td style="padding:24px;font-family:${fontFamily};color:#2A1F33;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0">
<tr>
<td style="padding:0 8px 0 0;vertical-align:middle;">
<img src="${logoUrl}" width="42" height="32" alt="" style="display:block;width:42px;height:32px;border:0;">
</td>
<td style="vertical-align:middle;font-family:${fontFamily};font-size:20px;line-height:24px;font-weight:800;">
<span style="color:#7C429A;">쪽집게천사</span> <span style="color:#2A1F33;">운세통</span>
</td>
</tr>
</table>
<h1 style="margin:24px 0 0;font-family:${fontFamily};font-size:26px;line-height:34px;font-weight:800;color:#2A1F33;">${heading}</h1>
<p style="margin:12px 0 0;font-family:${fontFamily};font-size:15px;line-height:24px;font-weight:400;color:#6B6175;">${body}</p>
${detailsTable(input.details)}
${actionButton(input.action)}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;margin-top:24px;border-top:1px solid #E7E1EC;">
<tr>
<td style="padding-top:16px;font-family:${fontFamily};font-size:13px;line-height:20px;font-weight:500;color:#6B6175;">
<p style="margin:0;">${footerNote}</p>
<p style="margin:8px 0 0;">${phoneLine(input.phone)}</p>
</td>
</tr>
</table>
</td>
</tr>
</table>
</td>
</tr>
</table>
</body>
</html>`;
}
