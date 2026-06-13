function safeLinkHref(href = "") {
  const trimmed = String(href).trim();
  return /^(https?:|mailto:|tel:)/i.test(trimmed) ? trimmed : "";
}

function renderInlineMarkdown(text, keyPrefix) {
  const nodes = [];
  const pattern = /(`([^`]+)`)|(\*\*([^*]+)\*\*)|(\[([^\]]+)\]\(([^)]+)\))|(?<!\*)\*([^*\s][^*]*?)\*(?!\*)/g;
  let lastIndex = 0;
  let match;
  let index = 0;
  while ((match = pattern.exec(text))) {
    if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index));
    if (match[2]) {
      nodes.push(<code key={`${keyPrefix}-code-${index}`}>{match[2]}</code>);
    } else if (match[4]) {
      nodes.push(<strong key={`${keyPrefix}-strong-${index}`}>{match[4]}</strong>);
    } else if (match[6]) {
      const href = safeLinkHref(match[7]);
      nodes.push(href
        ? <a key={`${keyPrefix}-link-${index}`} href={href} target="_blank" rel="noreferrer">{match[6]}</a>
        : <span key={`${keyPrefix}-link-${index}`}>{match[6]}</span>);
    } else if (match[8]) {
      nodes.push(<em key={`${keyPrefix}-em-${index}`}>{match[8]}</em>);
    }
    lastIndex = pattern.lastIndex;
    index += 1;
  }
  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes.length ? nodes : text;
}

function renderMarkdown(markdown = "") {
  const lines = String(markdown || "").replace(/\r\n/g, "\n").split("\n");
  const blocks = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      index += 1;
      continue;
    }
    if (/^```/.test(line.trim())) {
      const code = [];
      index += 1;
      while (index < lines.length && !/^```/.test(lines[index].trim())) {
        code.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) index += 1;
      blocks.push(<pre key={`pre-${index}`}><code>{code.join("\n")}</code></pre>);
      continue;
    }
    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    if (heading) {
      const Tag = `h${Math.min(4, heading[1].length + 2)}`;
      blocks.push(<Tag key={`heading-${index}`}>{renderInlineMarkdown(heading[2], `heading-${index}`)}</Tag>);
      index += 1;
      continue;
    }
    if (/^\s*[-*]\s+/.test(line)) {
      const items = [];
      while (index < lines.length && /^\s*[-*]\s+/.test(lines[index])) {
        const item = lines[index].replace(/^\s*[-*]\s+/, "");
        items.push(<li key={`li-${index}`}>{renderInlineMarkdown(item, `li-${index}`)}</li>);
        index += 1;
      }
      blocks.push(<ul key={`ul-${index}`}>{items}</ul>);
      continue;
    }
    if (/^\s*>\s?/.test(line)) {
      const quote = [];
      while (index < lines.length && /^\s*>\s?/.test(lines[index])) {
        quote.push(lines[index].replace(/^\s*>\s?/, ""));
        index += 1;
      }
      blocks.push(<blockquote key={`quote-${index}`}>{renderInlineMarkdown(quote.join(" "), `quote-${index}`)}</blockquote>);
      continue;
    }
    const paragraph = [line.trim()];
    index += 1;
    while (
      index < lines.length
      && lines[index].trim()
      && !/^(#{1,3})\s+/.test(lines[index])
      && !/^\s*[-*]\s+/.test(lines[index])
      && !/^```/.test(lines[index].trim())
    ) {
      paragraph.push(lines[index].trim());
      index += 1;
    }
    blocks.push(<p key={`p-${index}`}>{renderInlineMarkdown(paragraph.join(" "), `p-${index}`)}</p>);
  }
  return blocks;
}

export function StaticFieldBlock({ item }) {
  const ui = item.ui || {};
  if (ui.type === "note" || ui.type === "markdown") {
    return (
      <section className="workflowNote">
        <div className="workflowNoteContent">{renderMarkdown(ui.markdown ?? ui.value ?? "")}</div>
      </section>
    );
  }
  if (ui.type === "html") {
    return <div className="note" dangerouslySetInnerHTML={{ __html: ui.value }} />;
  }
  return null;
}
