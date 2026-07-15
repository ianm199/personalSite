import yaml from 'js-yaml';

/**
 * Splits a raw markdown document into its YAML frontmatter text and body.
 * The body is the exact byte substring after the closing delimiter's newline,
 * so writing `---\n` + yamlText + `---\n` + body reproduces the file verbatim.
 */
export function splitDocument(raw) {
  if (!raw.startsWith('---\n')) {
    throw new Error('document does not start with frontmatter');
  }
  const close = raw.indexOf('\n---\n', 4);
  if (close === -1) {
    throw new Error('frontmatter closing delimiter not found');
  }
  return {
    yamlText: raw.slice(4, close + 1),
    body: raw.slice(close + 5),
  };
}

/**
 * Parses frontmatter YAML with the CORE schema so dates like 2026-07-13
 * stay plain strings rather than being coerced to Date objects.
 */
export function parseFrontmatter(yamlText) {
  return yaml.load(yamlText, { schema: yaml.CORE_SCHEMA });
}

function quote(value) {
  return `"${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/**
 * Serializes frontmatter fields in the exact style used across all posts:
 * fixed key order, double-quoted title/description, unquoted YYYY-MM-DD
 * dates, inline tags array, bare boolean draft.
 */
export function serializeFrontmatter(fields) {
  const lines = [
    `title: ${quote(fields.title)}`,
    `description: ${quote(fields.description)}`,
    `pubDate: ${fields.pubDate}`,
  ];
  if (fields.updatedDate) {
    lines.push(`updatedDate: ${fields.updatedDate}`);
  }
  lines.push(`tags: [${fields.tags.map(quote).join(', ')}]`);
  lines.push(`draft: ${fields.draft}`);
  return lines.join('\n') + '\n';
}

export function assembleDocument(fields, body) {
  return '---\n' + serializeFrontmatter(fields) + '---\n' + body;
}
