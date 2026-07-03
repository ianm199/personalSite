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
    repo: 'bms-lua-rs',
    title: 'bms-lua-rs',
    blurb:
      'Lua scripting inside a Bevy wasm build with no C dependency — runs Game of Life in-browser through a live editor, on top of lua-rs.',
    language: 'Rust',
    featured: false,
  },
  {
    repo: 'darkhttpd-rs',
    title: 'darkhttpd-rs',
    blurb: 'An evidence-driven Rust port of the darkhttpd web server.',
    language: 'Rust',
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
