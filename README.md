# Ralph Web Dashboard

A modern web interface for managing Ralph autonomous development loops. Monitor, control, and manage your AI-powered development sessions from the browser.

> **Note**: This document describes the planned architecture for the web dashboard. The current implementation is the bash-based [Ralph for Claude Code](./ralph-claude-code/) CLI tool.

## Overview

Ralph Web Dashboard wraps around the existing Ralph CLI tool, providing a real-time web interface without modifying the core Ralph scripts. The server reads Ralph's state files and log outputs via file polling to provide live updates.

## Architecture

```mermaid
flowchart TB
    subgraph Browser["Browser"]
        subgraph Frontend["React + TypeScript Frontend"]
            Dashboard["Dashboard View"]
            Projects["Projects Manager"]
            History["History Browser"]
            Settings["Settings Panel"]
            WSClient["WebSocket Client"]
        end
    end

    subgraph Server["Node.js + Express Server"]
        subgraph API["API Layer"]
            LoopsAPI["/api/loops"]
            ProjectsAPI["/api/projects"]
            HistoryAPI["/api/history"]
            GithubAPI["/api/github"]
        end
        subgraph Services["Service Layer"]
            LoopMgr["Loop Manager"]
            ProjectSvc["Project Service"]
            NotifierSvc["Notifier Service"]
            GithubSvc["GitHub Service"]
        end
        subgraph Infra["Infrastructure"]
            WSServer["WebSocket Server"]
            ProcessMgr["Process Manager"]
            FileWatcher["File Watcher"]
            SQLite["SQLite DB"]
        end
    end

    subgraph Filesystem["Local Filesystem"]
        subgraph Scripts["Ralph Scripts"]
            RalphLoop["ralph_loop.sh"]
            RalphMonitor["ralph_monitor.sh"]
            RalphImport["ralph_import.sh"]
        end
        subgraph StateFiles["State Files"]
            StatusJSON["status.json"]
            ProgressJSON["progress.json"]
            ExitSignals[".exit_signals"]
            CircuitState[".circuit_breaker_state"]
        end
        subgraph Logs["Log Files"]
            RalphLog["logs/ralph.log"]
            ClaudeOutput["logs/claude_output_*.log"]
        end
    end

    Frontend <-->|HTTP/WebSocket| Server
    WSClient <-->|Real-time| WSServer
    Services --> ProcessMgr
    ProcessMgr -->|spawn| Scripts
    FileWatcher -->|poll/watch| StateFiles
    FileWatcher -->|tail| Logs
    Services --> SQLite
```

## Ralph Components

```mermaid
flowchart LR
    subgraph Scripts["Main Scripts"]
        A["ralph_loop.sh<br/><i>Main loop engine</i>"]
        B["ralph_monitor.sh<br/><i>Terminal dashboard</i>"]
        C["ralph_import.sh<br/><i>PRD converter</i>"]
        D["setup.sh<br/><i>Project init</i>"]
    end

    subgraph Lib["Library Modules (lib/)"]
        E["circuit_breaker.sh<br/><i>CLOSED/HALF_OPEN/OPEN</i>"]
        F["response_analyzer.sh<br/><i>JSON parsing</i>"]
        G["date_utils.sh<br/><i>Cross-platform dates</i>"]
    end

    subgraph State["State Files"]
        H["status.json"]
        I["progress.json"]
        J[".exit_signals"]
        K[".circuit_breaker_state"]
        L[".claude_session_id"]
        M[".call_count"]
    end

    A --> E
    A --> F
    A --> G
    A --> State
    B --> H
    B --> I
```

## Data Flow

### Important: File-Based Architecture

Ralph writes all output to files, not stdout. The web server must use **file polling** to capture updates.

```mermaid
flowchart LR
    subgraph Ralph["Ralph Process"]
        Loop["ralph_loop.sh"]
        Claude["Claude Code CLI"]
    end

    subgraph Output["File Output"]
        LogFile["logs/claude_output_N.log"]
        Status["status.json"]
        Progress["progress.json"]
    end

    Loop -->|"spawn"| Claude
    Claude -->|"stdout/stderr > file"| LogFile
    Loop -->|"write"| Status
    Loop -->|"write every 10s"| Progress

    Note["Ralph redirects ALL output to files.<br/>No stdout streaming available."]
```

