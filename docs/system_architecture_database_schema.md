# System Architecture & Technical Design — Vartalap

## 1. High-Level System Architecture

```
+-----------------------------------------------------------------------+
|                        CLIENT (React + Vite)                          |
|  Tailwind CSS  |  Zustand Stores  |  Axios API Client  |  Socket.io   |
+-----------------------------------------------------------------------+
                           |                         ^
              REST API     | (HTTPS / JSON)          | WebSockets (WS)
              (Auth/CRUD)  v                         | (Real-Time Events)
+-----------------------------------------------------------------------+
|                    SERVER (Node.js + Express.js)                      |
|  JWT Auth Middleware  |  REST Controllers  |  Socket.io Event Hub     |
|  Nodemailer OTP Svc   |  node-cron Worker  |  Rate Limiter            |
+-----------------------------------------------------------------------+
                                     |
                                     | Mongoose ODM
                                     v
+-----------------------------------------------------------------------+
|                         DATABASE (MongoDB)                            |
|      Users      |      DirectChats     |     Groups     |   Messages  |
+-----------------------------------------------------------------------+
```

---

## 2. Monorepo Directory Structure

```text
vartalap/
├── client/                         # React Frontend (Vite)
│   ├── public/
│   ├── src/
│   │   ├── api/                    # Axios instance & endpoint functions
│   │   ├── components/
│   │   │   ├── auth/               # Login, Register, OTPModal
│   │   │   ├── chat/               # ChatWindow, MessageBubble, MessageInput, TypingIndicator
│   │   │   ├── groups/             # CreateGroupModal, JoinByTagModal, AdminPanel, CountdownBadge
│   │   │   ├── layout/             # Sidebar, UserSearchDrawer, EmptyState
│   │   │   └── ui/                 # Reusable buttons, badges, modals, toasts
│   │   ├── hooks/                  # Custom hooks (useCountdown, useSocket)
│   │   ├── pages/                  # AuthPage, DashboardPage
│   │   ├── store/                  # Zustand stores (useAuthStore, useChatStore, useSocketStore)
│   │   ├── utils/                  # Date formatters, constants
│   │   ├── App.jsx
│   │   └── main.jsx
│   ├── .env
│   └── package.json
│
├── server/                         # Node.js + Express Backend
│   ├── src/
│   │   ├── config/                 # db.js, mailer.js
│   │   ├── controllers/            # auth.controller.js, user.controller.js, group.controller.js, message.controller.js
│   │   ├── jobs/                   # sessionExpiry.job.js (node-cron)
│   │   ├── middlewares/            # auth.middleware.js, error.middleware.js
│   │   ├── models/                 # User.js, DirectChat.js, Group.js, Message.js
│   │   ├── routes/                 # auth.routes.js, user.routes.js, group.routes.js, message.routes.js
│   │   ├── sockets/                # socketManager.js (All Socket.io handlers)
│   │   ├── utils/                  # generateTag.js (nanoid), generateOTP.js
│   │   └── server.js               # Entry point attaching Express + HTTP + Socket.io
│   ├── .env
│   └── package.json
│
├── prd.md
├── architecture.md
├── rules.md
├── design.md
├── tasks.md
├── memory.md
└── README.md
```

---

## 3. Database Schemas (MongoDB + Mongoose)

### 3.1 `User` Model (`server/src/models/User.js`)
```javascript
{
  fullName: { type: String, required: true, trim: true },
  username: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
  passwordHash: { type: String, required: true },
  avatarUrl: { type: String, default: "" },
  isVerified: { type: Boolean, default: false },
  otpCode: { type: String, default: null },
  otpExpiresAt: { type: Date, default: null },
  lastSeen: { type: Date, default: Date.now }
} // timestamps: true
```

### 3.2 `DirectChat` Model (`server/src/models/DirectChat.js`)
Tracks 1:1 private conversations between two users.
```javascript
{
  participants: [{ type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }], // Always length 2
  lastMessage: { type: mongoose.Schema.Types.ObjectId, ref: "Message", default: null }
} // timestamps: true
```

### 3.3 `Group` Model (`server/src/models/Group.js`)
Tracks both Permanent and Session-based groups with Clash of Clans-style IDs and permissions.
```javascript
{
  name: { type: String, required: true, trim: true },
  description: { type: String, default: "", trim: true },
  groupTag: { type: String, required: true, unique: true, uppercase: true, index: true }, // e.g., "#VRT-8X9P"
  admin: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  members: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  joinMode: { 
    type: String, 
    enum: ["public", "invite_only", "closed"], 
    default: "public" 
  },
  pendingRequests: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    requestedAt: { type: Date, default: Date.now }
  }],
  isSessionGroup: { type: Boolean, default: false },
  expiresAt: { type: Date, default: null, index: true }, // Null if permanent
  status: { type: String, enum: ["active", "expired"], default: "active" },
  pinnedMessages: [{ type: mongoose.Schema.Types.ObjectId, ref: "Message" }],
  lastMessage: { type: mongoose.Schema.Types.ObjectId, ref: "Message", default: null }
} // timestamps: true
```

