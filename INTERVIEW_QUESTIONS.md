# Task_manage — Interview Questions (with answers)

Curated questions an interviewer could ask based specifically on this repo's
frontend + backend, ordered from basic → advanced. Answers are tailored to the
actual code.

---

## A. Frontend Questions

### A1. Explain the tech stack and why these choices?
Next.js 14 (App Router) for file-based routing + SSR, React 18 for UI, TypeScript for
safety, Zustand for global state (lightweight, no provider/boilerplate), Tailwind for
styling, Radix/shadcn for accessible UI primitives, @hello-pangea/dnd for drag-drop,
date-fns for dates, lucide-react for icons.

### A2. Why Zustand instead of Redux/Context?
Zustand is a tiny external store (`create()` API) with no provider wrapper and no reducers/
actions boilerplate. Components subscribing to a slice re-render only when that slice
changes. The app needs 3 small focused stores (dashboard, task, modal). Redux would be
overkill; Context would cause excessive re-renders for frequently changing `tasks`.

### A3. What is stored in each Zustand store?
- `dashboardStore`: `boardView ("list"|"kanban")`, `user` + setters.
- `taskStore`: `tasks[]`, `newTask` (add/edit draft), `taskToDelete` + actions
  `setTasks/addTask/deleteTask/updateTask` (map/filter based).
- `modalStore`: `isAddModalOpen`, `isDeleteModalOpen` + setters.

### A4. How is login state persisted across reloads?
The `user` object (with JWT) is written to `localStorage`. On mounts, the dashboard/login/
register pages re-hydrate the Zustand `user` via `setUser(JSON.parse(localStorage.getItem("user")))`.
If `user` is null, the dashboard redirects to `/login` in a `useEffect([user])`.

### A5. How does logout work?
`Sidebar.handleLogout` removes `"user"` from localStorage, `setUser(null)`, `setTasks([])`,
and shows a toast. Because `user` becomes null, the dashboard's redirect effect fires → `/login`.

### A6. How does the Add/Edit modal know whether to add or update?
It inspects `newTask._id`. Empty `_id` → POST `/api/addtask` then `addTask(data.task)`.
Non-empty `_id` → POST `/api/updatetask` then `updateTask(newTask)`. The modal title and
button text switch accordingly.

### A7. Explain the Kanban drag-and-drop logic.
`DragDropContext` wraps 3 `Droppable` columns. Each task is a `Draggable`. `onDragEnd`
gets `{draggableId, source, destination}`. Same column → local reorder via `splice`
(optimistic). Different column → change the task's `status` to `destination.droppableId`,
update the local array, and POST `/api/updatetask` to persist.

### A8. How are filtering and sorting implemented in the list view?
Local `useState` holds `statusFilter`, `priorityFilter`, `sortBy`, `sortOrder`.
`filteredTasks = tasks.filter(matches status && priority)`, then `sortedTasks` sorts by
title (`localeCompare`), priority (custom `Low=0,Medium=1,High=2`), or dueDate (`getTime()`).

### A9. What does the `cn()` util do?
`cn()` = `twMerge(clsx(inputs))` — merges Tailwind class strings and lets later classes
override earlier ones predictably.

### A10. Where is the theme (dark/light) handled?
`ThemeProvider` wraps `next-themes` in the root `layout`. The Sidebar toggles
`setTheme(theme === "dark" ? "light" : "dark")`. Tailwind `darkMode: ["class"]` + CSS
variables power the dark palette.
---

## B. Backend Questions

### B1. How is the Express server structured?
`index.js` creates the app, applies `bodyParser.json()` and `cors()`, mounts
`/auth` (AuthRouter) and `/api` (TaskRouter), `require`s `models/db` to connect to Mongo,
and listens on `PORT || 5000`. There's a `/ping` health endpoint.

### B2. How is a password stored and verified?
Registration: `bcrypt.hash(password, 10)` (10 salt rounds) → stored in DB.
Login: `bcrypt.compare(password, storedHash)` — never store plaintext.

### B3. How is the JWT created and what's in it?
On login, `jwt.sign({ email, _id }, JWT_SECRET, { expiresIn: "28d" })`. It's a signed,
stateless token the client stores and resends; no server session needed.

### B4. What are the two Mongoose schemas and their key validations?
- **User**: name (required 2–16), email (required, unique, regex-validated), password
  (required, min 6, hashed).