### Starting a Loop

```mermaid
sequenceDiagram
    participant User as User Browser
    participant React as React Client
    participant Express as Express Server
    participant Ralph as Ralph CLI

    User->>React: Click Start
    React->>Express: POST /api/loops/start
    Express->>Ralph: spawn ralph_loop.sh
    Note over Ralph: Single long-running process
    Express-->>React: { loopId, pid, status }
    React-->>User: UI Update
    Express->>Express: Start file watchers
    Express-->>React: WebSocket: loop.started
    React-->>User: Live Status
```

### Real-time Updates via File Polling

```mermaid
sequenceDiagram
    participant Ralph as Ralph Process
    participant FS as File System
    participant Server as Express Server
    participant Browser as Browser

    Ralph->>FS: Write status.json
    loop Every 1-2 seconds
        Server->>FS: Poll for changes
        FS-->>Server: File modified
    end
    Server->>Server: Parse JSON
    Server->>Browser: WebSocket: status.update

    Ralph->>FS: Write progress.json (every 10s)
    Server->>FS: Detect change
    Server->>Browser: WebSocket: loop.progress

    Ralph->>FS: Append to claude_output.log
    Server->>FS: Tail new lines
    Server->>Browser: WebSocket: log.chunk
```

## Component Architecture

```mermaid
flowchart TB
    subgraph AppShell["App Shell"]
        subgraph Sidebar["Sidebar"]
            NavDash["Dashboard"]
            NavProj["Projects"]
            NavHist["History"]
            NavSet["Settings"]
        end

        subgraph Main["Main Content"]
            subgraph DashPage["Dashboard Page"]
                ActiveLoop["Active Loop Card"]
                Metrics["System Metrics Card"]
                Terminal["Live Terminal View<br/><i>(File-polled log stream)</i>"]
                CircuitStatus["Circuit Breaker Status"]
                RateStatus["Rate Limiter Status"]
            end
        end
    end

    Sidebar --> Main
```

## Backend Services

```mermaid
classDiagram
    class LoopManager {
        +start(projectId)
        +stop(loopId)
        +getStatus(loopId)
        +getLogs(loopId)
        +listActive()
    }

    class ProjectService {
        +create(config)
        +list()
        +get(id)
        +update(id, data)
        +delete(id)
        +importPRD(file)
    }

    class ProcessManager {
        +spawn(command, args)
        +kill(pid)
        +isAlive(pid)
        +onExit(pid, callback)
    }

    class FileWatcher {
        +watch(path)
        +poll(interval)
        +tailLog(path, callback)
        +unwatch(path)
    }

    class NotifierService {
        +send(title, body)
        +onLoopComplete()
        +onCircuitOpen()
        +onError()
    }

    class GitHubService {
        +linkRepo(url)
        +getCommits()
        +getPRs()
        +getStatus()
    }

    class HistoryService {
        +record(loopData)
        +query(filters)
        +getStats()
        +export(format)
    }

    LoopManager --> ProcessManager
    ProjectService --> ProcessManager
    FileWatcher --> NotifierService
    LoopManager --> FileWatcher
```

## Database Schema

```mermaid
erDiagram
    projects ||--o{ loops : has
    loops ||--o{ loop_events : contains
    loops ||--o{ circuit_breaker_snapshots : tracks
    loops ||--o{ notifications : generates

    projects {
        int id PK
        string name
        string path
        string description
        string github_repo
        string github_token_enc
        int max_calls_per_hour
        datetime created_at
        datetime updated_at
        json config
    }

    loops {
        int id PK
        int project_id FK
        int pid
        string status
        datetime started_at
        datetime ended_at
        string exit_reason
        int loop_count
        int api_calls
        int files_changed
        int error_count
        string logs_path
    }

    loop_events {
        int id PK
        int loop_id FK
        string event_type
        json payload
        datetime timestamp
    }

    settings {
        string key PK
        string value
        datetime updated_at
    }

    notifications {
        int id PK
        int loop_id FK
        string type
        string title
        string message
        boolean read
        datetime created_at
    }

    circuit_breaker_snapshots {
        int id PK
        int loop_id FK
        string state
        int consecutive_no_prog
        string reason
        datetime timestamp
    }
```

