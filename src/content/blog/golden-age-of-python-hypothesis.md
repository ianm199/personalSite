---
title: "AI agents are unlocking a new class of software tools that require a custom integration per project or framework"
description: "Using static analysis to find production bugs open source projects like httpbin, Redash, Airflow, and Label Studio"
pubDate: 2026-02-02
tags: ["python", "static-analysis", "tooling"]
draft: false
---
## The problem with Python backend APIs

Backend APIs ideally should never raise unexpected, uncaught errors. The user ends up getting back a generic 500
error message that will make debugging slow and require someone to look at logs. In the worst case, uncaught exceptions can end up with your program saving bad data or breaking user flows. For example if an endpoint transfers money by calling an external API, and you don't handle the possible failures from `requests.get()` the user request might get stuck in some sort of "processing" state that requires manual intervention. For this reason, amongst others, many API driven products end up writing their backends in languages like Go and Kotlin that force the developer to handle exceptions explicitly.

## Example bug found in HTTPBin

Here is a simple bug found in [httpbin](https://github.com/postmanlabs/httpbin), a popular repository owned by Postman that people use to test HTTP clients. Bubble found an uncaught `ValueError` when you send an invalid `qop` (quality of protection) parameter in the digest authorization header.

**Try it yourself** (this works on the live httpbin.org right now):

```bash
# Bug: Invalid qop parameter returns 500 instead of 401
curl -s -o /dev/null -w "%{http_code}\n" \
  -H 'Authorization: Digest username="u", realm="r", nonce="n", uri="/", qop=INVALID, nc=1, cnonce="c", response="r"' \
  'https://httpbin.org/digest-auth/auth/user/passwd'
# Returns: 500

# Expected: Valid qop parameter returns 401 (wrong password, but proper error)
curl -s -o /dev/null -w "%{http_code}\n" \
  -H 'Authorization: Digest username="u", realm="r", nonce="n", uri="/", qop=auth, nc=1, cnonce="c", response="r"' \
  'https://httpbin.org/digest-auth/auth/user/passwd'
# Returns: 401
```

Is this a real bug or a design choice? It's a bug - [RFC 7616](https://datatracker.ietf.org/doc/html/rfc7616) states:
>  If a parameter or its value is improper, or required parameters are missing, the proper response is a 4xx error code.

## Issues found in Open Source Python Projects

The tool flags endpoints where exceptions escape to global handlers. Human review then confirms which are real bugs.

```
PROJECT          FRAMEWORK    ENDPOINTS   FLAGGED      BUGS
─────────────────────────────────────────────────────────────
httpbin          Flask              55     3  (5%)        1
Redash           Flask             135   119 (88%)        3
Airflow          FastAPI           122    31 (25%)        5
Label Studio     Django/DRF        124    85 (69%)        3
─────────────────────────────────────────────────────────────
                                   436   238            12
```

High "flagged" counts (like Redash's 88%) indicate shared code paths - e.g., a `get_setting()` function called on every request that *can* raise `KeyError`. Static analysis flags all of them; human review determines which are actually reachable.

The pattern across all confirmed bugs: **the correct exception handling already exists in the same codebase**. These are inconsistencies, not design decisions. (Bug reports written by Claude Code, the rest written by me)

<details>
<summary><strong>httpbin</strong> — 1 confirmed bug (live reproducible)</summary>

### ValueError in Digest Authentication

**Call Stack:**
```
GET /digest-auth/auth/user/passwd
  → digest_auth()           core.py:1120
    → check_digest_auth()   helpers.py:353
      → response()          helpers.py:311
        → HA2()             helpers.py:296
          → raise ValueError
```

**User Impact:**

| Expected | Actual |
|----------|--------|
| `401 Unauthorized` with error message | `500 Internal Server Error` |

**Why it's real:**
- No `@app.errorhandler(ValueError)` exists
- User-triggerable via malformed Authorization header
- Violates [RFC 7616](https://datatracker.ietf.org/doc/html/rfc7616): "If a parameter or its value is improper... the proper response is a 4xx error code"

**Try it yourself:**
```bash
curl -s -o /dev/null -w "%{http_code}" \
  -H 'Authorization: Digest username="u", realm="r", nonce="n", uri="/", qop=INVALID, nc=1, cnonce="c", response="r"' \
  'https://httpbin.org/digest-auth/auth/user/passwd'
# Returns: 500 (should be 401)
```

</details>

<details>
<summary><strong>Redash</strong> — 3 confirmed bugs</summary>

### Bug 1: QueryDropdownsResource Missing Exception Handling

**Call Stack:**
```
GET /api/queries/123/dropdowns/456
  → QueryDropdownsResource.get()   query_results.py:204
    → dropdown_values()            query_results.py:178
      → raise QueryDetachedFromDataSourceError
```

**User Impact:**

| Expected | Actual |
|----------|--------|
| `400` with "query detached from data source" | `500 Internal Server Error` |

**Why it's real** — the correct pattern exists **10 lines earlier** in the same file:

```python
# Line 194 - CORRECT
class QueryResultDropdownResource(BaseResource):
    def get(self, query_id):
        try:
            return dropdown_values(query_id, self.current_org)
        except QueryDetachedFromDataSourceError as e:
            abort(400, message=str(e))

# Line 204 - BUG
class QueryDropdownsResource(BaseResource):
    def get(self, query_id, dropdown_query_id):
        return dropdown_values(dropdown_query_id, self.current_org)  # No try/except!
```

---

### Bug 2: ValueError in Boolean Parameter Parsing

**Call Stack:**
```
GET /api/users?disabled=invalid
  → UserListResource.get()   users.py:115
    → parse_boolean()        helpers.py:22
      → raise ValueError
```

**User Impact:**

| Expected | Actual |
|----------|--------|
| `400` with "invalid boolean value" | `500 Internal Server Error` |

**Why it's real** — same file validates other params correctly:
```python
# BUG: No validation
disabled = parse_boolean(disabled)

# Same file, CORRECT pattern:
if page < 1:
    abort(400, message="Page must be positive integer.")
```

---

### Bug 3: KeyError on Invalid Settings

**Call Stack:**
```
POST /api/settings/organization
  → OrganizationSettings.post()   settings.py:42
    → set_setting()               organizations.py:58
      → raise KeyError
```

**User Impact:**

| Expected | Actual |
|----------|--------|
| `400` with "invalid setting key" | `500 Internal Server Error` |

**Why it's real:** Other handlers use `require_fields()` to validate input first.

</details>

<details>
<summary><strong>Label Studio</strong> — 3 confirmed bugs</summary>

### Bug 1: Storage Sync Missing Exception Handling (10 endpoints)

**Call Stack:**
```
POST /api/storages/s3/123/sync
  → ImportStorageSyncAPI.post()     api.py:129
    → storage.validate_connection() base_models.py:298
      → raise KeyError
```

**User Impact:**

| Expected | Actual |
|----------|--------|
| `400` with "connection failed: check credentials" | `500 Internal Server Error` |

**Why it's real** — same `validate_connection()` call is wrapped in try/except in the create endpoint:

```python
# api.py:129 - BUG (sync endpoint)
def post(self, request, *args, **kwargs):
    storage.validate_connection()  # No try/except!
    storage.sync()

# api.py:86 - CORRECT (create endpoint)
def perform_create(self, serializer):
    try:
        instance.validate_connection()
    except Exception as exc:
        raise ValidationError(exc)  # Returns 400
```

**Affects 10 endpoints:** S3, Azure, GCS, Redis, LocalFiles × (import + export)

---

### Bug 2: DataManagerException Wrong Base Class

```python
# data_manager/functions.py:21 - BUG
class DataManagerException(Exception):  # Should extend APIException!
    pass
```

DRF automatically handles `APIException` subclasses. This extends plain `Exception`, so it escapes to 500.

**Why it's real** — the correct base class exists in the same codebase:
```python
class LabelStudioAPIException(APIException):
    status_code = status.HTTP_500_INTERNAL_SERVER_ERROR

class AnnotationDuplicateError(LabelStudioAPIException):  # Correct!
    status_code = status.HTTP_409_CONFLICT
```

</details>

<details>
<summary><strong>Airflow</strong> — 5 confirmed bugs</summary>

### Bug 1: RuntimeError from Uninitialized Auth Manager (128+ routes)

**Call Stack:**
```
GET /auth/menus
  → get_auth_menus()      auth.py:32
    → get_auth_manager()  app.py:158
      → raise RuntimeError("Auth Manager has not been initialized")
```

**User Impact:**

| Expected | Actual |
|----------|--------|
| `503 Service Unavailable` | `500 Internal Server Error` |

**Why it's real** — correct pattern exists (dependency injection), but 23 call sites use the wrong global accessor:

```python
# BUG - global state access
def get_auth_manager() -> BaseAuthManager:
    if _AuthManagerState.instance is None:
        raise RuntimeError("Auth Manager has not been initialized")
    return _AuthManagerState.instance

# CORRECT - dependency injection (exists in same codebase)
AuthManagerDep = Annotated[BaseAuthManager, Depends(auth_manager_from_app)]
```

This affects **128+ routes** via security callbacks that use `get_auth_manager()`.

---

### Bug 2: TypeError in Asset Expression Parsing

**Call Stack:**
```
GET /structure_data
  → get_upstream_assets()   structure.py:37
    → raise TypeError("Unsupported type: ...")
```

**User Impact:**

| Expected | Actual |
|----------|--------|
| `400` with validation error | `500 Internal Server Error` |

**Why it's real:** User-controlled DAG definition reaches this code. The error message exists but never reaches the user.

---

### Bug 3: ValueError in Task Instance Run

**Call Stack:**
```
PATCH /{task_instance_id}/run
  → ti_run()              task_instances.py:101
    → raise ValueError("DagRun not found")
```

**Why it's real:** Same route catches `SQLAlchemyError` but not `ValueError`. The error is even logged, suggesting it's expected.

---

### Bugs 4-5: Additional ValueError instances

Similar patterns in `dependencies.py` and `calendar.py` where `ValueError` escapes without proper handling.

</details>

---

## [Bubble](https://github.com/ianm199/bubble-analysis)

Finding bugs across Flask, FastAPI, and Django required understanding how each framework handles exceptions differently. What Bubble does is take in entrypoints to programs and determine which errors will be caught and which end up propagating past the entrypoint to the high level exception handler. The reason I made it was partially because it seems to be a genuine gap in the Python tooling ecosystem and because I have been exploring "AI Agent first" development tools in the repos I work with. In many of the repos I work in I create fully custom tools to help Claude/ AI agents better understand and interact with the codebase - but this case is more general.

Doing this pattern - understanding entrypoints, how errors are caught in a framework or library, understanding the relationships between subtypes and whatnot is something that needs to be handled differently for each framework or library. The great and awful thing about Python is that it lets you do "code magic" with decorators, context managers, and lots of other tricks. This has been a serious blocker for great dev tooling in Python since it is hard to make a one size fits all tool for these and in the past it was unrealistic for a tool to be able to keep up with all this. Sentry, for example, started out as a django specific tool.


## Claude Code as the System Integrator

Every framework has different exception handling practices. Before it would've been unrealistic to do lots of custom work to integrate a software quality tool - it needed to work out of the box. Now a new class of tool or system that needs custom integration work per repository or per use case is possible since AI agents like Claude Code can do large portions of the integration work. This pattern is particularly strong for developer tools or domains like data pipelines where there is strong machine readable feedback and the agent can run it multiple times, get feedback and sanity check it, and adjust accordingly. Not to say that Claude Code is perfect at this now but it is sufficient and only getting better.

In this program specifically the "custom integration" is implementing an interface to detect which functions are exposed API routes, what functions are error handlers, and what exceptions are "handled out of the box" by the framework like `HttpException` in Flask/ FastAPI. So what Claude Code did to [integrate FastAPI for example](https://github.com/ianm199/bubble-analysis/blob/main/bubble/integrations/fastapi/detector.py) is define custom AST vistors to detect routes and exception handlers.

I think we will see this pattern play out across the software economy not just for developer tools. There are entire industries around software with high integration costs and the promise of a big payoff - companies like Palantir, Salesforce, Oracle, and others have full ecosystems around their system integrators. In many cases they only go after 7+ figure contracts. This is an area I will be watching closely - products and strategies that weren't even possible 12 months ago because the the unit economics of custom integration work made them unworkable.

## The future of Python and backend development

It will be interesting to see if Python's share of backend development will grow or shrink in the next era. My hope is that Python will get increasingly strong tools and we are just entering a golden age.

## Try it yourself

```bash
pip install bubble-analysis

# Audit a Flask project
bubble flask audit -d /path/to/your/project

# Audit a FastAPI project
bubble fastapi audit -d /path/to/your/project

# Trace exceptions from a specific function
bubble escapes some_function -d /path/to/your/project
```

The tool supports Flask, FastAPI, and Django right now. 
