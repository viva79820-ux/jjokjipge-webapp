import type { ReactNode } from "react";

type Block =
  | { type: "title"; text: string }
  | { type: "heading"; text: string }
  | { type: "paragraph"; text: string }
  | { type: "ordered"; items: string[]; start: number }
  | { type: "unordered"; items: string[] }
  | { type: "rule" };

function isBlockStart(line: string) {
  return (
    /^#{1,2}\s+/.test(line) ||
    /^\d+\.\s+/.test(line) ||
    /^\s*-\s+/.test(line) ||
    line === "---"
  );
}

function parse(source: string) {
  const lines = source.replaceAll("\r\n", "\n").split("\n");
  const blocks: Block[] = [];

  for (let index = 0; index < lines.length;) {
    const line = lines[index].trimEnd();
    if (!line.trim()) {
      index += 1;
      continue;
    }
    if (line === "---") {
      blocks.push({ type: "rule" });
      index += 1;
      continue;
    }
    if (line.startsWith("# ")) {
      blocks.push({ type: "title", text: line.slice(2) });
      index += 1;
      continue;
    }
    if (line.startsWith("## ")) {
      blocks.push({ type: "heading", text: line.slice(3) });
      index += 1;
      continue;
    }
    if (/^\d+\.\s+/.test(line)) {
      const items: string[] = [];
      const start = Number.parseInt(line, 10);
      while (index < lines.length && /^\d+\.\s+/.test(lines[index])) {
        items.push(lines[index].replace(/^\d+\.\s+/, ""));
        index += 1;
      }
      blocks.push({ type: "ordered", items, start });
      continue;
    }
    if (/^\s*-\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^\s*-\s+/.test(lines[index])) {
        items.push(lines[index].replace(/^\s*-\s+/, ""));
        index += 1;
      }
      blocks.push({ type: "unordered", items });
      continue;
    }

    const paragraph = [line.trim()];
    index += 1;
    while (
      index < lines.length &&
      lines[index].trim() &&
      !isBlockStart(lines[index].trimEnd())
    ) {
      paragraph.push(lines[index].trim());
      index += 1;
    }
    blocks.push({ type: "paragraph", text: paragraph.join(" ") });
  }

  return blocks;
}

export function LegalDocument({ source }: { source: string }) {
  return (
    <article className="mx-4 mt-7 rounded-card border border-border bg-surface p-4 wrap-anywhere @3xl/app:mx-6 @3xl/app:p-6">
      {parse(source).map((block, index) => (
        <LegalBlock key={`${block.type}-${index}`} block={block} />
      ))}
    </article>
  );
}

function LegalBlock({ block }: { block: Block }): ReactNode {
  if (block.type === "title") {
    return (
      <h1 className="mb-2 text-display font-extrabold text-foreground">
        {block.text}
      </h1>
    );
  }
  if (block.type === "heading") {
    return (
      <h2 className="mt-7 mb-2 text-subtitle font-bold text-foreground first:mt-0">
        {block.text}
      </h2>
    );
  }
  if (block.type === "paragraph") {
    return <p className="my-2 text-body text-foreground">{block.text}</p>;
  }
  if (block.type === "rule") {
    return <hr className="my-6 border-0 border-t border-border" />;
  }
  const items = block.items.map((item, index) => (
    <li key={`${index}-${item}`}>{item}</li>
  ));
  if (block.type === "ordered") {
    return (
      <ol
        start={block.start}
        className="my-2 list-decimal space-y-1 pl-5 text-body text-foreground"
      >
        {items}
      </ol>
    );
  }
  return (
    <ul className="my-2 list-disc space-y-1 pl-5 text-body text-foreground">
      {items}
    </ul>
  );
}
