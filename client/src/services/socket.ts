import { io, Socket } from 'socket.io-client';
import type { Question, Plan } from '@claude-code-web/shared';

export interface SocketEvents {
  // Incoming events
  'stage.changed': (data: {
    sessionId: string;
    previousStage: number;
    currentStage: number;
    status: string;
    timestamp: string;
  }) => void;
  'questions.batch': (data: {
    count: number;
    questions: Question[];
    timestamp: string;
  }) => void;
  'question.asked': (data: Question & { timestamp: string }) => void;
  'question.answered': (data: {
    id: string;
    answer: Question['answer'];
    answeredAt: string;
    timestamp: string;
  }) => void;
  'plan.updated': (data: {
    planVersion: number;
    stepCount: number;
    isApproved: boolean;
    steps: Plan['steps'];
    timestamp: string;
  }) => void;
  'plan.approved': (data: {
    planVersion: number;
    timestamp: string;
  }) => void;
  'execution.status': (data: {
    status: 'running' | 'idle' | 'error';
    action: string;
    timestamp: string;
  }) => void;
  'claude.output': (data: {
    output: string;
    isComplete: boolean;
    timestamp: string;
  }) => void;
}

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io('/', {
      autoConnect: false,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });
  }
  return socket;
}

export function connectToSession(projectId: string, featureId: string): Socket {
  const socket = getSocket();

  if (!socket.connected) {
    socket.connect();
  }

  const room = `${projectId}/${featureId}`;
  socket.emit('join-session', room);

  return socket;
}

export function disconnectFromSession(projectId: string, featureId: string): void {
  const socket = getSocket();

  if (socket.connected) {
    const room = `${projectId}/${featureId}`;
    socket.emit('leave-session', room);
  }
}

export function disconnect(): void {
  if (socket?.connected) {
    socket.disconnect();
  }
}
