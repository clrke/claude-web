# Ralph Web Dashboard

A modern web interface for managing Ralph autonomous development loops. Monitor, control, and manage your AI-powered development sessions from the browser.

## Overview

Ralph Web Dashboard wraps around the existing [Ralph for Claude Code](./ralph-claude-code/) CLI tool, providing a real-time web interface without modifying the core Ralph scripts.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              BROWSER                                         │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                     React + TypeScript Frontend                        │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐   │  │
│  │  │  Dashboard  │  │   Projects  │  │   History   │  │  Settings   │   │  │
│  │  │    View     │  │   Manager   │  │   Browser   │  │    Panel    │   │  │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘   │  │
│  │                            │                                           │  │
│  │              ┌─────────────┴─────────────┐                            │  │
│  │              │     WebSocket Client      │                            │  │
│  │              │   (Real-time Updates)     │                            │  │
│  │              └───────────────────────────┘                            │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      │ HTTP/WebSocket
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         NODE.JS + EXPRESS SERVER                             │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                           API Layer                                    │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐   │  │
│  │  │  /api/loops │  │/api/projects│  │ /api/history│  │ /api/github │   │  │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘   │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                        Service Layer                                   │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐   │  │
│  │  │    Loop     │  │   Project   │  │  Notifier   │  │   GitHub    │   │  │
│  │  │   Manager   │  │   Service   │  │   Service   │  │   Service   │   │  │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘   │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │  WebSocket Server  │  Process Manager  │  File Watcher  │  SQLite DB  │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                      ┌───────────────┼───────────────┐
                      │               │               │
                      ▼               ▼               ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                            LOCAL FILESYSTEM                                  │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────────┐  │
