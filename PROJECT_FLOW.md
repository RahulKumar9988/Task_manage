# Task_manage — Whole Project Flow

A step-by-step walkthrough of how this full-stack task management app works, from
first request to database, and through every feature. Read this top-to-bottom to
understand the entire application in one pass.

---

## 1. High-Level Data / Request Flow

```
Browser (Next.js Client)
   │
   │  fetch()  →  JSON body
   ▼
Express Server (index.js)
   .use(bodyParser.json())   parse JSON body
   .use(cors())              allow cross-origin
   │
   ├── /auth/*          → AuthRouter → AuthController → User model → MongoDB
   └── /api/*           → TaskRouter → TaskController → Task model  → MongoDB
   │
   ▼
JSON response  →  back to client  →  Zustand store  →  React re-render
```

Three tiers: **Client** (React state/UI) ⇄ **API** (Express logic) ⇄ **Database** (MongoDB).

---

## 2. Server Startup (Backend Bootstrap)

1. `node index.js` runs `server/index.js`.
2. `require("./models/db")` connects Mongoose to Mongo using `process.env.MONGO_URL`.
3. Express app: `bodyParser.json()` reads JSON request bodies; `cors()` allows the Next app's origin.
4. Routers mounted: `/auth` (register/login) and `/api` (all tasks CRUD).
5. `app.listen(PORT || 5000)` serves requests; `/ping` returns "Pong" as a health check.

---

## 3. Authentication Flow

### Register (`POST /auth/register`)
1. Client sends `{ name, email, password }`.
2. Controller checks `UserModel.findOne({ email })` → duplicate → 400 "User already exists".
3. New = `bcrypt.hash(password, 10)` (salted hash, 10 rounds).
4. `new UserModel({name, email, password: hash}).save()` → MongoDB `users` collection.
5. Returns `{ success: true }`.

### Login (`POST /auth/login`)
1. Client sends `{ email, password }`.
2. `UserModel.findOne({ email })` → none → 400 "User not found".
3. `bcrypt.compare(password, user.password)` → wrong → 400 "Invalid Password".
4. `jwt.sign({ email, _id }, JWT_SECRET, { expiresIn: "28d" })` → JWT token.
5. Returns `{ jwtToken, email, name, success: true }`.

### Client-side session
1. Login page: on success, saves `{name, email, token}` to `localStorage["user"]` + `setUser`.
2. Dashboard re-hydrates `user` from localStorage on mount; if null → `router.push("/login")`.
3. Logout (Sidebar): removes `localStorage["user"]`, `setUser(null)`, `setTasks([])`; the
   redirect effect sends the user to `/login`.

---

## 4. Dashboard Load Flow (First Visit After Login)

1. `app/page.tsx` renders `DashboardComponent` + `AddTaskModal` + `DeleteModal`.
2. `Dashboard` mounts:
   - `setUser(localStorage.user)`; if no user → redirect to `/login`.
   - `fetchTasks()` → `POST /api/alltasks` with `{ user: user.email }` (+ `Authorization: Bearer <token>`, ignored by server).
3. Server `getAllTasks` → `TaskModel.find({ user })` → all tasks for that email.
4. `setTasks(result.tasks)` fills the Zustand `taskStore`.
---

## 5. Feature Flows

### 5.1 Add a Task
1. Header "+ Add Task" → `setIsAddModalOpen(true)`.
2. `AddTaskModal` opens with `newTask = EmptyTask`.
3. Inputs call `setNewTask({...newTask, field})` (local draft).
4. Submit → `newTask._id` is empty → `POST /api/addtask` body `{...newTask, user: email}`.
5. Server `addTask`: `new TaskModel({...}).save()`, returns the saved task.
6. Client `addTask(data.task)` appends to `tasks` → UI updates. Modal closes, draft resets.

### 5.2 Edit a Task
1. `EditDeleteMenu` → Edit → `setNewTask(task)` (seeds the existing task) + `setIsAddModalOpen(true)`.
2. Modal shows current values; edits update `newTask`.
3. Submit → `newTask._id` exists → `POST /api/updatetask` body `{...newTask}`.
4. Server `updateTask`: `TaskModel.findByIdAndUpdate(_id, {...})`.
5. Client `updateTask(newTask)` replaces the task in `tasks`.

