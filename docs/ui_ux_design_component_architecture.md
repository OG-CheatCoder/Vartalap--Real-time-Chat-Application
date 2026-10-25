# UI/UX Layout & Component Architecture — Vartalap

> **Note on Visual Theme:** Color palettes and typography tokens are configured as semantic CSS variables in `client/src/index.css` so the team can easily switch or customize the visual theme (e.g., Dark Slate, Emerald Modern, or Indigo Glass) without rewriting component classes.

---

## 1. Application Screen Map

### 1.1 Authentication Screens (`/auth`)
* **Login View:** Email/Username input, Password input, Login button.
* **Register View:** Full Name, `@username` (with live format check), Email ID, Password.
* **OTP Verification Modal:** 6-digit input boxes, 5-minute countdown timer, "Resend OTP" button.

---

### 1.2 Main Workspace Layout (`/dashboard`) — 3-Pane Responsive Architecture

```
+------+------------------------+------------------------------------------+------------------------+
| Nav  |  Chat & Group List     |           Active Chat Window             |   Contextual Drawer    |
| Rail |  (Left Sidebar)        |              (Center Pane)               |   (Right Sidebar)      |
| (64px|       (300px)          |               (Flex-1)                   |   (280px - Toggleable) |
+------+------------------------+------------------------------------------+------------------------+
| [Logo| [Search @user / #Tag]  | Header: #VRT-8K2P | [Timer: 04d 12h 30s] | Group Details          |
|      |                        |         42 Members • Online: 8    [Info] |                        |
| [DM] | [Tabs: All | DMs | Grp]|------------------------------------------| Group ID: [#VRT-8K2P]  |
|      |                        | [Pinned Banner: "Submit synopsis by..."] | [Copy Tag Button]      |
| [Grp]| > @aditya_jha     (On) |                                          |                        |
|      |   "Hey, check the..."  |  @ahammad (10:14 AM)                     | Join Mode (Admin Only):|
| [+]  |                        |  [ Have we finalized the schema? ]       | (•) Invite Only        |
| Join | > Bootcamp Group       |                                          |                        |
| /New |   #VRT-8K2P  [04d:12h] |                     You (10:15 AM)       | Pending Requests (2):  |
|      |   "Pinned: Submit..."  |          [ Yes! Pushing it to GitHub. ]  | - @rahul [Approve][X]  |
|      |                        |                                          |                        |
| [Me] |                        |  * @aditya_p is typing...                | Pinned Messages (1)    |
| [Out]|                        |------------------------------------------| Members List (42)      |
|      |                        | [ Type a message...             ] [Send] |                        |
+------+------------------------+------------------------------------------+------------------------+
```

---

## 2. Core UI Components & States

### 2.1 Global Discovery Modal (`FindUserOrGroupModal.jsx`)
Triggered from the top search bar or the `+` button on the navigation rail. Has two clear tabs:
1. **Find Person (`@username`):**
   * Search input with `@` prefix.
   * Displays matching verified users with a **"Message"** button that immediately opens a 1:1 chat.
2. **Find Group by ID (`#VRT-XXXX`):**
   * Search input for the unique Group ID.
   * Renders a **Group Preview Card** showing:
     * Group Name & Description
     * Unique Tag badge (`#VRT-8K2P`)
     * Lifecycle Badge (`Permanent` or `Session: Expires in 3 days`)
     * Entry Mode Badge & Dynamic Action Button:
       * If `public` $\rightarrow$ **"Join Group Instantly"** (Green button)
       * If `invite_only` $\rightarrow$ **"Request to Join"** (Amber button, changes to *"Request Pending"* once clicked)
       * If `closed` $\rightarrow$ **"Group is Closed"** (Disabled gray button)

### 2.2 Create Group Modal (`CreateGroupModal.jsx`)
1. **Group Name & Description**
2. **Entry Permission Selector (Radio Cards):**
   * **Anyone Can Join:** Anyone searching the Group ID joins immediately.
   * **Invite Only:** Users searching the Group ID must be approved by the Admin.
   * **Closed:** Nobody can join via Group ID search.
3. **Group Lifecycle Toggle:**
   * **Permanent Group** (Default)
   * **Session-Based Group (Countdown Timer):**
     * Preset buttons for easy demoing and real use:
       * `2 Minutes (Demo Test)`
       * `1 Hour`
       * `24 Hours`
       * `7 Days`
       * `Custom Date & Time`

### 2.3 Live Session Countdown Badge (`CountdownBadge.jsx`)
* Placed prominently in the top header of any Session-Based Group.
* Uses a 1-second `setInterval` hook comparing `group.expiresAt` with `Date.now()`.
* Visual urgency states:
  * $> 1\text{ hour}$ left: Neutral/Info badge (`Expires in 2d 14h 10m`)
  * $< 5\text{ minutes}$ left: Pulsing Amber/Red badge (`Closing in 01:42`)
  * Expired (`00:00`): Locked Red badge (`Session Ended`) — replaces the bottom message input box with a locked banner.