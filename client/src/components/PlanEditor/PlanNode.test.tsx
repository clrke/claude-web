import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ComplexityBadge } from './PlanNode';

describe('ComplexityBadge', () => {
  it('renders low complexity with green styling', () => {
    render(<ComplexityBadge complexity="low" />);
    const badge = screen.getByTestId('complexity-badge');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveTextContent('Low');
    expect(badge).toHaveClass('bg-green-900/60');
    expect(badge).toHaveClass('text-green-300');
  });

  it('renders medium complexity with yellow styling', () => {
    render(<ComplexityBadge complexity="medium" />);
    const badge = screen.getByTestId('complexity-badge');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveTextContent('Med');
    expect(badge).toHaveClass('bg-yellow-900/60');
    expect(badge).toHaveClass('text-yellow-300');
  });

  it('renders high complexity with red styling', () => {
    render(<ComplexityBadge complexity="high" />);
    const badge = screen.getByTestId('complexity-badge');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveTextContent('High');
    expect(badge).toHaveClass('bg-red-900/60');
    expect(badge).toHaveClass('text-red-300');
  });

  it('defaults to medium complexity when undefined', () => {
    render(<ComplexityBadge complexity={undefined} />);
    const badge = screen.getByTestId('complexity-badge');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveTextContent('Med');
    expect(badge).toHaveClass('bg-yellow-900/60');
  });

  it('has correct title attribute for accessibility', () => {
    render(<ComplexityBadge complexity="high" />);
    const badge = screen.getByTestId('complexity-badge');
    expect(badge).toHaveAttribute('title', 'Complexity: high');
  });
});