### 5.3 Delete a Task
1. `EditDeleteMenu` → Delete → `setTaskToDelete(task._id)` + `setIsDeleteModalOpen(true)`.
2. `DeleteModal` confirms → `POST /api/deletetask` body `{ _id: taskToDelete }`.
3. Server `deleteTask`: `TaskModel.deleteOne({ _id })`; 404 if `deletedCount === 0`.
4. Client `deleteTask(id)` filters it out of `tasks`. Modal closes.

### 5.4 Change Status (List View)
- Inline `<Select>` in the table → `POST /api/updatetask` with new status → `updateTask({...task, status})`.

### 5.5 Drag Task (Kanban View)
- `onDragEnd`:
  - Same column → local reorder (`splice`), optimistic, no API call.
  - Cross column → `updatedTask = {...task, status: destinationColumn}` → `setTasks` local update + `POST /api/updatetask`.

### 5.6 Filter / Sort (List View)
- Filter by status/priority (`tasks.filter`), sort by title/priority/dueDate
  (`sortedTasks.sort`), toggle asc/desc. All client-side, no API call.

### 5.7 Theme Toggle
- Sidebar toggles `next-themes` `setTheme(dark|light)`; `ThemeProvider` in root layout;
  Tailwind `darkMode: class` applies CSS-variable-based dark palette.

---

## 6. End-to-End Response Shapes (contracts)

**Auth**
```
register → { success, message }
login    → { success, message, jwtToken, email, name }
```

**Tasks**
```
alltasks   → { success, tasks: [...] }
addtask    → { success, message, task }
updatetask → { success, task } | 404 { success:false, message }
deletetask → { success, message } | 404 { success:false, message }
```

**Task object (DB ↔ API ↔ UI)**
```
{ _id, title, description?, status: To Do|In Progress|Completed,
  priority: Low|Medium|High, dueDate?, user }
```
---

## 7. Data Model Relationships

- `users` collection: `{ name, email (unique), password (hashed) }`.
- `tasks` collection: task fields + `user` = owner's email string.
- **Link**: task → user via the `user` email field (logical FK, no DB reference).
  Every task query scopes by this field so each user sees only their tasks.

---

## 8. Deployment / Environments
- Frontend deployed as a Next.js app (Vercel style).
- Backend deployed via `server/vercel.json` → `@vercel/node` builder, `"/"` → `index.js`.
- Client calls the deployed backend directly: `https://task-manage-teal.vercel.app/...`.
- Secrets (`MONGO_URL`, `JWT_SECRET`) live in `.env` via `dotenv`.

---

## 9. Critical Cross-Cutting Notes
- **Optimistic UI**: list/kanban update the Zustand `tasks` array immediately, then persist
  via POST. A failed POST leaves UI/server out of sync (no rollback).
- **Server ignores the JWT**: routes trust `req.body.user`, so authorization is only
  client-side by convention — the top security concern.
- **Single source of tasks**: `taskStore.tasks` is the one array all views render from, so
  the list and Kanban stay in sync.

---

## 10. Quick Feature Map (files responsible)

| Feature | Frontend files | Backend files |
|---|---|---|
| Register/Login | `app/register`, `app/login` | `AuthRouter`, `AuthController`, `models/User` |
| Dashboard shell | `components/Dashboard`, `Header`, `Sidebar` | — |
| List view + filter/sort | `components/Tasklist` | `TaskController.getAllTasks` |
| Kanban drag-drop | `components/Kanban` | `TaskController.updateTask` |
| Add/Edit modal | `components/AddTaskModal`, `EditDeleteMenu` | `TaskController.addTask/updateTask` |
| Delete modal | `components/DeleteModal`, `EditDeleteMenu` | `TaskController.deleteTask` |
| Global state | `store/dashboardStore`, `store/taskStore`, `store/modalStore` | — |
| DB models | — | `models/User`, `models/Task` |
5. Layout renders `<Sidebar/>` + `<Header/>` + view (`Tasklist` or `Kanban` based on `boardView`).