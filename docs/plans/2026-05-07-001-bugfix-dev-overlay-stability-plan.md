---
status: active
created: 2026-05-07
type: bugfix
---

# Dev Overlay Stability Plan

## Problem Frame

The running Next.js app shows development overlay issues while navigating authenticated pages. The visible `/competitions` issue is a React list key warning caused by missing participant identifiers in the competition query shape. Browser and server logs also show Next 15 dynamic API warnings from synchronous cookie access in auth helpers, plus Recharts container-size warnings on dashboard charts.

## Scope

- Fix development overlay warnings that are caused by application code.
- Preserve existing auth behavior, session cookie name, and route guard semantics.
- Preserve existing competition and leaderboard behavior while returning enough data for current UI consumers.
- Keep chart rendering changes scoped to container sizing and responsive behavior.

## Requirements

- R1: `/competitions` must render participants and pending requests without React key warnings.
- R2: Auth helpers must use Next 15 dynamic request APIs asynchronously.
- R3: Dashboard charts must avoid zero/negative dimension warnings during normal page load.
- R4: Changes must not broaden user access, alter approval rules, or change P&L/leaderboard formulas.

## Implementation Units

### U1: Align Competition Query Shape With UI Consumers

**Files:** `lib/queries.ts`, `app/competitions/page.tsx`, `app/leaderboard/page.tsx`

Return stable participant IDs and enough pending-request user metadata from `getCompetitions()` for the competition management page and leaderboard join state. Keep the query scoped to existing relation data already consumed by the UI.

**Patterns to follow:**
- Existing Prisma `select` objects in `lib/queries.ts`
- Existing server-rendered page data flow in `app/competitions/page.tsx`

**Test scenarios:**
- Happy path: A competition with participants renders participant names without React key warnings.
- Happy path: A competition with pending join requests renders requester name and email.
- Edge case: A competition with no pending requests still renders the empty state.
- Integration: `/leaderboard` can still detect joined and pending-request states from the returned competition list.

**Verification:** Navigating to `/competitions` should no longer show the React unique key issue.

### U2: Update Auth Cookie Helpers For Next 15

**Files:** `lib/auth.ts`

Await `cookies()` once per helper before reading, writing, or deleting the `stockscript_session` cookie. Preserve session TTL, cookie options, DB-backed session lookup, and redirect behavior.

**Patterns to follow:**
- Existing async auth helper shape in `lib/auth.ts`
- Next App Router server-side route/page usage

**Test scenarios:**
- Happy path: Login creates a session cookie and redirects active users.
- Happy path: Authenticated pages can read the current user without dynamic API warnings.
- Edge case: Missing or expired session still returns `null` and routes to `/login`.
- Integration: Logout deletes the DB session and cookie.

**Verification:** Server and browser logs should no longer report `cookies().get`, `cookies().set`, or `cookies().delete` sync dynamic API warnings after refresh.

### U3: Stabilize Dashboard Chart Containers

**Files:** `components/dashboard-charts.tsx`

Ensure chart containers have stable positive dimensions before Recharts `ResponsiveContainer` measures them. Avoid changing metric calculations or chart data preparation.

**Patterns to follow:**
- Existing chart component layout and Tailwind styling
- Recharts `ResponsiveContainer` usage already present in the project

**Test scenarios:**
- Happy path: `/dashboard` renders charts without Recharts negative width/height warnings.
- Edge case: Empty or sparse trade data still renders the dashboard without chart container warnings.
- Integration: Dashboard metric cards and chart sections remain visible at desktop width.

**Verification:** Browser console should not emit Recharts `width(-1) and height(-1)` warnings on dashboard load.

## System-Wide Impact

- **Interaction graph:** Login, route guards, global app shell, competitions, leaderboard, and dashboard read the touched helpers or query results.
- **Error propagation:** Auth helper failures should continue to surface through existing redirects or API error responses.
- **State lifecycle risks:** Cookie writes/deletes must remain tied to the same request lifecycle and session DB rows.
- **API surface parity:** No public JSON contract changes beyond adding selected relation fields to server-side query results.
- **Integration coverage:** Browser navigation should cover login, competitions, leaderboard, dashboard, and logout if possible.
- **Unchanged invariants:** Role checks, approval checks, session TTL, competition formulas, and journal calculations remain unchanged.

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Returning more competition relation data could affect inferred TypeScript shapes | Keep additions minimal and only include fields already used by pages |
| Cookie helper changes could break login/logout if request cookie store is mishandled | Await `cookies()` once per helper and keep existing options intact |
| Chart sizing fix could alter dashboard layout | Constrain changes to positive dimensions around existing chart containers |

## Documentation / Operational Notes

- No user-facing documentation changes expected.
- The dev server should be refreshed after changes so stale console warnings are not mistaken for current failures.

## Sources & References

- Related code: `lib/auth.ts`
- Related code: `lib/queries.ts`
- Related code: `app/competitions/page.tsx`
- Related code: `components/dashboard-charts.tsx`
