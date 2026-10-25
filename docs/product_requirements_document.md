# Product Requirements Document (PRD) — Vartalap

## 1. Project Overview
* **Project Name:** Vartalap: Real-Time Communication Platform
* **Category:** Real-Time Web Application (MERN + Socket.io)
* **Timeline:** ~60 Combined Team Hours (14-Day Sprint Post-Exams, Demo in 4th Week of November)
* **Problem Solved:** 
  1. Eliminates mandatory personal phone number sharing required by apps like WhatsApp by using unique `@usernames`.
  2. Eliminates the tedious process of saving 100+ contacts or distributing insecure invite links by introducing searchable unique Group IDs (`#VRT-XXXX`) with granular admin entry controls.
  3. Prevents dead/inactive "ghost groups" from cluttering chat lists by introducing Session-Based Groups with live countdown timers and automatic expiration.
  4. Prevents spam and duplicate fake accounts by enforcing 1 account per verified email ID via OTP.

---

## 2. User Roles
1. **Unverified User:** Has submitted registration details but has not yet completed the 6-digit Email OTP verification. Cannot access the dashboard.
2. **Verified Member:** Standard authenticated user. Can search users by `@username`, start 1:1 private chats, search and join groups via unique Group ID, send real-time messages, and create new groups.
3. **Group Administrator:** Creator (or promoted admin) of a group. Has exclusive permissions to set group entry mode (`Anyone Can Join`, `Invite Only`, `Closed`), approve/reject join requests, pin important messages, configure session countdown timers, and remove members.

---

## 3. Functional Requirements & Priority Matrix

### P0: Core MVP Features (Must Be 100% Working for Demo)

#### F1: Authentication & 1-Account-Per-Email Verification
* Users sign up with `fullName`, `username` (unique, lowercase), `email` (unique, lowercase), and `password`.
* System dispatches a 6-digit Email OTP valid for $5\text{ minutes}$ using Nodemailer.
* Duplicate emails or usernames are strictly rejected at the database index level.
* Verified users log in and receive an HTTP-only cookie or Bearer JWT token.

#### F2: Zero-Contact 1:1 Private Messaging
* Users can search for any verified user by their exact or partial `@username`.
* Clicking a user opens a private 1:1 real-time chat room without exposing phone numbers or email addresses.
* Real-time features:
  * Instant message delivery via `Socket.io` without page reload.
  * Live **Online / Offline** green dot indicator.
  * Live **"User is typing..."** indicator.

#### F3: Unique Group ID (Clan Tag System) & Discovery
* Every newly created group automatically receives a short, unique, human-readable Group ID generated via `nanoid` (e.g., `#VRT-8K2P`).
* Users can type a Group ID into the search bar to preview the group card (Group Name, Member Count, Entry Mode, Session Type).

#### F4: Admin Group Entry Controls (Clash of Clans Model)
* Group Admins can switch the group mode at any time between three states:
  1. **Anyone Can Join (`public`):** Clicking "Join" adds the user to the group immediately.
  2. **Invite Only (`invite_only`):** Clicking "Request to Join" places the user in a pending queue. The Group Admin receives a notification and can click **Approve** or **Reject**.
  3. **Closed (`closed`):** The group can be seen via search, but the join button is disabled.

#### F5: Session-Based Groups with Countdown Timer
* When creating a group, the Admin selects the lifecycle type:
  * **Permanent Group:** Never expires.
  * **Session-Based Group:** Admin sets an expiration date/duration (e.g., $1\text{ hour}$ for demo purposes, $7\text{ days}$, $1\text{ month}$, or $1\text{ year}$).
* Active session groups display a live ticking countdown badge in the chat header.
* A background cron job (`node-cron`) checks every minute for groups where $\text{currentTime} \ge \text{expiresAt}$.
* When expired, the group status switches to `expired` (or auto-deletes based on admin setting), locking new messages and notifying connected members via Socket.io.

#### F6: Message Pinning
* Group Admins can pin important announcements or messages in a group so members can view them in a dedicated "Pinned Messages" drawer.

---

### P2: Extensible Future Scope (Build Only After P0 is Tested)
* **E1: Session Summary PDF Export:** Before or right when a session group expires, users can click "Download Summary" to export a PDF containing group metadata, pinned messages, and shared links.
* **E2: Audio Text-to-Speech (TTS):** A speaker icon on chat bubbles using the browser's native `window.speechSynthesis` API to read messages aloud.
* **E3: Auto-Translated Messages:** Automatic translation of incoming chat messages to the receiver's preferred language with a toggle to view original text.
* **E4: Interactive Whiteboard:** Shared HTML5 Canvas synced over Socket.io for visual explanations.

---

## 4. Key User Flows

### Flow A: Registration & Verification
1. User enters Name, `@username`, Email, Password $\rightarrow$ Clicks **Register**.
2. Backend checks if `email` or `username` exists. If not, saves user with `isVerified: false`, generates 6-digit OTP, emails it, and opens the **OTP Modal** on Frontend.
3. User enters 6-digit OTP $\rightarrow$ Backend validates match and expiry $\rightarrow$ Sets `isVerified: true` and returns JWT.

### Flow B: Joining a Group via Unique Group ID
1. User clicks **"Find Group"** and types `#VRT-4910`.
2. Frontend displays Group Card: *"Placement Bootcamp 2026 (#VRT-4910) • 42 Members • Mode: Invite Only"*.
3. User clicks **"Request to Join"**.
4. Group Admin sees a badge on the **"Requests"** tab inside the Group Info panel and clicks **"Approve"**.
5. User instantly sees the group appear in their left sidebar via a Socket.io event (`group:join_approved`).

### Flow C: Session Group Expiration (Demo Highlight)
1. During the live presentation, Admin creates a Session Group with a **2-minute custom timer**.
2. Team members join via `#VRT-XXXX`, send messages, and pin an important message.
3. All members watch the live countdown hit `00:00:00`.
4. Backend emits `group:expired` $\rightarrow$ Chat input locks immediately with a banner: *"This session has ended."*