## WebSocket Events

### Server to Client Events

```mermaid
flowchart LR
    subgraph Lifecycle["Loop Lifecycle"]
        A["loop.started"]
        B["loop.progress"]
        C["loop.log"]
        D["loop.completed"]
        E["loop.error"]
        F["loop.timeout"]
        G["loop.retrying"]
    end

    subgraph Circuit["Circuit Breaker"]
        H["circuit.closed"]
        I["circuit.half"]
        J["circuit.open"]
    end

    subgraph Exit["Exit Conditions"]
        K["exit.detected"]
        L["exit.imminent"]
    end

    subgraph Rate["Rate Limiting"]
        M["rate.update"]
        N["rate.warning"]
        O["rate.limited"]
        P["rate.reset"]
        Q["rate.api_limit"]
    end

    subgraph Session["Session & Files"]
        R["session.started"]
        S["session.saved"]
        T["files.changed"]
    end

    subgraph Notify["Notifications"]
        U["notification"]
    end
```

### Event Payloads

| Event | Payload |
|-------|---------|
| `loop.started` | `{ loopId, projectId, pid, timestamp }` |
| `loop.progress` | `{ loopId, iteration, apiCalls, elapsed, status }` |
| `loop.log` | `{ loopId, chunk, timestamp }` |
| `loop.completed` | `{ loopId, exitReason, duration, stats }` |
| `loop.error` | `{ loopId, error, code, recoverable }` |
| `circuit.closed` | `{ loopId, recoveredFrom }` |
| `circuit.half` | `{ loopId, consecutiveNoProgress, monitoring }` |
| `circuit.open` | `{ loopId, reason, loopsSinceProgress }` |
| `exit.detected` | `{ loopId, type, confidence, loopsUntilExit }` |
| `rate.update` | `{ loopId, callsUsed, callsRemaining, resetAt }` |
| `rate.limited` | `{ loopId, minutesUntilReset }` |
| `session.started` | `{ loopId, sessionId, mode: 'new'\|'resume' }` |
| `files.changed` | `{ loopId, count, files: [...] }` |

### Client to Server Events

| Event | Payload | Description |
|-------|---------|-------------|
| `subscribe` | `{ loopId }` | Subscribe to loop updates |
| `unsubscribe` | `{ loopId }` | Unsubscribe from loop |
| `ping` | `{ }` | Keep-alive |

## Ralph State File Formats

### status.json
```json
{
  "timestamp": "2026-01-10T12:34:56Z",
  "loop_count": 5,
  "calls_made_this_hour": 25,
  "max_calls_per_hour": 100,
  "last_action": "executing claude code",
  "status": "running",
  "exit_reason": null,
  "next_reset": "2026-01-10T13:00:00Z"
}
```

### progress.json
```json
{
  "status": "executing",
  "indicator": "⠋",
  "elapsed_seconds": 45,
  "last_output": "Working on feature...",
  "timestamp": "2026-01-10T12:35:41Z"
}
```

### .exit_signals
```json
{
  "test_only_loops": [1, 2],
  "done_signals": [5],
  "completion_indicators": [3, 5]
}
```

### .circuit_breaker_state
```json
{
  "state": "CLOSED",
  "last_change": "2026-01-10T12:00:00Z",
  "consecutive_no_progress": 0,
  "consecutive_same_error": 0,
  "last_progress_loop": 5,
  "total_opens": 1,
  "reason": null,
  "current_loop": 6
}
```

### .claude_session_id
```json
{
  "session_id": "claude-session-abc123",
  "timestamp": 1704902400,
  "expires_at": 1705075200
}
```

## Circuit Breaker State Machine

