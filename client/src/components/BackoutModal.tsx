import { useState, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { BackoutAction, BackoutReason } from '@claude-code-web/shared';

interface BackoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (action: BackoutAction, reason: BackoutReason) => void;
  sessionTitle: string;
  isLoading?: boolean;
}

const REASON_OPTIONS: { value: BackoutReason; label: string }[] = [
  { value: 'user_requested', label: 'User Requested' },
  { value: 'blocked', label: 'Blocked by External Dependency' },
  { value: 'deprioritized', label: 'Deprioritized / No Longer Needed' },
];

export default function BackoutModal({
  isOpen,
  onClose,
  onConfirm,
  sessionTitle,
  isLoading = false,
}: BackoutModalProps) {
  const [selectedAction, setSelectedAction] = useState<BackoutAction | null>(null);
  const [selectedReason, setSelectedReason] = useState<BackoutReason>('user_requested');

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setSelectedAction(null);
      setSelectedReason('user_requested');
    }
  }, [isOpen]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isLoading) onClose();
    },
    [onClose, isLoading]
  );

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [isOpen, handleKeyDown]);

  const handleConfirm = () => {
    if (selectedAction) {
      onConfirm(selectedAction, selectedReason);
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70"
      onClick={isLoading ? undefined : onClose}
      data-testid="backout-modal-backdrop"
    >
      <div
        className="bg-gray-800 rounded-lg w-full max-w-lg flex flex-col shadow-xl"
        onClick={(e) => e.stopPropagation()}
        data-testid="backout-modal"
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <h3 className="text-lg font-semibold text-gray-100">Back Out of Session</h3>
          <button
            onClick={onClose}
            disabled={isLoading}
            className="p-1 hover:bg-gray-700 rounded transition-colors disabled:opacity-50"
            data-testid="close-button"
          >
            <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-4 space-y-4">
          <p className="text-gray-300 text-sm">
            Choose how to handle <span className="font-medium text-white">{sessionTitle}</span>:
          </p>

          {/* Action Options */}
          <div className="space-y-3">
            {/* Put on Hold Option */}
            <label
              className={`flex items-start p-4 rounded-lg border-2 cursor-pointer transition-all ${
                selectedAction === 'pause'
                  ? 'border-orange-500 bg-orange-500/10'
                  : 'border-gray-600 hover:border-gray-500 bg-gray-700/50'
              }`}
              data-testid="pause-option"
            >
              <input
                type="radio"
                name="backout-action"
                value="pause"
                checked={selectedAction === 'pause'}
                onChange={() => setSelectedAction('pause')}
                className="sr-only"
              />
              <div className="flex-shrink-0 w-5 h-5 mt-0.5 mr-3 rounded-full border-2 flex items-center justify-center transition-colors
                ${selectedAction === 'pause' ? 'border-orange-500' : 'border-gray-500'}">
                {selectedAction === 'pause' && (
                  <div className="w-2.5 h-2.5 rounded-full bg-orange-500" />
                )}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <svg className="w-5 h-5 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="font-medium text-white">Put on Hold</span>
                </div>
                <p className="text-sm text-gray-400 mt-1">
                  Pause this session temporarily. The next queued session will be promoted to active.
                  You can resume this session later and it will be placed at the front of the queue.
                </p>
                <div className="flex items-center gap-1.5 mt-2 text-xs text-green-400">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>Resumable - Progress is preserved</span>
                </div>
              </div>
            </label>

            {/* Won't Do Option */}
            <label
              className={`flex items-start p-4 rounded-lg border-2 cursor-pointer transition-all ${
                selectedAction === 'abandon'
                  ? 'border-red-500 bg-red-500/10'
                  : 'border-gray-600 hover:border-gray-500 bg-gray-700/50'
              }`}
              data-testid="abandon-option"
            >
              <input
                type="radio"
                name="backout-action"
                value="abandon"
                checked={selectedAction === 'abandon'}
                onChange={() => setSelectedAction('abandon')}
                className="sr-only"
              />
              <div className="flex-shrink-0 w-5 h-5 mt-0.5 mr-3 rounded-full border-2 flex items-center justify-center transition-colors
                ${selectedAction === 'abandon' ? 'border-red-500' : 'border-gray-500'}">
                {selectedAction === 'abandon' && (
                  <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
                )}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="font-medium text-white">Won't Do</span>
                </div>
                <p className="text-sm text-gray-400 mt-1">
                  Permanently abandon this session. The session will be marked as failed and removed
                  from active work. The next queued session will be promoted.
                </p>
                <div className="flex items-center gap-1.5 mt-2 text-xs text-red-400">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <span>Permanent - Cannot be undone</span>
                </div>
              </div>
            </label>
          </div>

          {/* Reason Selection */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-300">
              Reason <span className="text-gray-500">(required)</span>
            </label>
            <select
              value={selectedReason}
              onChange={(e) => setSelectedReason(e.target.value as BackoutReason)}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              data-testid="reason-select"
            >
              {REASON_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="flex justify-end gap-3 p-4 border-t border-gray-700">
          <button
            onClick={onClose}
            disabled={isLoading}
            className="px-4 py-2 text-sm bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors disabled:opacity-50"
            data-testid="cancel-button"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!selectedAction || isLoading}
            className={`px-4 py-2 text-sm rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 ${
              selectedAction === 'abandon'
                ? 'bg-red-600 hover:bg-red-500'
                : selectedAction === 'pause'
                ? 'bg-orange-600 hover:bg-orange-500'
                : 'bg-blue-600 hover:bg-blue-500'
            }`}
            data-testid="confirm-button"
          >
            {isLoading && (
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            )}
            {isLoading
              ? 'Processing...'
              : selectedAction === 'abandon'
              ? "Confirm Won't Do"
              : selectedAction === 'pause'
              ? 'Confirm Put on Hold'
              : 'Confirm'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
