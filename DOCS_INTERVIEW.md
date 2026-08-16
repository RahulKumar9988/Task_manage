# Task_manage — Full-Stack Technical Documentation & Interview Prep

A full-stack Task Management dashboard with JWT authentication and a drag-and-drop
Kanban board. Below is a deep-dive into **how the whole app works**, from basic to
advanced, plus likely interview questions and answers.

---

## 1. Project Overview & Architecture

```
Task_manage/
├── client/                 # Next.js 14 (App Router) + React 18 + TypeScript + Zustand + Tailwind
│   ├── app/                # Pages: / (dashboard), /login, /register, /test, /layout
│   ├── components/         # UI + feature components (Dashboard, Kanban, Tasklist, modals...)
│   ├── store/              # Zustand global stores
│   ├── lib/                # utils (cn), constants (EmptyTask, priority colors)
│   ├── types/              # Shared TypeScript types
│   └── hooks/              # use-toast
└── server/                 # Node.js + Express + MongoDB/Mongoose (CommonJS)
    ├── index.js            # App entry / server bootstrap
    ├── controllers/        # AuthController, TaskController (request handlers)
    ├── routes/             # AuthRouter (/auth), TaskRouter (/api)
    ├── models/             # db.js (Mongoose connect), User.js, Task.js
    └── vercel.json         # Serverless deployment config for Vercel
```

The app is a classic **three-tier architecture**:

1. **Client (Frontend)** — Next.js SPA that renders dashboards and handles user state.
2. **API (Backend)** — Express REST API (`/auth`, `/api`) that talks to MongoDB.
3. **Database** — MongoDB Atlas (Mongoose ODM), stores `users` and `tasks` collections.

**Request flow (full stack end-to-end):**
```
User clicks → React component → Zustand action → fetch() to Express API
→ Route → Controller → Mongoose Model → MongoDB → response JSON back
→ Zustand store update → React re-render → UI
```

> ⚠️ **Notable architecture choice:** The client hardcodes a deployed API URL
> (`https://task-manage-teal.vercel.app/...`) instead of using a relative/proxy
> URL or `.env`. This is a coupling point to discuss in interviews (see "Improvements").

---

## 2. Backend Deep-Dive

### 2.1 Stack
- **Express 4** — HTTP framework, routers, middleware (`body-parser`, `cors`).
- **Mongoose 8** — ODM to model MongoDB data and run queries.
- **bcrypt** — Password **hashing** (register) and **verification** (login).
- **jsonwebtoken** — Issues stateless JWT auth tokens on login.
- **dotenv** — Loads secrets (`MONGO_URL`, `JWT_SECRET`) from `.env`.

### 2.2 Entry Point — `server/index.js`
- Creates the Express `app`, applies `bodyParser.json()` middleware (so `req.body`
  is parsed JSON) and `cors()` (allows cross-origin browser calls from the Next app).
- Mounts two routers:
  - `app.use("/auth", AuthRouter)` → `/auth/register`, `/auth/login`
  - `app.use("/api", TaskRouter)` → `/api/alltasks`, `/api/addtask`, ...
- `require("./models/db")` triggers the MongoDB connection on server start.
- Listens on `process.env.PORT || 5000`; also exposes a `/ping` health check.

### 2.3 Models (schema / data layer)

**`models/User.js`** — `UserSchema` (`users` collection):
- `name`: String, required, `min:2`, `max:16`
- `email`: String, required, `trim`, `unique` (enforces no duplicate emails at DB level), plus a regex **validator**.
- `password`: String, required, `min:6` — stored **hashed**, never plaintext.

