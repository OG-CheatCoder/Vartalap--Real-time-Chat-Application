# Coding Rules & AI Assistant Guidelines — Vartalap

> **Instructions for AI Assistants (Cursor / Windsurf / Copilot / Claude):**
> Always read `memory.md` and `architecture.md` before generating or modifying code. Keep implementations simple, modular, and easy for a college developer to explain line-by-line during a live technical defense.

---

## 1. Core Engineering Principles
1. **Explainability First:** Do not use overly clever one-liners, obscure libraries, or over-abstracted design patterns. Write clean, readable JavaScript (`ES6+` with `async/await`) that both team members can easily walk through in front of placement judges.
2. **Strict Adherence to Schema:** Never invent new database fields on the fly without updating `architecture.md` and the corresponding Mongoose model.
3. **Single Source of Truth for Real-Time:** 
   * Always save messages to MongoDB **first** via the Express controller, and then broadcast the saved Mongoose document via `io.to(room).emit("message:new", savedMessage)`.
   * This ensures zero data loss if a user refreshes the page immediately after chatting.

---

## 2. Tech Stack Constraints
* **Frontend:** React 18+ (Vite), JavaScript (JSX — no TypeScript to avoid build friction during fast iteration), Tailwind CSS, `lucide-react` (icons), `zustand` (state management), `axios`, `socket.io-client`, `react-hot-toast` (notifications).
* **Backend:** Node.js, Express.js, Mongoose, `socket.io`, `jsonwebtoken`, `bcryptjs`, `nodemailer`, `nanoid`, `node-cron`, `cors`, `dotenv`.
* **Forbidden Packages:** Do not introduce Redux Toolkit, GraphQL, Redis, Docker, or Prisma. Keep the MERN stack lean and easy to run locally on any laptop.

---

## 3. Code Style & Naming Conventions
* **Backend Files:** `camelCase.type.js` (e.g., `auth.controller.js`, `group.routes.js`).
* **Frontend Components:** `PascalCase.jsx` (e.g., `ChatWindow.jsx`, `CountdownBadge.jsx`).
* **API Response Format:** Every Express controller must return consistent JSON:
  ```javascript
  // Success
  res.status(200).json({ success: true, data: result, message: "Optional message" });

  // Error
  res.status(400).json({ success: false, message: "Clear human-readable error message" });
  ```
* **Group Tag Formatting:**
  * Always prefix unique group IDs with `#VRT-` followed by 4 uppercase alphanumeric characters (`#VRT-8K2P`).
  * When searching, normalize user input so searching either `vrt-8k2p` or `#VRT-8K2P` matches `#VRT-8K2P`.

---

## 4. Security & Reliability Rules
1. **Password & OTP Safety:** Never return `passwordHash` or `otpCode` in API responses (use `.select("-passwordHash -otpCode -otpExpiresAt")` in Mongoose queries).
2. **Email Fallback for Local Demo Safety:**
   * In `mailer.js`, always print the generated 6-digit OTP in a highlighted box in the Node.js terminal console **in addition** to sending the email via Nodemailer.
   * *Why:* If college Wi-Fi blocks SMTP ports during the live demo in November, you can still grab the OTP immediately from the terminal without the demo failing!
3. **Session Group Validation:** In `message.controller.js`, before saving a message to a group, check `if (group.status === "expired" || (group.isSessionGroup && new Date() >= group.expiresAt))`. If expired, return HTTP `403` (*"This session group has expired"*).

---

## 5. Git & Team Collaboration Workflow
* **Branching:**
  * `main` — Tested, working code ready for demo.
  * `feat/backend-*` — Backend features.
  * `feat/frontend-*` — Frontend features.
* **Task Tracking:** Whenever a feature or sub-task is completed, update `tasks.md` and log any key changes in `memory.md`.