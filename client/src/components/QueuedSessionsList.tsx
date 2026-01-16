import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Session } from '@claude-code-web/shared';

interface QueuedSessionsListProps {
  sessions: Session[];
  onReorder: (orderedFeatureIds: string[]) => Promise<void>;
  isReordering?: boolean;
  formatRelativeTime: (date: Date) => string;
}

interface SortableSessionCardProps {
  session: Session;
  formatRelativeTime: (date: Date) => string;
  isReordering?: boolean;
}

const STATUS_COLORS: Record<string, string> = {
  queued: 'bg-yellow-700',
  discovery: 'bg-blue-600',
  planning: 'bg-yellow-600',
  implementing: 'bg-purple-600',
  pr_creation: 'bg-green-600',
  pr_review: 'bg-teal-600',
  final_approval: 'bg-emerald-600',
  completed: 'bg-gray-600',
  paused: 'bg-orange-600',
  failed: 'bg-red-600',
};

function DragHandle() {
  return (
    <div
      className="flex flex-col justify-center items-center w-6 h-8 cursor-grab active:cursor-grabbing text-gray-500 hover:text-gray-300 transition-colors"
      aria-label="Drag to reorder"
    >
      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
        <path d="M7 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM7 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM7 14a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM13 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM13 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM13 14a2 2 0 1 0 0 4 2 2 0 0 0 0-4z" />
      </svg>
    </div>
  );
}

function SortableSessionCard({ session, formatRelativeTime, isReordering }: SortableSessionCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: session.featureId });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-stretch bg-gray-800 rounded-lg overflow-hidden transition-all ${
        isDragging ? 'opacity-50 shadow-lg ring-2 ring-blue-500' : 'hover:bg-gray-700'
      } ${isReordering ? 'pointer-events-none' : ''}`}
      data-testid={`queued-session-${session.featureId}`}
    >
      {/* Drag handle */}
      <div
        {...attributes}
        {...listeners}
        className="flex items-center px-2 bg-gray-900/50 hover:bg-gray-900 transition-colors"
        data-testid="drag-handle"
      >
        <DragHandle />
      </div>

      {/* Session content - clickable link */}
      <Link
        to={`/session/${session.projectId}/${session.featureId}`}
        className="flex-1 p-4 min-w-0"
        onClick={(e) => isDragging && e.preventDefault()}
      >
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-yellow-500 font-medium text-sm">
                #{session.queuePosition}
              </span>
              <h3 className="font-medium text-lg truncate">{session.title}</h3>
            </div>
            <p className="text-gray-400 text-sm mt-1 truncate">
              {session.projectPath}
            </p>
            {session.featureDescription && (
              <p className="text-gray-500 text-sm mt-1 line-clamp-2">
                {session.featureDescription}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 sm:gap-3 sm:ml-4 flex-wrap">
            <span className={`px-2 py-1 rounded text-xs font-medium ${STATUS_COLORS[session.status] || 'bg-gray-600'}`}>
              Queued
            </span>
            <span className="text-gray-500 text-sm">
              {formatRelativeTime(new Date(session.updatedAt))}
            </span>
          </div>
        </div>
      </Link>
    </div>
  );
}

export default function QueuedSessionsList({
  sessions,
  onReorder,
  isReordering = false,
  formatRelativeTime,
}: QueuedSessionsListProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // Require 8px movement before drag starts
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Sort sessions by queue position
  const sortedSessions = useMemo(
    () => [...sessions].sort((a, b) => (a.queuePosition || 0) - (b.queuePosition || 0)),
    [sessions]
  );

  const featureIds = useMemo(
    () => sortedSessions.map((s) => s.featureId),
    [sortedSessions]
  );

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = featureIds.indexOf(active.id as string);
      const newIndex = featureIds.indexOf(over.id as string);

      if (oldIndex !== -1 && newIndex !== -1) {
        const newOrder = arrayMove(featureIds, oldIndex, newIndex);
        await onReorder(newOrder);
      }
    }
  };

  // Don't render drag-and-drop for single or no items
  if (sortedSessions.length <= 1) {
    return (
      <div className="space-y-3">
        {sortedSessions.map((session) => (
          <div
            key={session.featureId}
            className="bg-gray-800 hover:bg-gray-700 rounded-lg p-4 transition-colors"
            data-testid={`queued-session-${session.featureId}`}
          >
            <Link
              to={`/session/${session.projectId}/${session.featureId}`}
              className="block"
            >
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-yellow-500 font-medium text-sm">
                      #{session.queuePosition}
                    </span>
                    <h3 className="font-medium text-lg truncate">{session.title}</h3>
                  </div>
                  <p className="text-gray-400 text-sm mt-1 truncate">
                    {session.projectPath}
                  </p>
                  {session.featureDescription && (
                    <p className="text-gray-500 text-sm mt-1 line-clamp-2">
                      {session.featureDescription}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2 sm:gap-3 sm:ml-4 flex-wrap">
                  <span className={`px-2 py-1 rounded text-xs font-medium ${STATUS_COLORS[session.status] || 'bg-gray-600'}`}>
                    Queued
                  </span>
                  <span className="text-gray-500 text-sm">
                    {formatRelativeTime(new Date(session.updatedAt))}
                  </span>
                </div>
              </div>
            </Link>
          </div>
        ))}
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={featureIds} strategy={verticalListSortingStrategy}>
        <div className="space-y-3" data-testid="queued-sessions-list">
          {sortedSessions.map((session) => (
            <SortableSessionCard
              key={session.featureId}
              session={session}
              formatRelativeTime={formatRelativeTime}
              isReordering={isReordering}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