**`models/Task.js`** — `TaskSchema` (`tasks` collection):
- `title`: required String
- `description`: optional String
- `status`: required, `enum: ["To Do","In Progress","Completed"]`
- `priority`: required, `enum: ["Low","Medium","High"]`
- `dueDate`: optional Date
- `user`: required String (the owner's email) — used to scope tasks per user.

> Notice `user` is stored as a **plain email string**, not a MongoDB
> `ObjectId` reference. A stronger design would use `{ type: mongoose.Schema.Types.ObjectId, ref: "users" }` + `populate()`.

### 2.4 Controllers — request logic

**`AuthController.js`**
- `register`: checks `UserModel.findOne({email})` for duplicates → hashes password
  with `bcrypt.hash(password, 10)` (10 salt rounds) → saves a new `UserModel`.
- `login`: finds user by email → `bcrypt.compare` to verify password →
  if valid, `jwt.sign({email, _id}, JWT_SECRET, { expiresIn: "28d" })` →
  returns `{ jwtToken, email, name }`.
- Standard response shape: `{ success: boolean, message: string , ... }`.

**`TaskController.js`** — plain CRUD, all exposed as **POST** routes (unusual,
typically GET is used for reads):
- `getAllTasks`: `TaskModel.find({ user })` where `user` comes from `req.body`.
- `addTask`: builds `new TaskModel({...fields, user})` and `save()`s it, returns the task.
- `deleteTask`: `TaskModel.deleteOne({ _id })`, returns 404 if `deletedCount === 0`.
- `updateTask`: `TaskModel.findByIdAndUpdate(_id, {...})`.

### 2.5 Routes — URL wiring
`AuthRouter`: `POST /register`, `POST /login`.
`TaskRouter`: `POST /alltasks`, `POST /addtask`, `POST /deletetask`, `POST /updatetask`.

### 2.6 API Endpoint Reference

| Method | URL                 | Body                                             | Purpose            |
|--------|---------------------|--------------------------------------------------|--------------------|
| POST   | `/auth/register`    | `{name, email, password}`                        | Create account     |
| POST   | `/auth/login`       | `{email, password}`                              | Get JWT            |
| POST   | `/api/alltasks`     | `{user: email}`                                  | Fetch user's tasks |
| POST   | `/api/addtask`      | `{title, description, status, priority, dueDate, user}` | Add task  |
| POST   | `/api/updatetask`   | `{_id, ...fields}`                               | Update task        |
---

## 3. Frontend Deep-Dive

### 3.1 Stack
- **Next.js 14 App Router** — file-based routing (`app/`), server components by default,
  `"use client"` for interactive components.
- **React 18** — component/hook model, client-side interactivity.
- **TypeScript** — strict typing (`types/types.ts`).
- **Zustand 5** — lightweight global state management (3 stores).
- **Tailwind CSS** — utility-first styling + `next-themes` for dark mode.
- **Radix UI** primitives + shadcn/ui-style components (dialog, select, dropdown, toast, table, badge, etc.).
- **@hello-pangea/dnd** — drag-and-drop for Kanban.
- **date-fns** — date formatting.
- **lucide-react** — icons.

### 3.2 Shared Types — `types/types.ts`
```ts
type TaskStatus   = "To Do" | "In Progress" | "Completed";
type TaskPriority = "Low" | "Medium" | "High";
type BoardView    = "list" | "kanban";
type User         = { name; email; token };
type Task         = { _id; title; description?; status; priority; dueDate? };
```
These types keep the store, components, and API payloads in sync.

### 3.3 Global State — Zustand stores

**`store/dashboardStore.ts`** — UI + auth context:
- `boardView: "list" | "kanban"` + `setBoardView`
- `user: User | null` + `setUser`

**`store/taskStore.ts`** — task data + form state:
- `tasks: Task[]` + `setTasks`, `addTask`, `deleteTask`, `updateTask`
- `newTask: Task` (the "draft" in the add/edit modal) + `setNewTask`
- `taskToDelete: string` (id awaiting confirmation) + `setTaskToDelete`
- `updateTask` uses array `.map` to replace the matching `_id`; `deleteTask` uses `.filter`.

**`store/modalStore.ts`** — modal visibility flags:
- `isAddModalOpen`, `isDeleteModalOpen` + their setters.

> Why use Zustand? Because `dashboardStore` (auth) is consumed by the login page and
> the dashboard, while `taskStore` is shared between the dashboard (fetch) and the
> Kanban/list/modals. Central stores avoid prop-drilling and keep re-renders scoped.

### 3.4 Routing / Pages
- **`app/layout.tsx`** — root layout: registers local fonts, wraps app in `ThemeProvider`
  (next-themes) and renders the global `<Toaster />`.
- **`app/page.tsx`** — home; renders `<DashboardComponent/>`, `<AddTaskModal/>`, `<DeleteModal/>`.
- **`app/login/page.tsx`** & **`app/register/page.tsx`** — auth screens.
- **`app/test/page.tsx`** — empty placeholder page.

### 3.5 Auth Flow (login/register/logout)

**Login (`app/login/page.tsx`)**
1. On mount, `setUser(JSON.parse(localStorage.getItem("user")))` → if a stored user
   exists, redirect to `/`.
2. `submitForm` POSTs `{email, password}` to `/auth/login`.
3. On `success`, stores `{name, email, token}` in `localStorage`, calls `setUser`,
   shows toast, `router.push("/")`.
4. Uses `useEffect([user])` to skip the page if already authenticated.

**Register (`app/register/page.tsx`)**
- Validates `password === cpassword` before submitting; POSTs to `/auth/register`;
- On success → `router.push("/login")`.

**Session persistence** — the JWT + profile are saved to `localStorage`, not cookies.
`Dashboard.tsx` re-hydrates `user` from localStorage on mount and, if missing → redirects to `/login` (`useEffect([user])`).

**Logout (`Sidebar.tsx`)** — removes `"user"` from localStorage, `setUser(null)`,
`setTasks([])`, shows toast. (Client `dashboardStore.user` already nulled → the
dashboard's redirect effect fires.)

### 3.6 Dashboard — `components/Dashboard.tsx`
- Reads `boardView`, `user`, `setUser` from `dashboardStore` and `setTasks` from `taskStore`.
- `fetchTasks()` → POST `/api/alltasks` with `{ user: user.email }` and `Authorization: Bearer <token>`; stores `result.tasks`.
- Redirects to `/login` when `user` is falsy.
- Renders: `<Sidebar/>`, then `<Header/>`, then conditionally `<Tasklist/>` (list view) or `<Kanban/>` (board view) based on `boardView`.

### 3.7 List View — `components/Tasklist.tsx`
- **Filtering** by `status` and `priority` (local `useState` + `.filter`).
- **Sorting** by `title` (localeCompare), `priority` (custom `Low=0,Medium=1,High=2`),
  `dueDate` (`getTime()`), with asc/desc toggle.
- Shows tasks in a `<Table>` (Radix/shadcn) with a `Select` to change a task's status inline
  → fires `POST /api/updatetask` then `updateTask()` locally.
- Footer shows `Total Tasks`.

### 3.8 Kanban Board — `components/Kanban.tsx`
- Uses `@hello-pangea/dnd`: `<DragDropContext>` → three `<Droppable>` columns
  (`"To Do"`, `"In Progress"`, `"Completed"`) → each task is a `<Draggable>`.
- `onDragEnd(result)`:
  - If `source.droppableId === destination.droppableId` → reorder in place (optimistic local move).
  - Else → find the dragged task, create `updatedTask = {...task, status: destinationColumn}`,
    update local `tasks` array and call `updateTaskStatus()` which POSTs to `/api/updatetask`.

### 3.9 Modals
- **`AddTaskModal.tsx`** — Add/Edit via shared `newTask`:
  - If `newTask._id` is empty → POST `/api/addtask` (body includes `user: user.email`) then `addTask(data.task)`.
  - If `_id` exists → POST `/api/updatetask` then `updateTask(newTask)`.
  - Fields: title, description, status, priority, dueDate (`date-fns format`).
- **`DeleteModal.tsx`** — confirmation dialog; on confirm POSTs `/api/deletetask`
  with `{_id: taskToDelete}`, then `deleteTask()` locally.
- **`EditDeleteMenu.tsx`** — dropdown that either seeds `setNewTask(task)` + opens the
  add modal (edit), or `setTaskToDelete(id)` + opens the delete modal.

### 3.10 Shared UI & Utilities
- **`components/ui/*`** — shadcn-style wrappers around Radix UI (Button, Input, Dialog,
  Select, Table, Badge, Card, Toast, Dropdown, Avatar, Label, Textarea).
- **`lib/utils.ts`** — `cn()` combining `clsx` + `tailwind-merge` for dynamic classNames.
- **`lib/constants.ts`** — `EmptyTask` (default draft) + `priorityColor()` (Tailwind color classes per priority).
- **`hooks/use-toast.ts`** — toast system (external store + reducer + listeners, no Context).
- **`theme-provider.tsx`** — wrapper for `next-themes` enabling the dark/light toggle in the Sidebar.
---

## 4. Flow of a Feature — "Add a Task" (full trace)

1. Header (`.Header`) `+ Add Task` button → `setIsAddModalOpen(true)` (modalStore).
2. `AddTaskModal` opens with `newTask = EmptyTask`; user fills the form; inputs call
   `setNewTask({...newTask, field})` (taskStore).
3. "Add Task" → `handleAddTask()`:
   - No `_id` → `fetch(POST /api/addtask, body: {...newTask, user: email})`.
   - Server: route → `addTask` controller → `new TaskModel(...).save()` → returns task.
   - Client: `addTask(data.task)` updates the `tasks` array → UI re-renders.
4. Modal closes: `setNewTask(EmptyTask)`, `setIsAddModalOpen(false)`.

---

## 5. Security & Compliancy Topics (interview gold)

- **Password hashing** — bcrypt (10 rounds); salted, one-way; `compare` for login.
- **JWT** — stateless tokens; payload `{email, _id}`, 28-day expiry; stored client-side
  in `localStorage` (XSS risk vs. httpOnly cookies — discuss trade-offs).
- **Authorization gap** — the backend accepts any JWT but **never verifies it** in the
  Task routes (`req.headers.authorization` is sent by the client to some endpoints but
  ignored by the server). Any authenticated user could, in principle, address another
  user's tasks by ID. This is the #1 security improvement to mention.

---

## 6. Known Issues / Limitations (advanced awareness)

1. **No middleware for JWT auth/verification** — tokens are generated but never validated on `/api/*`.
2. **Task `user` is scoped by email** stored as a string, and tasks are fetched by `{ user: req.body.user }` — a client could pass any email.
3. **All task routes are POST** — semantically reads should be GET; also no route params usage.
4. **Hardcoded API URL** in client (duplicated across files) instead of a single `.env`/config constant. (Tasklist uses `process.env.NEXT_PUBLIC_BASE_URL` but others hardcode.)
5. **No validation middleware** (e.g., express-validator/zod) on request bodies.
6. **No error boundary / consistent error UX** beyond toasts.
7. **Update returns stale doc** — `findByIdAndUpdate` without `{new: true}` returns the *pre-update* document.
8. **Race conditions** — optimistic Kanban updates + separate POST can drift if they fail.
9. Duplicate libraries: both `@dnd-kit` and `@hello-pangea/dnd` are installed; only the latter is used.

---

## 7. Likely Interview Questions & Answers

**Q: What is JWT and why use it here?**
A: JWT lets the server issue a signed, stateless token after login that carries a user
payload; the client sends it in the `Authorization` header so the server can identify the
user without storing server-side sessions. Here it's `jwt.sign({email,_id}, secret, {expiresIn:'28d'})`.

**Q: How is a password stored securely?**
A: Not plaintext — hashed with bcrypt (salt rounds = 10) at registration, verified with
`bcrypt.compare()` at login. bcrypt is slow by design to resist brute-force.

**Q: Why Zustand instead of Redux?**
A: Zustand is a minimal external store with a `create()` API, no boilerplate/provider need,
complexity ∝ needs. It re-renders only subscribed components. Clean for 3 focused stores.

**Q: Explain the Kanban drag-and-drop logic.**
A: `DragDropContext` tracks a drag; `onDragEnd` receives `{draggableId, source, destination}`.
Same column → local reorder via splice (optimistic). Cross column → change task's `status`
to the destination column's id, update local array, POST to persist.

**Q: How does the client stay logged in across page reloads?**
A: `user` (with token) is saved to `localStorage`. On dashboard/login/page mounts, the app
re-hydrates Zustand `user` from localStorage; the dashboard redirects to `/login` if absent.

**Q: What could improve this app? (always ask)**
A: Add a JWT verify middleware protecting task routes; tie tasks to users via ObjectId + populate;
use GET/PUT/DELETE semantics; centralize the API base URL; add request validation; use httpOnly
cookies for tokens; add loading/skeleton + error states; add tests; use server actions or SWR/React Query.

**Q: Explain the Mongoose `enum` and `unique`.**
A: `enum` restricts allowed values for a field (validated on save); `unique` creates a unique
index so duplicate emails are rejected asynchronously at the DB level (but note: check duplicates
explicitly in the controller to give clean errors).

---

## 8. Suggested Improvements / Refactor Plan
- Add `middleware/auth.js` verifying `Bearer` JWT; attach `req.userId` from token.
- Scope task queries to `req.userId` server-side (ignore client-supplied user).
- Use `mongoose.Schema.Types.ObjectId` refs + `populate`.
- Adopt REST conventions (GET /tasks, POST /tasks, PATCH /tasks/:id, DELETE /tasks/:id).
- Centralize the base URL in `lib/api.ts` + `.env`.
- Add zod/express-validator schemas and an error-handling middleware.
| POST   | `/api/deletetask`   | `{_id}`                                          | Delete task        |