### 3.4 `Message` Model (`server/src/models/Message.js`)
Unified message collection for both 1:1 Direct Chats and Group Chats.
```javascript
{
  chatType: { type: String, enum: ["direct", "group"], required: true },
  chatId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true }, // Points to DirectChat._id or Group._id
  sender: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  content: { type: String, required: true, trim: true },
  isSystemMessage: { type: Boolean, default: false } // For "User X joined via #VRT-8X9P"
} // timestamps: true
```

---

## 4. REST API Endpoints

### Auth Routes (`/api/auth`)
* `POST /api/auth/register` — Validate fields, create unverified user, send 6-digit OTP email.
* `POST /api/auth/verify-otp` — Verify `email` + `otpCode`, set `isVerified = true`, return JWT.
* `POST /api/auth/resend-otp` — Generate new OTP (rate-limited).
* `POST /api/auth/login` — Authenticate verified user, return JWT + user profile.
* `GET /api/auth/me` — Get current logged-in user profile.

### User & 1:1 Direct Chat Routes (`/api/users` & `/api/direct-chats`)
* `GET /api/users/search?q=username` — Search verified users by `@username`.
* `POST /api/direct-chats` — Get or create a 1:1 `DirectChat` with `targetUserId`.
* `GET /api/direct-chats` — List all active 1:1 conversations for the logged-in user.

### Group Routes (`/api/groups`)
* `POST /api/groups` — Create a group (generates unique `#VRT-XXXX` tag, sets `joinMode` and optional `expiresAt`).
* `GET /api/groups/my-groups` — List all groups the user is a member of.
* `GET /api/groups/search?tag=VRT-XXXX` — Look up a group by its exact `groupTag`.
* `POST /api/groups/:groupId/join` — Join immediately (if `public`), add to `pendingRequests` (if `invite_only`), or reject (if `closed`).
* `POST /api/groups/:groupId/requests/:userId` — Admin approves or rejects a pending join request (`action: 'approve' | 'reject'`).
* `PATCH /api/groups/:groupId/settings` — Admin updates `joinMode`, `description`, or extends timer.
* `POST /api/groups/:groupId/pin/:messageId` — Admin pins/unpins a message.
* `DELETE /api/groups/:groupId/members/:userId` — Admin removes a member or member leaves group.

### Message Routes (`/api/messages`)
* `GET /api/messages/:chatType/:chatId` — Fetch paginated message history (`direct` or `group`).
* `POST /api/messages` — Persist a new message and emit it to the active Socket room.

---

## 5. Socket.io Real-Time Architecture

### Server State Tracking
* `onlineUsers = new Map()` mapping `userId -> Set(socketId)` to handle multiple open tabs cleanly.
* Every user automatically joins a personal room named `user:<userId>` upon connecting (used for delivering private notifications like join request approvals).
* When a user opens or belongs to a chat, their socket joins `direct:<directChatId>` or `group:<groupId>`.

### Socket Event Registry

| Direction | Event Name | Payload | Description |
| :--- | :--- | :--- | :--- |
| **Client $\rightarrow$ Server** | `room:join` | `{ roomType, roomId }` | Joins the active Socket room (`direct:id` or `group:id`). |
| **Client $\rightarrow$ Server** | `typing:start` | `{ roomType, roomId, username }` | Notifies room members that user started typing. |
| **Client $\rightarrow$ Server** | `typing:stop` | `{ roomType, roomId, username }` | Notifies room members that user stopped typing. |
| **Server $\rightarrow$ Client** | `presence:online_list`| `[userId1, userId2, ...]` | Broadcasts updated list of online user IDs. |
| **Server $\rightarrow$ Client** | `message:new` | `{ messageObject }` | Broadcasts newly created message to all sockets in the room. |
| **Server $\rightarrow$ Client** | `typing:update` | `{ roomId, username, isTyping }` | Updates typing indicator in the client UI. |
| **Server $\rightarrow$ Client** | `group:request_new` | `{ groupId, user }` | Sent to `user:<adminId>` when someone requests to join an `invite_only` group. |
| **Server $\rightarrow$ Client** | `group:request_resolved`| `{ group, status }` | Sent to `user:<requesterId>` when Admin approves/rejects their request. |
| **Server $\rightarrow$ Client** | `group:expired` | `{ groupId }` | Emitted by `node-cron` when a session group's timer hits zero. |

---

## 6. Session Group Expiration Engine (`node-cron`)

1. Located in `server/src/jobs/sessionExpiry.job.js`.
2. Runs every 30 seconds (`*/30 * * * * *`) so demo timers (e.g., 1-minute or 2-minute test groups) expire promptly during the live presentation.
3. Query:
   ```javascript
   const expiredGroups = await Group.find({
     isSessionGroup: true,
     status: "active",
     expiresAt: { $lte: new Date() }
   });
   ```
4. For each expired group:
   * Updates `status = "expired"` (or deletes if hard-delete is chosen).
   * Inserts a system message: *"Session timer has ended. This group is now closed."*
   * Emits `io.to("group:" + group._id).emit("group:expired", { groupId: group._id })`.