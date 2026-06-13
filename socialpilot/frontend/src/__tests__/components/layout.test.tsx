import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

// Mock next/font/google since it requires a Next.js environment
vi.mock('next/font/google', () => ({
  Inter: () => ({ className: 'inter-font' }),
}));

// Mock sonner Toaster for testing
vi.mock('sonner', () => ({
  Toaster: () => React.createElement('div', { 'data-testid': 'toaster' }),
}));

describe('RootLayout', () => {
  it('renders children within the layout', async () => {
    const mod = await import('@/app/layout');
    const RootLayout = mod.default || mod;

    render(
      React.createElement(
        RootLayout,
        null,
        React.createElement('div', { 'data-testid': 'child' }, 'Test Child')
      )
    );

    expect(screen.getByTestId('child')).toBeInTheDocument();
    expect(screen.getByText('Test Child')).toBeInTheDocument();
  });

  it('renders the Toaster component', async () => {
    const mod = await import('@/app/layout');
    const RootLayout = mod.default || mod;

    render(
      React.createElement(
        RootLayout,
        null,
        React.createElement('div', null, 'Content')
      )
    );

    expect(screen.getByTestId('toaster')).toBeInTheDocument();
  });
});
