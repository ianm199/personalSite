import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import { splitDocument, parseFrontmatter, assembleDocument } from './frontmatter.mjs';

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function httpError(status, message, payload) {
  const err = new Error(message);
  err.status = status;
  if (payload !== undefined) {
    err.payload = payload;
  }
  return err;
}

function hashOf(raw) {
  return createHash('sha256').update(raw, 'utf8').digest('hex');
}

export function resolvePostPath(blogDir, slug) {
  if (typeof slug !== 'string' || !SLUG_RE.test(slug)) {
    throw httpError(400, 'invalid slug');
  }
  const filePath = path.resolve(blogDir, `${slug}.md`);
  if (!filePath.startsWith(path.resolve(blogDir) + path.sep)) {
    throw httpError(400, 'slug resolves outside blog directory');
  }
  return filePath;
}

export function normalizeFields(input) {
  if (typeof input !== 'object' || input === null) {
    throw httpError(400, 'fields must be an object');
  }
  const { title, description, pubDate, updatedDate, tags, draft } = input;
  if (typeof title !== 'string' || title.length === 0) {
    throw httpError(400, 'title must be a non-empty string');
  }
  if (typeof description !== 'string') {
    throw httpError(400, 'description must be a string');
  }
  if (typeof pubDate !== 'string' || !DATE_RE.test(pubDate)) {
    throw httpError(400, 'pubDate must be YYYY-MM-DD');
  }
  if (updatedDate !== undefined && (typeof updatedDate !== 'string' || !DATE_RE.test(updatedDate))) {
    throw httpError(400, 'updatedDate must be YYYY-MM-DD');
  }
  if (!Array.isArray(tags) || tags.some((t) => typeof t !== 'string')) {
    throw httpError(400, 'tags must be an array of strings');
  }
  if (typeof draft !== 'boolean') {
    throw httpError(400, 'draft must be a boolean');
  }
  const fields = { title, description, pubDate, tags, draft };
  if (updatedDate !== undefined) {
    fields.updatedDate = updatedDate;
  }
  return fields;
}

export async function listPosts(blogDir) {
  const entries = await readdir(blogDir);
  const posts = [];
  for (const entry of entries.filter((f) => f.endsWith('.md'))) {
    const raw = await readFile(path.join(blogDir, entry), 'utf8');
    const { yamlText } = splitDocument(raw);
    posts.push({
      slug: entry.slice(0, -3),
      fields: parseFrontmatter(yamlText),
      hash: hashOf(raw),
    });
  }
  posts.sort((a, b) => b.fields.pubDate.localeCompare(a.fields.pubDate));
  return posts;
}

export async function readPost(blogDir, slug) {
  const filePath = resolvePostPath(blogDir, slug);
  let raw;
  try {
    raw = await readFile(filePath, 'utf8');
  } catch (cause) {
    if (cause.code === 'ENOENT') {
      throw httpError(404, `post not found: ${slug}`);
    }
    throw cause;
  }
  const { yamlText, body } = splitDocument(raw);
  return {
    slug,
    fields: parseFrontmatter(yamlText),
    body,
    hash: hashOf(raw),
  };
}

export async function writePost(blogDir, slug, fields, body, expectedHash) {
  const filePath = resolvePostPath(blogDir, slug);
  const current = await readFile(filePath, 'utf8');
  const currentHash = hashOf(current);
  if (currentHash !== expectedHash) {
    throw httpError(409, 'file changed on disk since last load', { hash: currentHash });
  }
  if (typeof body !== 'string') {
    throw httpError(400, 'body must be a string');
  }
  const next = assembleDocument(normalizeFields(fields), body);
  await writeFile(filePath, next, 'utf8');
  return { hash: hashOf(next) };
}

export async function createPost(blogDir, title) {
  if (typeof title !== 'string' || title.trim().length === 0) {
    throw httpError(400, 'title must be a non-empty string');
  }
  const slug = title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '');
  if (!SLUG_RE.test(slug)) {
    throw httpError(400, 'title does not produce a valid slug');
  }
  const filePath = resolvePostPath(blogDir, slug);
  let exists = true;
  try {
    await access(filePath);
  } catch {
    exists = false;
  }
  if (exists) {
    throw httpError(409, `post already exists: ${slug}`);
  }
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const fields = {
    title: title.trim(),
    description: '',
    pubDate: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
    tags: [],
    draft: true,
  };
  await writeFile(filePath, assembleDocument(fields, '\n'), 'utf8');
  return { slug };
}