- **Task**: title (required), description (optional), status (`enum` To Do/In Progress/
  Completed), priority (`enum` Low/Medium/High), dueDate (optional Date), user (required
  String = owner email).

### B5. What is the difference between `enum` and `unique`?
`enum` restricts allowed field values (validated before save). `unique` creates a unique
MongoDB index so duplicate emails are rejected at the DB level; still, the controller
checks duplicates explicitly for clean error messages.

### B6. List all API endpoints.
| Method | URL | Purpose |
|---|---|---|
| POST | `/auth/register` | Create account |
| POST | `/auth/login` | Issue JWT |
| POST | `/api/alltasks` | Fetch user's tasks |
| POST | `/api/addtask` | Add a task |
| POST | `/api/updatetask` | Update a task |
| POST | `/api/deletetask` | Delete a task |

### B7. How does `getAllTasks` find the right tasks?
It reads `user` from `req.body` and calls `TaskModel.find({ user })`, returning only tasks
whose `user` field matches that email.

### B8. What happens on task-not-found during delete/update?
`deleteTask` checks `result.deletedCount === 0` → returns 404. `updateTask` checks the
returned doc is falsy → returns 404. Each controller also wraps logic in try/catch returning
---

## C. Full-Stack / Behavioral Questions

### C1. Walk me through what happens end-to-end when a user adds a task.
1. `Header` "+ Add Task" → `setIsAddModalOpen(true)`.
2. `AddTaskModal` opens with `EmptyTask`; the user types; inputs call `setNewTask`.
3. Submit → no `_id` → `fetch POST /api/addtask` with `{...newTask, user: email}`.
4. Server: `addTask` controller creates `new TaskModel(...).save()` → returns the task.
5. Client: `addTask(data.task)` updates the Zustand `tasks` → UI re-renders.
6. Modal closes and `setNewTask(EmptyTask)` resets the draft.

### C2. What are the main security issues in this codebase? (strong question)
- **JWT is never verified** on `/api/*` — any token (or none) is accepted; routes rely on
  client-supplied `user` email.
- Tasks are scoped by **email string in the request body**, so a malicious client could pass
  another user's email and read/create tasks for them (IDOR / broken object-level auth).
- JWT stored in **localStorage** → vulnerable to XSS (httpOnly cookies are safer).
- No rate-limiting, input validation (e.g., zod), or consistent error handling.

### C3. What are the code-level limitations/improvements?
- All task routes are POST; should use GET/PUT/DELETE semantics.
- `findByIdAndUpdate` without `{new:true}` returns the **pre-update** doc.
- API base URL is **hardcoded across files** instead of a shared `.env` constant.
- `user` should be a real `ObjectId` ref (with `populate`), not an email string.
- Optimistic UI updates + separate POST can get out of sync on failure → needs rollback.
- Duplicate DnD libs installed (`@dnd-kit` + `@hello-pangea/dnd`); only the latter is used.

### C4. How is toast/notification built here (advanced)?
`hooks/use-toast.ts` implements an external (non-Context) store: a `memoryState` + reducer +
listener list. `toast()` dispatches `ADD_TOAST`; `useToast()` subscribes a `setState` listener
and cleans up on unmount. `TOAST_LIMIT=1` caps concurrent toasts.

### C5. What does the client use for data fetching?
It's mostly client-rendered SPA pages with `"use client"`, `fetch` calls, and optimistic
updates — no SWR/React Query/server actions. Data fetching occurs in `Dashboard` on mount;
Kanban moves are optimistic then persisted. This is a natural refactor target.

---

## D. Scenario / Follow-up Questions

- "How would you secure the task routes?" → add a JWT-verify middleware, set `req.userId`
  from the token, query by `req.userId`, ignore client-supplied `user`.
- "How would you make tasks reference their owner properly?" → `ObjectId` ref to `users` + `populate`.
- "How would you fix the update returning a stale document?" → add `{ new: true }` to `findByIdAndUpdate`.
- "How would you add validation?" → zod/express-validator schemas + a central error middleware.
- "How would you fix the hardcoded URLs?" → put `NEXT_PUBLIC_BASE_URL` in `.env` in a shared `lib/api.ts`.
- "How would you add loading/error states?" → loading flags in stores + error handling on every fetch.
- "How would you test this?" → Vitest/Jest unit for stores + controllers; React Testing Library
  for components; Supertest for API integration; msw for fetch mocking.
500 "Server error".