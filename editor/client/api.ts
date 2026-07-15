export interface PostFields {
  title: string;
  description: string;
  pubDate: string;
  updatedDate?: string;
  tags: string[];
  draft: boolean;
}

export interface PostSummary {
  slug: string;
  fields: PostFields;
  hash: string;
}

export interface PostDocument {
  slug: string;
  fields: PostFields;
  body: string;
  hash: string;
}

export class ApiError extends Error {
  status: number;
  payload: Record<string, unknown>;

  constructor(status: number, payload: Record<string, unknown>) {
    super(String(payload.error));
    this.status = status;
    this.payload = payload;
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const payload = await res.json();
  if (!res.ok) {
    throw new ApiError(res.status, payload);
  }
  return payload as T;
}

export function createApi(base: string) {
  const apiBase = `${base}__edit/api`;
  return {
    listPosts(): Promise<{ posts: PostSummary[] }> {
      return request(`${apiBase}/posts`);
    },
    readPost(slug: string): Promise<PostDocument> {
      return request(`${apiBase}/post?slug=${encodeURIComponent(slug)}`);
    },
    writePost(doc: {
      slug: string;
      fields: PostFields;
      body: string;
      expectedHash: string;
    }): Promise<{ hash: string }> {
      return request(`${apiBase}/post`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(doc),
      });
    },
    createPost(title: string): Promise<{ slug: string }> {
      return request(`${apiBase}/new`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      });
    },
    publishPreflight(slug: string): Promise<PublishPreflight> {
      return request(`${apiBase}/publish/preflight?slug=${encodeURIComponent(slug)}`);
    },
    publishPost(doc: { slug: string; message: string }): Promise<{ sha: string }> {
      return request(`${apiBase}/publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(doc),
      });
    },
  };
}

export interface PublishPreflight {
  publishable: boolean;
  blockers: string[];
  fileState: 'new' | 'modified' | 'clean';
  ahead: number;
  behind: number;
  aheadCommits: { sha: string; subject: string }[];
  diff: string;
  repo: { owner: string; name: string };
  actionsUrl: string;
}

export type Api = ReturnType<typeof createApi>;