```mermaid
stateDiagram-v2
    [*] --> CLOSED

    CLOSED --> HALF_OPEN: 2 consecutive\nno-progress loops
    HALF_OPEN --> OPEN: 3+ consecutive\nno-progress loops
    HALF_OPEN --> CLOSED: Progress detected
    OPEN --> [*]: Loop halted

    note right of CLOSED: Normal operation
    note right of HALF_OPEN: Monitoring for recovery
    note right of OPEN: Circuit tripped,\nloop stops
```

## Security Considerations

```mermaid
flowchart TB
    subgraph Local["Local-Only Deployment"]
        A["Server binds to 127.0.0.1"]
        B["No auth required locally"]
        C["CORS: localhost only"]
    end

    subgraph Data["Data Protection"]
        D["GitHub tokens encrypted"]
        E["Logs filtered before API"]
        F["Session IDs protected"]
    end

    subgraph Input["Input Validation"]
        G["All inputs validated"]
        H["Path traversal prevention"]
        I["No shell interpolation"]
    end

    subgraph Process["Process Isolation"]
        J["Ralph runs in project dir"]
        K["No arbitrary commands"]
        L["Only predefined scripts"]
    end

    subgraph Future["Future: Multi-User"]
        M["JWT authentication"]
        N["RBAC for projects"]
        O["Audit logging"]
        P["HTTPS certificates"]
    end
```

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18, TypeScript, Tailwind CSS |
| State | Zustand |
| Backend | Node.js, Express |
| Real-time | Socket.IO (WebSocket) |
| Database | SQLite (better-sqlite3) |
| File Watching | chokidar |
| Process | Node child_process |
| Notifications | node-notifier |

## Features

### Dashboard
- Real-time loop status and metrics
- Live terminal output with ANSI color support
- Circuit breaker state visualization (CLOSED/HALF_OPEN/OPEN)
- Rate limit countdown timer
- Exit condition detection display

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
- Circuit breaker alerts
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

# Start development server (runs both client and server)
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
│   │   │   ├── useWebSocket.ts
│   │   │   ├── useLoopStatus.ts
│   │   │   └── useFilePolling.ts
│   │   ├── services/       # API clients
│   │   ├── store/          # Zustand stores
│   │   └── types/          # TypeScript types
│   └── public/
├── server/                 # Express backend
│   ├── src/
│   │   ├── routes/         # API routes
│   │   ├── services/       # Business logic
│   │   │   ├── LoopManager.ts
│   │   │   ├── FileWatcher.ts
│   │   │   └── ProcessManager.ts
│   │   ├── models/         # Database models
│   │   ├── websocket/      # WebSocket handlers
│   │   └── utils/          # Utilities
│   └── db/                 # SQLite database
├── shared/                 # Shared types
│   └── types/
│       ├── events.ts       # WebSocket event types
│       └── models.ts       # Shared data models
├── ralph-claude-code/      # Ralph CLI (upstream)
└── package.json
```

## Implementation Notes

### File Polling Strategy

Ralph writes to files, not stdout. The server uses this approach:

1. **State Files** (status.json, progress.json, etc.)
   - Poll every 1-2 seconds
   - Compare timestamps to detect changes
   - Parse and broadcast via WebSocket

2. **Log Files** (logs/claude_output_*.log)
   - Track file position (bytes read)
   - Tail new content on each poll
   - Stream chunks to subscribed clients

3. **Performance**
   - Use chokidar for efficient file watching where supported
   - Fall back to polling on unsupported filesystems
   - Debounce rapid file changes

### Process Lifecycle

```mermaid
sequenceDiagram
    participant Server
    participant Ralph as Ralph Process

    Server->>Ralph: spawn("ralph_loop.sh")
    Note over Ralph: Process runs indefinitely<br/>executing Claude in loops

    alt User stops loop
        Server->>Ralph: kill(pid, SIGTERM)
        Ralph-->>Server: Graceful shutdown
    else Loop completes naturally
        Ralph-->>Server: Exit with reason
    end
```

## License

MIT
