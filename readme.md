# PLANNIX: AI-Native Kanban Board

**PLANNIX** is a real-time collaborative project management app built with the MERN stack (MongoDB, Express.js, React, Node.js), Socket.io, and Groq AI. Describe a goal in one line and the AI builds your backlog while your team works together live.

---

## Features

### For Users:
- **Kanban Boards:** Drag-and-drop cards across columns with priorities, due dates, and assignees.
- **Dashboard:** Overview of your boards and tasks.
- **My Tasks & Calendar:** Every task assigned to you, plotted by due date.
- **Live Collaboration:** Instant sync, online teammates, and a live activity feed.

### AI Workflows:
- **Task Generation:** Turn a one-line goal into prioritized tasks.
- **Task Breakdown:** Split a big task into subtasks.
- **Sprint Summary:** Get progress, risks, and recommendations.

### Security:
- **Authentication:** Signup and login with hashed passwords and JWT.
- **Roles:** Owner, admin, and member access on every board.

---

## Setup Guide

### 1. Clone the Repository:
```bash
git clone https://github.com/yvrjbhatiya/Plannix
cd Plannix
```

### 2. Install Dependencies:
- **Backend:**
```bash
cd backend
npm install
```
- **Frontend:**
```bash
cd frontend
npm install
```

### 3. Configure Environment Variables:
- **Backend:** Create a `.env` file in the `backend` directory with:
```bash
PORT=5050
CLIENT_URL="http://localhost:5173"
MONGODB_URI="mongodb+srv://USER:PASSWORD@cluster0.xxxxx.mongodb.net/Plannix"
JWT_SECRET="your-secret-key"
JWT_EXPIRES_IN="7d"
GROQ_API_KEY="your-groq-api-key"
GROQ_MODEL="openai/gpt-oss-120b"
```
- **Frontend:** Create a `.env` file in the `frontend` directory with:
```bash
VITE_API_URL="http://localhost:5050/api"
VITE_SOCKET_URL="http://localhost:5050"
```

### 4. Run Development Servers:
- **Backend:**
```bash
cd backend
npm run dev
```
- **Frontend:**
```bash
cd frontend
npm run dev
```

### 5. Access Application:
- **Backend:** [http://localhost:5050/health](http://localhost:5050/health)
- **Frontend:** [http://localhost:5173](http://localhost:5173)

---