# Inline comment API

Routes for inline review comments on a PR's diff, and the GitHub calls behind them. The UI reads this file; keep it in step with `server/app.ts` and `server/github-provider.ts`.

## Conventions

- Every route is a `POST` under `/api/pr/:owner/:name/:number/...`. The repo is `owner/name`, two path segments, and `:number` is the PR number.
- Each route sits under the mutating router, so it needs the host, origin and token guards that the other mutating routes use.
- Bodies are JSON and validated with zod. A bad body returns `400 {"error": "..."}`.
- A bad repo or number returns `400 {"error": "Bad PR reference"}`.
- Every route returns the provider's `ActionResult`: `{ ok: boolean, message: string }`. A GitHub refusal is `ok: false` with GitHub's message.
- A successful write invalidates the cached PR detail for that PR, so the next `GET /api/pr/:owner/:name/:number` reads fresh.
- Phone devices may call these routes like the other PR actions.

## Line and file comments

`subjectType` is `line` or `file`.

- A line comment needs `line` and `side` (`LEFT` or `RIGHT`). A range also needs `startLine` and `startSide`, with `startLine` not after `line`. `startLine` and `startSide` go together.
- A file comment takes no `line`, `side`, `startLine` or `startSide`.

Body fields for both comment routes:

| Field | Type | Notes |
|---|---|---|
| `body` | string | Required. Trimmed, 1 to 65000 characters. |
| `path` | string | Required. 1 to 1000 characters. |
| `line` | integer | Positive. Line comments only. |
| `side` | `LEFT` or `RIGHT` | Line comments only. |
| `startLine` | integer | Positive. Optional, for a range. |
| `startSide` | `LEFT` or `RIGHT` | Optional, for a range. |
| `subjectType` | `line` or `file` | Required. |

### POST /api/pr/:owner/:name/:number/comments/inline

Posts one comment now. Provider method: `addReviewComment`.

GitHub: REST `POST /repos/{owner}/{repo}/pulls/{n}/comments` with `body`, `commit_id` (the PR head sha, read fresh), `path`, and either `line` and `side` (with `start_line` and `start_side` for a range) or `subject_type: "file"` with no line.

### POST /api/pr/:owner/:name/:number/comments/draft

Adds the comment to the viewer's pending review. The review is created first if there is none. Provider method: `addDraftComment`.

GitHub: GraphQL `addPullRequestReview` (no event, so the review is pending) when needed, then `addPullRequestReviewThread` with `pullRequestReviewId`, `path`, `body`, `line`, `side`, `startLine`, `startSide` and `subjectType` (`LINE` or `FILE`).

## Threads

Thread routes take the GraphQL thread id from the detail payload (`threadId` on a thread item).

### POST /api/pr/:owner/:name/:number/threads/reply

Body: `{ threadId, body }`. Replies now as a live comment. Provider method: `replyToThread`.

GitHub: GraphQL `addPullRequestReviewThreadReply` with `pullRequestReviewThreadId` and `body`.

### POST /api/pr/:owner/:name/:number/threads/resolve

Body: `{ threadId }`. Provider method: `resolveThread`. GitHub: GraphQL `resolveReviewThread`.

### POST /api/pr/:owner/:name/:number/threads/unresolve

Body: `{ threadId }`. Provider method: `unresolveThread`. GitHub: GraphQL `unresolveReviewThread`.

## Drafts

Draft routes take the GraphQL id of a draft comment (the `id` of the draft's comment in the detail payload).

### POST /api/pr/:owner/:name/:number/drafts/edit

Body: `{ commentId, body }`. Provider method: `editDraftComment`. GitHub: GraphQL `updatePullRequestReviewComment` with `pullRequestReviewCommentId` and `body`.

### POST /api/pr/:owner/:name/:number/drafts/delete

Body: `{ commentId }`. Provider method: `deleteDraftComment`. GitHub: GraphQL `deletePullRequestReviewComment` with `id`.

### POST /api/pr/:owner/:name/:number/review/discard

No body. Deletes the viewer's whole pending review and all of its drafts. Provider method: `discardPendingReview`. GitHub: GraphQL `deletePullRequestReview` with `pullRequestReviewId`. With no pending review it returns `ok: true` and changes nothing.

## Finishing a review

`POST /api/review` (existing route) keeps its body: `{ repo, number, event, body }`, where `event` is `COMMENT`, `APPROVE` or `REQUEST_CHANGES`.

When the viewer has a pending review, the provider submits that review with the event and body: GraphQL `submitPullRequestReview` with `pullRequestReviewId`, `event` and `body`. When there is none, it creates a review as before: REST `POST /repos/{o}/{r}/pulls/{n}/reviews`.

## Detail payload

`GET /api/pr/:owner/:name/:number` carries:

- `thread`: thread items. A thread has `threadId`, `path`, `line`, `side` (`LEFT` or `RIGHT`), `startLine` and `startSide` when it is a range, `resolved`, `isOutdated`, and `pending` (true for the viewer's draft threads).
- `pendingReview`: `{ id, drafts }` when the viewer has a pending review, absent otherwise. `drafts` is the draft count.

The detail cache version is `DETAIL_VERSION` in `server/pr-cache.ts`. It was bumped to 5 with these fields.

## Markdown preview

### POST /api/markdown

Not PR-scoped. Body: `{ repo, text }`, where `text` is 1 to 65536 characters. Returns `{ html }`: GitHub's GFM render of `text` in the context of `repo` (REST `POST /markdown`). GitHub's HTML is returned as is, so the client sanitises it before insertion. Provider method: `renderMarkdown`. The fixture provider returns the text HTML-escaped inside a `<p>`.

## Fixtures

With `NOD_FIXTURES=1` the fixture PR (acme-co/acme-api #310) shows every state: one open and outdated thread, one resolved thread, and a pending review with two drafts. Mutations change the fixture state in memory and make no network call. A reply to a fixture thread appends a comment to it on the next detail read.
