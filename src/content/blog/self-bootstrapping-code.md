---
title: "Self-Bootstrapping Code: Building a multi-language microservice analyzer from a single prompt"
description: "When the spec matters more than the code and agents can close the gap between the two"
pubDate: 2026-02-27
tags: ["python", "static-analysis", "tooling", "ai-agents"]
draft: false
---

## From exception tracing to dependency mapping

In a [previous post](/personalSite/blog/golden-age-of-python-hypothesis) I built [Bubble](https://github.com/ianm199/bubble-analysis), a static analysis tool that traces uncaught exceptions across Python web frameworks. The argument was that AI agents make a new class of developer tool possible - tools that need custom integration per framework or per repository, where the economics of that integration work used to be prohibitive.

[Crosslink](https://github.com/ianm199/crosslink-attempt-1) is the same idea applied to a harder problem: mapping inter-service dependencies across an entire microservice architecture, across languages, using static analysis and tree-sitter. I built it in a single Claude Code session using the `/bootstrap` command. I came across this problem at work while I was trying to work across multiple microservices (distributed monolith really) and saw how much worse AI agent performance was on them. I'd always thought it would be nice to tie these together in IDEs as well.

## What Crosslink does

Crosslink scans a multi-service repository and builds a dependency graph. For each service it finds what endpoints the service **exposes** (server extractors) and what other services it **calls** (client extractors). A resolver then matches calls to endpoints to produce the full graph.

Here is the output from scanning Google's [Online Boutique](https://github.com/GoogleCloudPlatform/microservices-demo), an 11-service reference architecture spanning Go, Python, Java, C#, and JavaScript:

```
microservices-demo
├── frontend (Go)
│   ├── → productcatalogservice (gRPC: ListProducts, GetProduct)
│   ├── → currencyservice (gRPC: GetSupportedCurrencies, Convert)
│   ├── → cartservice (gRPC: GetCart, AddItem, EmptyCart)
│   ├── → recommendationservice (gRPC: ListRecommendations)
│   ├── → checkoutservice (gRPC: PlaceOrder)
│   ├── → shippingservice (gRPC: GetQuote)
│   └── → adservice (gRPC: GetAds)
├── checkoutservice (Go)
│   ├── → productcatalogservice (gRPC: GetProduct)
│   ├── → cartservice (gRPC: GetCart)
│   ├── → currencyservice (gRPC: Convert)
│   ├── → shippingservice (gRPC: GetQuote, ShipOrder)
│   ├── → paymentservice (gRPC: Charge)
│   └── → emailservice (gRPC: SendOrderConfirmation)
├── recommendationservice (Python)
│   └── → productcatalogservice (gRPC: ListProducts)
├── productcatalogservice (Go)
├── cartservice (C#)
├── currencyservice (Node.js)
├── shippingservice (Go)
├── paymentservice (Node.js)
├── emailservice (Python)
├── adservice (Java)
└── loadgenerator (Python)
    └── → frontend (HTTP: GET /, POST /cart, POST /cart/checkout, ...)
```

14 out of 14 expected dependency edges found.

## The bootstrap session

The whole thing came out of a single `/bootstrap` session -- about 850K tokens of work across a swarm of parallel subagents. The [full transcript](/personalSite/transcripts/crosslink-bootstrap.txt) is available if you want to read the raw session.

The prompt was one paragraph:

```
❯ /bootstrap lets make a CLI tool that analyzes depdencies between microservices
 so that it can genearte a depdendencies tree, detect cycles in microsevices,
and let agents and users understand micrsoervices at large companies better. It
needs to be able to parse many languages but can be based in python typer/
tree-sitter for itnerface and cli. It should also in the long expose info to LSP
 servers so we can make an IDE extension that routes between many projects or
folders
```

Typos and all. Before writing any code, Claude generated a full behavior spec covering CLI commands, a SQLite data model, an extraction strategy, per-language extractor requirements across 6 languages, training repos, held-out test repos, and a synthetic toy dataset. Then it proposed a phased build plan that parallelized independent work across subagents. I said "Go."

The build ran in phases -- scaffold, then foundation agents in parallel, then one extractor agent per language in parallel, then CLI agents. Zero merge conflicts across any phase.

<details>
<summary><strong>The spec and build plan</strong></summary>

### Generated spec (excerpt)

```
Extraction Strategy (the hard part)

Two-sided matching:
1. Server extractors — find endpoints each service exposes (decorators, route
   registrations, gRPC service implementations)
2. Client extractors — find outbound calls each service makes (requests.get,
   grpc stubs, custom client wrappers)
3. Resolver — matches calls → endpoints by URL pattern, gRPC service/method,
   or proto definition

Must handle messy patterns:
- Direct URLs: requests.get("http://checkout:8080/api/place-order")
- Client wrappers: self.stub.GetProduct(request) (gRPC)
- Framework patterns: @app.route("/cart"), router.HandleFunc("/products", handler)
- String concatenation and f-strings where feasible
```

The spec also defined extractors for Python (Flask, FastAPI, Django, gRPC), Go (gin, mux, net/http, gRPC), Java (Spring Boot, gRPC), C# (ASP.NET Core, gRPC), and JS/TS (Express, Fastify, gRPC). It picked Google Online Boutique, Train Ticket, and Sock Shop as training repos, with Istio Bookinfo and Microsoft eShop held out for testing.

### Build plan

```
- Phase 1 (sequential): Scaffold — pyproject.toml, package structure, core
  models/enums, venv, verify imports
- Phase 2 (4 parallel agents): Foundation — SQLite storage layer, extractor
  protocol + registry, tree-sitter setup + language registry, proto file parser
- Phase 3 (6 parallel agents): Extractors — Python, Go, Java, C#, JS/TS,
  scanner/resolver pipeline
- Phase 4 (2 parallel agents): Interface — CLI commands (Typer), output
  formatters (Rich tables, tree view, DOT graph)
- Phase 5: Training validation — scan all 3 training repos, compare against
  ground truth, iterate
- Phase 6: Test generalization — scan held-out repos, report accuracy
```

</details>

<details>
<summary><strong>Parallel agent execution</strong></summary>

Phase 2 had 4 agents building independent foundation modules simultaneously:

```
┌───────┬──────────────────────────────┬─────────┐
│ Agent │             Task             │ Status  │
├───────┼──────────────────────────────┼─────────┤
│ A     │ SQLite storage layer (db.py) │ Running │
│ B     │ Extractor registry           │ Running │
│ C     │ Tree-sitter parsing setup    │ Running │
│ D     │ Proto file parser            │ Running │
└───────┴──────────────────────────────┴─────────┘
```

Phase 3 scaled up to 6 -- one per language extractor plus the scanner/resolver:

```
Agent: Python extractor
Task: Server (Flask/FastAPI/Django/gRPC) + Client (requests/httpx/gRPC stubs)
Status: Running
────────────────────────────────────────
Agent: Go extractor
Task: Server (gin/mux/net-http/gRPC) + Client (http.Get/gRPC)
Status: Running
────────────────────────────────────────
Agent: Java extractor
Task: Server (Spring Boot/gRPC) + Client (RestTemplate/gRPC)
Status: Running
────────────────────────────────────────
Agent: C# extractor
Task: Server (ASP.NET Core/gRPC) + Client (HttpClient/gRPC)
Status: Running
────────────────────────────────────────
Agent: JS/TS extractor
Task: Server (Express/Fastify) + Client (fetch/axios)
Status: Running
────────────────────────────────────────
Agent: Scanner/Resolver
Task: Service discovery + call→endpoint matching
Status: Running
```

Wall clock times:

```
PHASE                AGENTS    WALL CLOCK
──────────────────────────────────────────
Foundation           4         ~6 min
Extractors           6         ~3.5 min
CLI + Formatters     2         ~1.5 min
Debugging fixes      2-4       ~10 min
```

</details>

### The debugging cycle

The build was the easy part. The interesting stuff happened when the code hit a real codebase. First scan found only 4 outbound calls across 11 services -- should have been 20+. Three rounds of fix agents later: 4 calls → 22 calls (with broken resolution) → 14/14 correct edges. The agent diagnosed each failure from real output and fixed the root causes without any hand-holding.

<details>
<summary><strong>The debugging progression: 4 → 22 → 14/14</strong></summary>

**First scan: 4 calls found.** 11 services, 39 endpoints detected, but only 4 outbound calls. Go gRPC uses chained calls like `pb.NewProductCatalogServiceClient(conn).ListProducts(ctx, req)` and Python uses module-level stub variables -- neither pattern was being detected.

**Second scan: 22 calls found.** Two fix agents later, calls jumped from 4 to 22. But the dependency tree showed every call resolving to `emailservice`. The resolver was matching gRPC calls to generated `_pb2_grpc.py` files that contained all proto service definitions because they were auto-generated from shared proto files.

**Final scan: 14/14 edges.** Two more fix agents -- a generated-file filter and proto-based gRPC resolution -- and every expected dependency edge was found.

```
┌───────────────────────┬──────────────────────────────┬──────────┬──────────┐
│        Source         │        Targets Found         │ Expected │  Match?  │
├───────────────────────┼──────────────────────────────┼──────────┼──────────┤
│                       │ productcatalogservice,       │          │          │
│                       │ currencyservice,             │          │          │
│ frontend              │ cartservice,                 │ 7        │ 7/7      │
│                       │ recommendationservice,       │ targets  │          │
│                       │ checkoutservice,             │          │          │
│                       │ shippingservice, adservice   │          │          │
├───────────────────────┼──────────────────────────────┼──────────┼──────────┤
│                       │ productcatalogservice,       │          │          │
│                       │ cartservice,                 │ 6        │          │
│ checkoutservice       │ currencyservice,             │ targets  │ 6/6      │
│                       │ shippingservice,             │          │          │
│                       │ paymentservice, emailservice │          │          │
├───────────────────────┼──────────────────────────────┼──────────┼──────────┤
│ recommendationservice │ productcatalogservice        │ 1 target │ 1/1      │
└───────────────────────┴──────────────────────────────┴──────────┴──────────┘
```

</details>

## Self-bootstrapping code

The 4 → 22 → 14/14 progression is the whole point.

The spec Claude generated was correct. It said "must handle chained gRPC calls" and "must handle module-level stubs." The first implementation just didn't cover those patterns yet. But because the spec also defined *how to validate* -- scan Online Boutique, compare against known edges -- the gap was obvious the moment it ran. The agent saw the gap, diagnosed the cause, and closed it without me doing anything.

And if I threw the code away and kept the spec, I could regenerate the code. The reverse is not true. **The spec is the more important artifact.**

I think this inverts how most developers (myself included) have thought about code. Normally the code *is* the spec -- it's the source of truth for what the software does, and any separate documentation drifts out of date almost immediately. But when an agent can produce a working implementation from a spec, the spec becomes primary and the code becomes derived. You start caring less about the code itself and more about whether you specified the right thing.

### Integration costs go to zero - dev tools are a leading indicator

Bubble and Crosslink are the same bet - that we are entering a new world where there will be new software products based on a deep integration per use case or per customer. Before it would've been impractical to do these kinds of custom tools for productivity or quality of life increases. I think we are going to start seeing these everywhere.

![USPS Next Generation Delivery Vehicle at USPS Headquarters](/personalSite/images/usps-ngdv.jpg)

USPS mail carriers drove the same [Grumman LLV](https://en.wikipedia.org/wiki/Grumman_LLV) trucks for 30+ years -- no AC, no airbags, [literally catching fire](https://www.thedrive.com/news/34666/us-postal-services-aging-trucks-keep-catching-fire) -- because building a custom vehicle for the specific job of delivering mail is expensive. Off-the-shelf trucks don't work (you need right-hand drive, stand-up cargo space, a curbside package door). It took until 2024 for USPS to finally get purpose-built trucks [designed from the ground up around what carriers actually do](https://about.usps.com/newsroom/national-releases/2024/1030-usps-headquarters-showcases-new-next-generation-delivery-vehicle.htm). $11.6 billion, 66,000 vehicles.

That's what custom tooling looks like in the physical world. In software, every developer, every team, every company has workflows that are just as specific as mail delivery -- but the cost of building purpose-made tools for them has been too high to justify. You live with the generic thing that mostly works, the same way mail carriers lived with trucks that had no air conditioning for three decades. When the cost of "build something custom for this specific job" drops far enough, everyone gets their own version of the NGDV. Dev tools are just the leading indicator because they're the easiest to validate -- you can run tests, scan repos, check outputs. But the pattern applies anywhere the work is specific enough that generic tools leave real productivity on the table.

## The verification loop and what comes next

The crosslink debugging cycle worked because the agent had a tight feedback loop: scan a real repo, compare against known edges, diagnose the delta, fix, repeat. The spec defined both the desired behavior and the test. The agent just had to close the gap.

OpenAI's recent [GPT-5.2 physics result](https://openai.com/index/new-result-theoretical-physics/) has the same shape. Physicists had worked out gluon scattering amplitude formulas for small cases by hand but couldn't simplify them or find the general pattern. They pointed GPT-5.2 at the problem and in 12 hours it derived a closed-form expression valid for all cases:

![The simplified gluon amplitude formulas GPT-5.2 derived for n=3 through n=6, from the paper "Single-minus gluon tree amplitudes are nonzero"](/personalSite/images/gluon-equation.png)

You can see the pattern in the equations -- each case adds one more factor, with a power of 1/2 out front. Physicists had the individual cases but couldn't see this structure. One of the authors described the effort as "collaborative" -- the humans knew a simpler formula *should* exist, could frame the problem, and could verify the output. The AI did the computational work of actually finding it.

Same structure both times: human defines the problem and the verification criteria, agent does the work, human checks the output. For crosslink the check was "does the dependency tree match the known architecture of Online Boutique." For the physics paper it was "does this formula reproduce the known results for n=1 through 6."

What I keep thinking about is the recursive version of this. Crosslink is a tool that helps agents understand codebases -- it maps the dependency graph so an agent working in one service knows what other services it affects. Bubble finds bugs that agents can then fix. Both tools were built by agents. Agents building tools that make agents better at building tools. Each cycle still depends on humans defining the right problem and the right verification criteria, but the amount of useful work per cycle keeps going up.

I don't think the bottleneck is whether agents can do the work -- they clearly can when the problem is structured and the output is verifiable. The bottleneck is how fast we can turn open-ended problems into structured ones. And agents are getting better at building exactly the scaffolding that does that -- the test suites, the validation datasets, the ground truth comparisons. Crosslink's spec included its own training data and evaluation criteria. The agent didn't just build the tool, it built the apparatus for checking whether the tool worked.

## Try it yourself

```bash
pip install crosslink

crosslink scan /path/to/microservices --proto-dir /path/to/protos

crosslink tree

crosslink cycles
```

The tool supports Python, Go, Java, C#, JavaScript, and TypeScript. Per-language and per-framework extractors are independent modules, so adding new ones is a contained task -- the kind of thing an agent can do from a good spec.
