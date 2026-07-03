export type DetectedFacts = {
  title: string;
  tools: string[];
  tokenEstimate: number;
};

/**
 * Lightweight client-side mirror of the backend agent-md parser, used to reflect
 * what we detected back to the user as they paste. The server call on submit is
 * the source of truth, so keep this forgiving and fast.
 */
export function detectAgentFacts(markdown: string): DetectedFacts {
  const text = markdown ?? "";
  const lines = text.split(/\r?\n/);

  let title = "";
  const h1 = lines.find((line) => /^#\s+\S/.test(line.trim()));
  if (h1) title = h1.replace(/^#\s+/, "").trim();
  if (!title) {
    const named = lines.find((line) => /^(name|role)\s*:/i.test(line.trim()));
    if (named) title = named.split(":").slice(1).join(":").trim();
  }

  const tools = new Set<string>();
  for (const match of text.matchAll(/`([a-z][a-z0-9_.-]{1,40})`/gi)) {
    tools.add(match[1]);
  }

  let inTools = false;
  for (const raw of lines) {
    const line = raw.trim();
    if (/^#{1,6}\s*tools\b/i.test(line) || /^tools\s*:/i.test(line)) {
      inTools = true;
      continue;
    }
    if (inTools) {
      if (/^#{1,6}\s/.test(line)) {
        inTools = false;
        continue;
      }
      const bullet = line.match(/^[-*]\s+([a-z][a-z0-9_.-]{1,40})/i);
      if (bullet) tools.add(bullet[1]);
    }
  }

  return {
    title,
    tools: Array.from(tools).slice(0, 12),
    tokenEstimate: Math.round(text.length / 4)
  };
}
