import { useRef, useEffect, useState } from 'react';
import { useSessionStore, ConversationEntry, ExecutionStatus } from '../../stores/sessionStore';

interface ConversationPanelProps {
  projectId: string;
  featureId: string;
}

export function ConversationPanel({ projectId, featureId }: ConversationPanelProps) {
  const {
    conversations,
    executionStatus,
    liveOutput,
    isOutputComplete,
    fetchConversations,
  } = useSessionStore();

  const [isExpanded, setIsExpanded] = useState(false);
  const outputRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchConversations(projectId, featureId);
  }, [projectId, featureId, fetchConversations]);

  // Auto-scroll to bottom when new output arrives
  useEffect(() => {
    if (outputRef.current && !isOutputComplete) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [liveOutput, isOutputComplete]);

  const isRunning = executionStatus?.status === 'running';
  const totalCost = conversations.reduce((sum, c) => sum + c.costUsd, 0);

  return (
    <div className="bg-gray-800 rounded-lg overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-4 hover:bg-gray-700/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <StatusIndicator status={executionStatus} />
          <h2 className="font-semibold">Claude Conversation</h2>
          {conversations.length > 0 && (
            <span className="text-sm text-gray-400">
              ({conversations.length} exchange{conversations.length !== 1 ? 's' : ''})
            </span>
          )}
        </div>
        <div className="flex items-center gap-4">
          {totalCost > 0 && (
            <span className="text-sm text-gray-400">
              ${totalCost.toFixed(4)} total
            </span>
          )}
          <svg
            className={`w-5 h-5 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="border-t border-gray-700">
          {/* Live output when running */}
          {isRunning && (
            <div className="p-4 border-b border-gray-700 bg-gray-900/50">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                <span className="text-sm text-blue-400">
                  {executionStatus?.action || 'Processing...'}
                </span>
              </div>
              <div
                ref={outputRef}
                className="font-mono text-sm text-gray-300 max-h-64 overflow-y-auto whitespace-pre-wrap"
              >
                {liveOutput || 'Waiting for output...'}
              </div>
            </div>
          )}

          {/* Conversation history */}
          <div className="overflow-y-auto">
            {conversations.length === 0 && !isRunning ? (
              <div className="p-8 text-center text-gray-500">
                No conversation history yet
              </div>
            ) : (
              conversations.map((entry, index) => (
                <ConversationEntryCard key={index} entry={entry} index={index} />
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function StatusIndicator({ status }: { status: ExecutionStatus | null }) {
  if (!status) {
    return (
      <div className="w-3 h-3 rounded-full bg-gray-500" title="Idle" />
    );
  }

  switch (status.status) {
    case 'running':
      return (
        <div className="relative">
          <div className="w-3 h-3 rounded-full bg-blue-500" />
          <div className="absolute inset-0 w-3 h-3 rounded-full bg-blue-500 animate-ping" />
        </div>
      );
    case 'error':
      return (
        <div className="w-3 h-3 rounded-full bg-red-500" title="Error" />
      );
    case 'idle':
    default:
      return (
        <div className="w-3 h-3 rounded-full bg-green-500" title="Ready" />
      );
  }
}

function ConversationEntryCard({ entry, index }: { entry: ConversationEntry; index: number }) {
  const [isExpanded, setIsExpanded] = useState(false);

  const stageLabel = {
    1: 'Discovery',
    2: 'Plan Review',
    3: 'Implementation',
    4: 'PR Creation',
    5: 'PR Review',
  }[entry.stage] || `Stage ${entry.stage}`;

  return (
    <div className={`border-b border-gray-700 last:border-b-0 ${entry.isError ? 'bg-red-900/10' : ''}`}>
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full p-4 flex items-center justify-between hover:bg-gray-700/30 transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-gray-400">#{index + 1}</span>
          <span className={`px-2 py-0.5 text-xs rounded ${getStageColor(entry.stage)}`}>
            {stageLabel}
          </span>
          {entry.isError && (
            <span className="text-xs text-red-400">Error</span>
          )}
        </div>
        <div className="flex items-center gap-4 text-sm text-gray-400">
          <span>{formatTimestamp(entry.timestamp)}</span>
          {entry.costUsd > 0 && (
            <span>${entry.costUsd.toFixed(4)}</span>
          )}
          <svg
            className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {isExpanded && (
        <div className="px-4 pb-4 space-y-4">
          {/* Prompt */}
          <div>
            <h4 className="text-sm font-medium text-gray-400 mb-2">Prompt</h4>
            <div className="bg-gray-900/50 rounded p-3 font-mono text-sm text-gray-300 overflow-y-auto whitespace-pre-wrap">
              {truncateText(entry.prompt, 2000)}
            </div>
          </div>

          {/* Output */}
          <div>
            <h4 className="text-sm font-medium text-gray-400 mb-2">
              Output
              {entry.output.length > 2000 && (
                <span className="text-gray-500 font-normal ml-2">
                  (truncated, {entry.output.length.toLocaleString()} chars)
                </span>
              )}
            </h4>
            <div className={`bg-gray-900/50 rounded p-3 font-mono text-sm overflow-y-auto whitespace-pre-wrap ${
              entry.isError ? 'text-red-300' : 'text-gray-300'
            }`}>
              {truncateText(entry.output, 2000) || '(empty)'}
            </div>
          </div>

          {/* Error message */}
          {entry.error && (
            <div>
              <h4 className="text-sm font-medium text-red-400 mb-2">Error</h4>
              <div className="bg-red-900/20 rounded p-3 font-mono text-sm text-red-300">
                {entry.error}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function getStageColor(stage: number): string {
  const colors: Record<number, string> = {
    1: 'bg-purple-600',
    2: 'bg-blue-600',
    3: 'bg-green-600',
    4: 'bg-yellow-600',
    5: 'bg-orange-600',
  };
  return colors[stage] || 'bg-gray-600';
}

function formatTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
}