│  │  Ralph Scripts  │  │  Project Dirs   │  │      State Files            │  │
│  │  ralph_loop.sh  │  │  ~/projects/*   │  │  status.json                │  │
│  │  ralph_monitor  │  │  PROMPT.md      │  │  .exit_signals              │  │
│  │  ralph_import   │  │  @fix_plan.md   │  │  .circuit_breaker_state     │  │
│  └─────────────────┘  └─────────────────┘  └─────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Data Flow

### Starting a Loop

```
┌──────────┐      ┌──────────┐      ┌──────────┐      ┌──────────┐
│  User    │      │  React   │      │  Express │      │  Ralph   │
│  Browser │      │  Client  │      │  Server  │      │  CLI     │
└────┬─────┘      └────┬─────┘      └────┬─────┘      └────┬─────┘
     │                 │                 │                 │
     │  Click Start    │                 │                 │
     │────────────────>│                 │                 │
     │                 │                 │                 │
     │                 │  POST /api/loops/start            │
     │                 │────────────────>│                 │
     │                 │                 │                 │
     │                 │                 │  spawn process  │
     │                 │                 │────────────────>│
     │                 │                 │                 │
     │                 │  { loopId, status: 'starting' }   │
     │                 │<────────────────│                 │
     │                 │                 │                 │
     │  UI Update      │                 │                 │
     │<────────────────│                 │                 │
     │                 │                 │                 │
     │                 │  WebSocket: loop.started          │
     │                 │<════════════════│                 │
     │                 │                 │                 │
     │  Live Status    │                 │                 │
     │<────────────────│                 │                 │
     │                 │                 │                 │
```

### Real-time Log Streaming

```
┌──────────────────────────────────────────────────────────────────┐
│                      LOG STREAMING FLOW                           │
└──────────────────────────────────────────────────────────────────┘

  Ralph Process                Server                    Browser
       │                         │                          │
       │  stdout/stderr          │                          │
       │────────────────────────>│                          │
       │                         │                          │
       │                         │  Parse & Buffer          │
       │                         │  ─────────────           │
       │                         │                          │
       │                         │  WebSocket: log.chunk    │
       │                         │═════════════════════════>│
       │                         │                          │
       │                         │                          │  Append to
       │                         │                          │  Terminal View
       │                         │                          │  ────────────
       │                         │                          │
       │  status.json updated    │                          │
       │────────────────────────>│                          │
       │                         │                          │
       │                         │  WebSocket: status.update│
       │                         │═════════════════════════>│
       │                         │                          │
       │                         │                          │  Update
       │                         │                          │  Dashboard
       │                         │                          │
```

## Component Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           FRONTEND COMPONENTS                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                            App Shell                                 │    │
│  │  ┌──────────┐  ┌─────────────────────────────────────────────────┐  │    │
│  │  │  Sidebar │  │                   Main Content                   │  │    │
│  │  │          │  │  ┌───────────────────────────────────────────┐  │  │    │
│  │  │ Dashboard│  │  │              Dashboard Page                │  │    │
│  │  │ Projects │  │  │  ┌─────────────┐  ┌─────────────────────┐  │  │    │
│  │  │ History  │  │  │  │ Active Loop │  │   System Metrics    │  │  │    │
│  │  │ Settings │  │  │  │    Card     │  │       Card          │  │  │    │
│  │  │          │  │  │  └─────────────┘  └─────────────────────┘  │  │    │
│  │  │          │  │  │  ┌─────────────────────────────────────┐   │  │    │
│  │  │          │  │  │  │         Live Terminal View          │   │  │    │
│  │  │          │  │  │  │   (WebSocket-powered log stream)    │   │  │    │
│  │  │          │  │  │  └─────────────────────────────────────┘   │  │    │
│  │  │          │  │  │  ┌─────────────┐  ┌─────────────────────┐  │  │    │
│  │  │          │  │  │  │Circuit Brkr │  │   Rate Limiter      │  │  │    │
│  │  │          │  │  │  │   Status    │  │      Status         │  │  │    │
│  │  │          │  │  │  └─────────────┘  └─────────────────────┘  │  │    │
│  │  └──────────┘  │  └───────────────────────────────────────────┘  │  │    │
│  │                └─────────────────────────────────────────────────┘  │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Backend Services

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           BACKEND SERVICES                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────┐    ┌─────────────────────┐                         │
│  │    LoopManager      │    │   ProjectService    │                         │
│  ├─────────────────────┤    ├─────────────────────┤                         │
│  │ • start(projectId)  │    │ • create(config)    │                         │
│  │ • stop(loopId)      │    │ • list()            │                         │
│  │ • getStatus(loopId) │    │ • get(id)           │                         │
│  │ • getLogs(loopId)   │    │ • update(id, data)  │                         │
│  │ • listActive()      │    │ • delete(id)        │                         │
│  │                     │    │ • importPRD(file)   │                         │
│  └──────────┬──────────┘    └──────────┬──────────┘                         │
│             │                          │                                     │
│             └──────────┬───────────────┘                                     │
│                        ▼                                                     │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                      ProcessManager                                  │    │
│  ├─────────────────────────────────────────────────────────────────────┤    │
│  │  • spawn(command, args)     - Start Ralph subprocess                 │    │
│  │  • kill(pid)                - Terminate process                      │    │
│  │  • onStdout(pid, callback)  - Stream stdout                          │    │
│  │  • onStderr(pid, callback)  - Stream stderr                          │    │
│  │  • onExit(pid, callback)    - Handle process exit                    │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  ┌─────────────────────┐    ┌─────────────────────┐                         │
│  │   FileWatcher       │    │   NotifierService   │                         │
│  ├─────────────────────┤    ├─────────────────────┤                         │
│  │ • watch(path)       │    │ • send(title, body) │                         │
│  │ • onChange(cb)      │───>│ • onLoopComplete()  │                         │
│  │ • unwatch(path)     │    │ • onError()         │                         │
│  └─────────────────────┘    └─────────────────────┘                         │
│                                                                              │
│  ┌─────────────────────┐    ┌─────────────────────┐                         │
│  │   GitHubService     │    │   HistoryService    │                         │
│  ├─────────────────────┤    ├─────────────────────┤                         │
│  │ • linkRepo(url)     │    │ • record(loopData)  │                         │
│  │ • getCommits()      │    │ • query(filters)    │                         │
│  │ • getPRs()          │    │ • getStats()        │                         │
│  │ • getStatus()       │    │ • export(format)    │                         │
│  └─────────────────────┘    └─────────────────────┘                         │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Database Schema

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           SQLite Database                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────┐         ┌─────────────────────┐                    │
│  │      projects       │         │       loops         │                    │
│  ├─────────────────────┤         ├─────────────────────┤                    │
│  │ id
 (PK)           │────────<│ id (PK)             │                    │
│  │ name               │         │ project_id (FK)     │                    │
│  │ path               │         │ status              │                    │
│  │ github_repo        │         │ started_at          │                    │
│  │ created_at         │         │ ended_at            │                    │
│  │ updated_at         │         │ exit_reason         │                    │
│  │ config (JSON)      │         │ loop_count          │                    │
│  └─────────────────────┘         │ api_calls           │                    │
│                                  │ logs_path           │                    │
│                                  └─────────────────────┘                    │
│                                            │                                 │
│                                            │                                 │
│  ┌─────────────────────┐         ┌────────┴────────────┐                    │
│  │     settings        │         │    loop_events      │                    │
│  ├─────────────────────┤         ├─────────────────────┤                    │
│  │ key (PK)           │         │ id (PK)             │                    │
│  │ value              │         │ loop_id (FK)        │                    │
│  │ updated_at         │         │ event_type          │                    │
│  └─────────────────────┘         │ payload (JSON)      │                    │
│                                  │ timestamp           │                    │
│                                  └─────────────────────┘                    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## WebSocket Events

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         WebSocket Protocol                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Server → Client Events                                                      │
│  ─────────────────────                                                       │
│                                                                              │
│  ┌─────────────────┬────────────────────────────────────────────────────┐   │
│  │ Event           │ Payload                                            │   │
│  ├─────────────────┼────────────────────────────────────────────────────┤   │
│  │ loop.started    │ { loopId, projectId, timestamp }                   │   │
│  │ loop.progress   │ { loopId, iteration, apiCalls, status }            │   │
│  │ loop.log        │ { loopId, chunk, stream: 'stdout'|'stderr' }       │   │
│  │ loop.completed  │ { loopId, exitReason, duration, stats }            │   │
│  │ loop.error      │ { loopId, error, code }                            │   │
│  │ status.update   │ { loopId, circuitBreaker, rateLimit }              │   │
│  │ notification    │ { type, title, message }                           │   │
│  └─────────────────┴────────────────────────────────────────────────────┘   │
│                                                                              │
│  Client → Server Events                                                      │
│  ─────────────────────                                                       │
│                                                                              │
│  ┌─────────────────┬────────────────────────────────────────────────────┐   │
│  │ Event           │ Payload                                            │   │
│  ├─────────────────┼────────────────────────────────────────────────────┤   │
│  │ subscribe       │ { loopId }  - Subscribe to loop updates            │   │
│  │ unsubscribe     │ { loopId }  - Unsubscribe from loop                │   │
│  │ ping            │ { }         - Keep-alive                           │   │
│  └─────────────────┴────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18, TypeScript, Tailwind CSS |
| State | Zustand or React Context |
| Backend | Node.js, Express |
| Real-time | Socket.IO (WebSocket) |
| Database | SQLite (better-sqlite3) |
| Process | Node child_process |
| Notifications | node-notifier |

## Features

### Dashboard
- Real-time loop status and metrics
- Live terminal output with ANSI color support
- Circuit breaker state visualization
- Rate limit countdown timer

### Project Management
- Create new Ralph projects
- Import PRDs and specifications
- Configure loop settings per project
- Link GitHub repositories

### History
- Browse past loop executions
- Filter by project, status, date
- View detailed loop statistics
- Export history data

### Notifications
- Desktop notifications on loop completion
- Browser notifications (with permission)
- Configurable notification preferences

### GitHub Integration
- Link projects to repositories
- View recent commits
- Monitor PR status
- Quick links to repo

## Getting Started

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Start production server
npm start
```

## Project Structure

```
ralph-web/
├── client/                 # React frontend
│   ├── src/
│   │   ├── components/     # UI components
│   │   ├── pages/          # Page components
│   │   ├── hooks/          # Custom React hooks
│   │   ├── services/       # API clients
│   │   ├── store/          # State management
│   │   └── types/          # TypeScript types
│   └── public/
├── server/                 # Express backend
│   ├── src/
│   │   ├── routes/         # API routes
│   │   ├── services/       # Business logic
│   │   ├── models/         # Database models
│   │   ├── websocket/      # WebSocket handlers
│   │   └── utils/          # Utilities
│   └── db/                 # SQLite database
├── shared/                 # Shared types
└── package.json
```

## License

MIT
