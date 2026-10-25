# Project Memory & Context Tracker — Vartalap

> **Purpose:** This file acts as persistent memory across coding sessions. Whenever a feature is completed or an architectural decision is made, update this file so both developers and AI assistants stay in sync.

---

## 1. Current Project Snapshot
* **Project Name:** Vartalap: Real-Time Communication Platform
* **Current Phase:** Phase 0 — Documentation & Setup Complete (Starting Phase 1 Tomorrow)
* **Target Demo Window:** 4th Week of November
* **Team Members:**
  * Aditya Prakash (`NNM24CS019`)
  * Pavani Cheerapureddy (`NNM24CS172`)

---

## 2. Locked Architectural Decisions
1. **Identity & Verification:** Pivoted away from Aadhaar/Phone SMS to **Email OTP Verification (1 account per verified email)** to eliminate regulatory/DLT blockers and paid SMS gateway issues while preventing fake accounts.
2. **Demo-Safe OTP:** Backend logs the 6-digit OTP to the server terminal console in addition to sending the email via Nodemailer so local or campus Wi-Fi blocks never break the live presentation.
3. **Zero-Contact Privacy:** Phone numbers are never collected or displayed. Users discover each other strictly via unique `@username`.
4. **Clan-Style Group Discovery:** Every group has a unique `groupTag` formatted as `#VRT-XXXX` (generated via `nanoid`).
5. **Unified Message Schema:** Both 1:1 chats (`DirectChat`) and Group chats (`Group`) store messages in a single `Message` collection differentiated by `chatType: "direct" | "group"` and `chatId`.
6. **Session Expiry Demo Preset:** Alongside realistic durations (24 hours, 7 days, 1 year), the Create Group modal includes a **"2 Minutes (Demo Mode)"** option so judges can watch a session group count down and auto-expire live during the presentation.

---

## 3. Environment Variables Reference

### `server/.env`
```env
PORT=5000
MONGO_URI=mongodb://127.0.0.1:27017/vartalap
JWT_SECRET=vartalap_super_secret_jwt_key_2026
CLIENT_URL=http://localhost:5173
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_gmail_app_password
```

### `client/.env`
```env
VITE_API_URL=http://localhost:5000/api
VITE_SOCKET_URL=http://localhost:5000
```

---

## 4. Session Progress Log
* **Session 0 (Pre-Development):**
  * Finalized project scope, synopsis document (`PROJECT_SYNOPSIS_Vartalap-v2.docx`), and core feature set.
  * Generated `prd.md`, `architecture.md`, `rules.md`, `design.md`, `tasks.md`, `memory.md`, and `README.md`.
* **Session 1 (Phase 1 Base Architecture Skeleton):**
  * Created root `.gitignore` ignoring `node_modules/`, `.env`, and `dist/` across `backend/` and `frontend/`.
  * Initialized `backend/` (Node.js ES modules), installed all required dependencies (`express`, `mongoose`, `socket.io`, `cors`, `dotenv`, `bcryptjs`, `jsonwebtoken`, `nodemailer`, `nanoid`, `node-cron`, `express-rate-limit`, `validator`, `nodemon`).
  * Created full backend architecture: `db.js`, `User.js`, `Group.js`, `Message.js`, `authController.js`, `groupController.js`, `chatController.js`, `authRoutes.js`, `groupRoutes.js`, `messageRoutes.js`, `authMiddleware.js`, `socketHandler.js`, `sessionCron.js`, and `server.js`.
  * Initialized `frontend/` (Vite + React), configured Tailwind CSS, installed `axios`, `socket.io-client`, `react-router-dom`, `lucide-react`.
  * Implemented full frontend architecture: `axiosInstance.js`, `AuthContext.jsx`, `SocketContext.jsx`, `Sidebar/`, `ChatBox/`, `GroupAdmin/`, `LoginPage.jsx`, `RegisterOtpPage.jsx`, `ChatDashboard.jsx`, and `App.jsx`. Verified production build passes with 0 errors.