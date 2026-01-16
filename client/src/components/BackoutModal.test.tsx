import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import BackoutModal from './BackoutModal';

describe('BackoutModal', () => {
  const mockOnClose = vi.fn();
  const mockOnConfirm = vi.fn();
  const defaultProps = {
    isOpen: true,
    onClose: mockOnClose,
    onConfirm: mockOnConfirm,
    sessionTitle: 'Test Feature',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Clean up body styles
    document.body.style.overflow = '';
  });

  describe('rendering', () => {
    it('renders modal when isOpen is true', () => {
      render(<BackoutModal {...defaultProps} />);

      expect(screen.getByTestId('backout-modal')).toBeInTheDocument();
      expect(screen.getByText('Back Out of Session')).toBeInTheDocument();
    });

    it('does not render modal when isOpen is false', () => {
      render(<BackoutModal {...defaultProps} isOpen={false} />);

      expect(screen.queryByTestId('backout-modal')).not.toBeInTheDocument();
    });

    it('displays session title in the content', () => {
      render(<BackoutModal {...defaultProps} sessionTitle="My Feature" />);

      expect(screen.getByText('My Feature')).toBeInTheDocument();
    });

    it('renders both action options', () => {
      render(<BackoutModal {...defaultProps} />);

      expect(screen.getByTestId('pause-option')).toBeInTheDocument();
      expect(screen.getByTestId('abandon-option')).toBeInTheDocument();
      expect(screen.getByText('Put on Hold')).toBeInTheDocument();
      expect(screen.getByText("Won't Do")).toBeInTheDocument();
    });

    it('displays consequence explanations for pause option', () => {
      render(<BackoutModal {...defaultProps} />);

      expect(screen.getByText(/Pause this session temporarily/)).toBeInTheDocument();
      expect(screen.getByText(/Resumable - Progress is preserved/)).toBeInTheDocument();
    });

    it('displays consequence explanations for abandon option', () => {
      render(<BackoutModal {...defaultProps} />);

      expect(screen.getByText(/Permanently abandon this session/)).toBeInTheDocument();
      expect(screen.getByText(/Permanent - Cannot be undone/)).toBeInTheDocument();
    });

    it('renders reason select with options', () => {
      render(<BackoutModal {...defaultProps} />);

      const select = screen.getByTestId('reason-select');
      expect(select).toBeInTheDocument();
      expect(screen.getByText('User Requested')).toBeInTheDocument();
      expect(screen.getByText('Blocked by External Dependency')).toBeInTheDocument();
      expect(screen.getByText('Deprioritized / No Longer Needed')).toBeInTheDocument();
    });

    it('renders cancel and confirm buttons', () => {
      render(<BackoutModal {...defaultProps} />);

      expect(screen.getByTestId('cancel-button')).toBeInTheDocument();
      expect(screen.getByTestId('confirm-button')).toBeInTheDocument();
    });
  });

  describe('action selection', () => {
    it('starts with no action selected', () => {
      render(<BackoutModal {...defaultProps} />);

      const confirmButton = screen.getByTestId('confirm-button');
      expect(confirmButton).toBeDisabled();
    });

    it('enables confirm button when pause is selected', async () => {
      const user = userEvent.setup();
      render(<BackoutModal {...defaultProps} />);

      await user.click(screen.getByTestId('pause-option'));

      const confirmButton = screen.getByTestId('confirm-button');
      expect(confirmButton).not.toBeDisabled();
      expect(confirmButton).toHaveTextContent('Confirm Put on Hold');
    });

    it('enables confirm button when abandon is selected', async () => {
      const user = userEvent.setup();
      render(<BackoutModal {...defaultProps} />);

      await user.click(screen.getByTestId('abandon-option'));

      const confirmButton = screen.getByTestId('confirm-button');
      expect(confirmButton).not.toBeDisabled();
      expect(confirmButton).toHaveTextContent("Confirm Won't Do");
    });

    it('allows switching between actions', async () => {
      const user = userEvent.setup();
      render(<BackoutModal {...defaultProps} />);

      await user.click(screen.getByTestId('pause-option'));
      expect(screen.getByTestId('confirm-button')).toHaveTextContent('Confirm Put on Hold');

      await user.click(screen.getByTestId('abandon-option'));
      expect(screen.getByTestId('confirm-button')).toHaveTextContent("Confirm Won't Do");
    });
  });

  describe('reason selection', () => {
    it('defaults to user_requested reason', () => {
      render(<BackoutModal {...defaultProps} />);

      const select = screen.getByTestId('reason-select') as HTMLSelectElement;
      expect(select.value).toBe('user_requested');
    });

    it('allows changing reason', async () => {
      const user = userEvent.setup();
      render(<BackoutModal {...defaultProps} />);

      await user.selectOptions(screen.getByTestId('reason-select'), 'blocked');

      const select = screen.getByTestId('reason-select') as HTMLSelectElement;
      expect(select.value).toBe('blocked');
    });
  });

  describe('confirm action', () => {
    it('calls onConfirm with pause action and reason', async () => {
      const user = userEvent.setup();
      render(<BackoutModal {...defaultProps} />);

      await user.click(screen.getByTestId('pause-option'));
      await user.click(screen.getByTestId('confirm-button'));

      expect(mockOnConfirm).toHaveBeenCalledWith('pause', 'user_requested');
    });

    it('calls onConfirm with abandon action and reason', async () => {
      const user = userEvent.setup();
      render(<BackoutModal {...defaultProps} />);

      await user.click(screen.getByTestId('abandon-option'));
      await user.selectOptions(screen.getByTestId('reason-select'), 'blocked');
      await user.click(screen.getByTestId('confirm-button'));

      expect(mockOnConfirm).toHaveBeenCalledWith('abandon', 'blocked');
    });

    it('calls onConfirm with deprioritized reason', async () => {
      const user = userEvent.setup();
      render(<BackoutModal {...defaultProps} />);

      await user.click(screen.getByTestId('pause-option'));
      await user.selectOptions(screen.getByTestId('reason-select'), 'deprioritized');
      await user.click(screen.getByTestId('confirm-button'));

      expect(mockOnConfirm).toHaveBeenCalledWith('pause', 'deprioritized');
    });
  });

  describe('close behavior', () => {
    it('calls onClose when cancel button is clicked', async () => {
      const user = userEvent.setup();
      render(<BackoutModal {...defaultProps} />);

      await user.click(screen.getByTestId('cancel-button'));

      expect(mockOnClose).toHaveBeenCalled();
    });

    it('calls onClose when close button is clicked', async () => {
      const user = userEvent.setup();
      render(<BackoutModal {...defaultProps} />);

      await user.click(screen.getByTestId('close-button'));

      expect(mockOnClose).toHaveBeenCalled();
    });

    it('calls onClose when backdrop is clicked', async () => {
      const user = userEvent.setup();
      render(<BackoutModal {...defaultProps} />);

      await user.click(screen.getByTestId('backout-modal-backdrop'));

      expect(mockOnClose).toHaveBeenCalled();
    });

    it('does not close when modal content is clicked', async () => {
      const user = userEvent.setup();
      render(<BackoutModal {...defaultProps} />);

      await user.click(screen.getByTestId('backout-modal'));

      expect(mockOnClose).not.toHaveBeenCalled();
    });

    it('calls onClose when Escape key is pressed', async () => {
      render(<BackoutModal {...defaultProps} />);

      fireEvent.keyDown(document, { key: 'Escape' });

      expect(mockOnClose).toHaveBeenCalled();
    });
  });

  describe('loading state', () => {
    it('disables confirm button when loading', async () => {
      const user = userEvent.setup();
      render(<BackoutModal {...defaultProps} isLoading />);

      await user.click(screen.getByTestId('pause-option'));

      expect(screen.getByTestId('confirm-button')).toBeDisabled();
    });

    it('shows loading spinner when loading', () => {
      render(<BackoutModal {...defaultProps} isLoading />);

      expect(screen.getByText('Processing...')).toBeInTheDocument();
    });

    it('disables cancel button when loading', () => {
      render(<BackoutModal {...defaultProps} isLoading />);

      expect(screen.getByTestId('cancel-button')).toBeDisabled();
    });

    it('disables close button when loading', () => {
      render(<BackoutModal {...defaultProps} isLoading />);

      expect(screen.getByTestId('close-button')).toBeDisabled();
    });

    it('does not close on backdrop click when loading', async () => {
      const user = userEvent.setup();
      render(<BackoutModal {...defaultProps} isLoading />);

      await user.click(screen.getByTestId('backout-modal-backdrop'));

      expect(mockOnClose).not.toHaveBeenCalled();
    });

    it('does not close on Escape when loading', () => {
      render(<BackoutModal {...defaultProps} isLoading />);

      fireEvent.keyDown(document, { key: 'Escape' });

      expect(mockOnClose).not.toHaveBeenCalled();
    });
  });

  describe('state reset', () => {
    it('resets selection when modal reopens', async () => {
      const user = userEvent.setup();
      const { rerender } = render(<BackoutModal {...defaultProps} />);

      // Select an action
      await user.click(screen.getByTestId('abandon-option'));
      await user.selectOptions(screen.getByTestId('reason-select'), 'blocked');

      // Close and reopen
      rerender(<BackoutModal {...defaultProps} isOpen={false} />);
      rerender(<BackoutModal {...defaultProps} isOpen={true} />);

      // Should be reset
      expect(screen.getByTestId('confirm-button')).toBeDisabled();
      const select = screen.getByTestId('reason-select') as HTMLSelectElement;
      expect(select.value).toBe('user_requested');
    });
  });

  describe('accessibility', () => {
    it('prevents body scrolling when open', () => {
      render(<BackoutModal {...defaultProps} />);

      expect(document.body.style.overflow).toBe('hidden');
    });

    it('restores body scrolling when closed', () => {
      const { unmount } = render(<BackoutModal {...defaultProps} />);

      unmount();

      expect(document.body.style.overflow).toBe('');
    });

    it('has radio buttons for action selection', () => {
      render(<BackoutModal {...defaultProps} />);

      const radioButtons = screen.getAllByRole('radio', { hidden: true });
      expect(radioButtons).toHaveLength(2);
    });

    it('has combobox for reason selection', () => {
      render(<BackoutModal {...defaultProps} />);

      expect(screen.getByRole('combobox')).toBeInTheDocument();
    });
  });

  describe('button styles', () => {
    it('shows orange button when pause is selected', async () => {
      const user = userEvent.setup();
      render(<BackoutModal {...defaultProps} />);

      await user.click(screen.getByTestId('pause-option'));

      expect(screen.getByTestId('confirm-button')).toHaveClass('bg-orange-600');
    });

    it('shows red button when abandon is selected', async () => {
      const user = userEvent.setup();
      render(<BackoutModal {...defaultProps} />);

      await user.click(screen.getByTestId('abandon-option'));

      expect(screen.getByTestId('confirm-button')).toHaveClass('bg-red-600');
    });
  });
});
