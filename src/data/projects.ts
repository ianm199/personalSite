export interface Project {
  repo: string;
  title: string;
  blurb: string;
  language: string;
  featured: boolean;
}

export const githubUser = 'ianm199';

export const projects: Project[] = [
  {
    repo: 'omnilua',
    title: 'omnilua',
    blurb:
      'A pure-Rust Lua interpreter covering Lua 5.1 through 5.5 — passes the upstream test suites, runs real LuaRocks packages, and compiles to wasm.',
    language: 'Rust',
    featured: true,
  },
  {
    repo: 'valdr',
    title: 'valdr',
    blurb:
      'A Valkey/Redis-compatible cache and store in safe Rust — roughly 98% drop-in for non-clustered single-node deployments.',
    language: 'Rust',
    featured: true,
  },
  {
    repo: 'unofficialWhoopAPI',
    title: 'unofficial Whoop API',
    blurb:
      'A Python client for the Whoop fitness API, and my most widely used project.',
    language: 'Python',
    featured: true,
  },
  {
    repo: 'bubble-analysis',
    title: 'bubble',
    blurb:
      'A static analysis tool that traces uncaught exceptions across Python web frameworks, surfacing real bugs in projects like httpbin, Redash, Airflow, and Label Studio.',
    language: 'Python',
    featured: true,
  },
  {
    repo: 'blirbBackendPublic',
    title: 'blirb backend',
    blurb:
      'The Django REST backend for blirb.io, a social app for recommending movies, shows, books, and podcasts to your friend groups — built with my brother and a friend, integrating TMDB, Spotify, and the Google Books API.',
    language: 'Python',
    featured: false,
  },
  {
    repo: 'smcprobe',
    title: 'smcprobe',
    blurb:
      'A live hardware digital twin and SMC reverse-engineering harness for Apple Silicon.',
    language: 'Rust',
    featured: false,
  },
];
