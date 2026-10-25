# Project Implementation Checklist — Vartalap

> **Estimated Total Effort:** ~60 Team Hours (2–3 Developers + AI Co-pilot)
> Mark tasks with `[x]` as you complete them and update `memory.md`.

---

## Phase 1: Project Setup & Authentication (Est: 8 Hours)
- [x] **1.1 Initialize Repository:** Create `frontend/` (Vite + React + Tailwind CSS) and `backend/` (Node + Express) directories.
- [x] **1.2 Backend Dependencies:** Install `express`, `mongoose`, `socket.io`, `cors`, `dotenv`, `bcryptjs`, `jsonwebtoken`, `nodemailer`, `nanoid`, `node-cron`, `express-rate-limit`, `validator`, and devDependency `nodemon`.
- [x] **1.3 Database Connection:** Set up `backend/src/config/db.js` and verify MongoDB connection logic.
- [x] **1.4 User Model:** Create `User.js` with `unique: true` indexes on `username` and `email`.
- [x] **1.5 Email & Console OTP Utility:** Build registration & OTP generator (with console OTP fallback for live demo safety).
- [x] **1.6 Auth Endpoints:** Build `/register`, `/verify-otp`, `/resend-otp`, `/login`, and `/me` with JWT middleware.
- [x] **1.7 Frontend Auth UI:** Build Login form, Register form, and 6-digit OTP Modal connected to AuthContext and Axios instance.

---

## Phase 2: 1:1 Zero-Contact Private Chat & Socket Core (Est: 14 Hours)
- [ ] **2.1 Models:** Create `DirectChat.js` and `Message.js` Mongoose models.
- [ ] **2.2 User Search Endpoint:** Build `GET /api/users/search?q=` to search verified users by `@username` (excluding self).
- [ ] **2.3 Direct Chat Endpoints:** Build `POST /api/direct-chats` (get or create 1:1 room) and `GET /api/direct-chats` (fetch user's DM list).
- [ ] **2.4 Message Endpoints:** Build `GET /api/messages/:chatType/:chatId` and `POST /api/messages`.
- [ ] **2.5 Socket.io Setup:** Configure `socketManager.js` to track `onlineUsers`, join personal rooms (`user:<id>`), and broadcast `presence:online_list`.
- [ ] **2.6 Real-Time Messaging & Typing:** Wire up `room:join`, `message:new`, `typing:start`, and `typing:stop` between React and Socket.io.
- [ ] **2.7 Frontend DM Flow:** Build Left Sidebar conversation list, `@username` search modal, and live `ChatWindow` with online green dot and typing indicator.

---

## Phase 3: Unique Group IDs (`#VRT-XXXX`) & Admin Permissions (Est: 12 Hours)
- [ ] **3.1 Group Model & Tag Generator:** Create `Group.js` model and `generateTag.js` utility (`#VRT-` + 4 uppercase chars via `nanoid`).
- [ ] **3.2 Group Creation & Search API:** Build `POST /api/groups`, `GET /api/groups/my-groups`, and `GET /api/groups/search?tag=`.
- [ ] **3.3 Join Logic (`public`, `invite_only`, `closed`):**
  - [ ] Immediate join if `joinMode === "public"`.
  - [ ] Push to `pendingRequests` and emit `group:request_new` to Admin if `joinMode === "invite_only"`.
  - [ ] Block with 403 message if `joinMode === "closed"`.
- [ ] **3.4 Admin Approval & Controls API:** Build `POST /api/groups/:groupId/requests/:userId` (approve/reject) and `PATCH /api/groups/:groupId/settings`.
- [ ] **3.5 Message Pinning API:** Build `POST /api/groups/:groupId/pin/:messageId` for Group Admins.
- [ ] **3.6 Frontend Group UI:** Build `CreateGroupModal`, `FindByTagModal`, and the Right-Side `GroupInfoDrawer` (showing `#VRT-XXXX` copy button, Admin Join Mode selector, Pending Requests queue, and Pinned Messages).

---

## Phase 4: Session-Based Groups & Countdown Lifecycle (Est: 10 Hours)
- [ ] **4.1 Session Creation Options:** Support `isSessionGroup` and `expiresAt` in group creation (including a *"2-Minute Demo Timer"* preset for presentation day).
- [ ] **4.2 Live Countdown Hook & Badge:** Build `useCountdown(expiresAt)` hook and `CountdownBadge.jsx` in the chat header.
- [ ] **4.3 Background Expiry Worker:** Create `sessionExpiry.job.js` with `node-cron` running every 30 seconds to detect expired groups, set `status = "expired"`, post a closing system message, and emit `group:expired`.
- [ ] **4.4 Expired Group Lock UI:** Listen for `group:expired` on the frontend and replace the message input bar with a locked session-ended banner.

---

## Phase 5: Polish, Seed Data & Optional Extensible Features (Est: 16 Hours)
- [ ] **5.1 Empty States & Toast Alerts:** Add clean empty states when no chat is selected and toast notifications for join approvals/errors.
- [ ] **5.2 Demo Seed Script (`seed.js`):** Create a script that populates 4 verified demo accounts, 2 active groups, and sample messages for easy testing.
- [ ] **5.3 (Optional Bonus) Session Summary Export:** Add a "Download Session Summary" button that exports group metadata and pinned messages as a clean printable PDF/Markdown summary.
- [ ] **5.4 (Optional Bonus) Audio Text-to-Speech:** Add a speaker button on messages using `window.speechSynthesis`.
- [ ] **5.5 Final Presentation Rehearsal:** Test the complete 5-minute demo script across two browser windows side-by-side.