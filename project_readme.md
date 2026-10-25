# Vartalap: Real-Time Communication Platform

**Vartalap** is a full-stack real-time messaging platform built on the MERN stack (`MongoDB`, `Express.js`, `React.js`, `Node.js`) with `Socket.io`. It solves common privacy and group management pain points found in traditional messaging apps by introducing zero-contact `@username` discovery, searchable unique Group IDs (`#VRT-XXXX`), granular group admission controls, and session-based groups with live countdown timers.

## Key Features

* **One-Account-Per-Email OTP Verification:** Prevents fake account creation and misuse by verifying users with a 6-digit Email OTP during sign-up and enforcing unique email and username constraints.

* **Zero-Contact Private Messaging:** Connect and chat 1-on-1 with anyone by searching their unique `@username` without ever sharing personal phone numbers.

* **Unique Group IDs (`#VRT-XXXX`):** Join groups of 100+ people effortlessly by searching a unique alphanumeric Group ID instead of saving contacts or manually distributing invite links.

* **Admin Group Entry Controls:** Group Administrators have full control over group entry with three modes:

  * **Anyone Can Join (`Public`):** Instant entry via Group ID search.

  * **Invite Only (`Approval Queue`):** Users request to join via Group ID and wait for Admin approval.

  * **Closed:** Group is locked to new external joins.

* **Session-Based Groups with Countdown Timer:** Create temporary groups for courses, projects, or events that display a live countdown timer and automatically close/expire when the timer ends—alongside standard permanent groups.

* **Real-Time Experience:** Instant messaging without page reloads, live **Online / Offline** status indicators, **Typing...** indicators, and pinned group announcements.

## Tech Stack

* **Frontend:** React.js (Vite), Tailwind CSS, Zustand, Axios, Lucide Icons

* **Backend:** Node.js, Express.js

* **Real-Time Communication:** Socket.io (WebSockets)

* **Database:** MongoDB with Mongoose ODM

* **Authentication:** JWT (JSON Web Tokens), bcryptjs, Nodemailer (Email OTP)

* **Utilities:** `nanoid` (Unique Group IDs), `node-cron` (Automated Session Group Expiry)

## Local Setup Instructions

### 1. Clone the Repository

```
git clone <your-repo-url>
cd vartalap

```

### 2. Setup Backend (`server/`)

```
cd server
npm install

```

Create a `.env` file inside the `server/` folder:

```
PORT=5000
MONGO_URI=mongodb://127.0.0.1:27017/vartalap
JWT_SECRET=vartalap_secret_key_2026
CLIENT_URL=http://localhost:5173
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_gmail_app_password

```

*(Note: For local development convenience, generated 6-digit OTPs are also printed directly in the server terminal console.)*

Start the backend server:

```
npm run dev

```

### 3. Setup Frontend (`client/`)

Open a new terminal window:

```
cd client
npm install

```

Create a `.env` file inside the `client/` folder:

```
VITE_API_URL=http://localhost:5000/api
VITE_SOCKET_URL=http://localhost:5000

```

Start the React development server:

```
npm run dev

```

## Team Members

* **ADITYA KUMAR JHA** (`NNM24CS018`)

* **ADITYA PRAKASH** (`NNM24CS019`)

* **AHAMMAD ADNAN** (`NNM24CS021`)