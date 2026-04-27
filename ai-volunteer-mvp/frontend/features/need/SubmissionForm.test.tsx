import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SubmissionForm } from '@/features/need/SubmissionForm';
import { Providers } from '@/components/providers';

// Mock the router
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
}));

describe('SubmissionForm', () => {
  it('renders the form fields correctly', () => {
    render(
      <Providers>
        <SubmissionForm />
      </Providers>
    );

    expect(screen.getByPlaceholderText(/Emergency blood needed/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Park Street, Kolkata/i)).toBeInTheDocument();
  });

  it('shows validation errors for empty fields', async () => {
    render(
      <Providers>
        <SubmissionForm />
      </Providers>
    );

    const submitButton = screen.getByRole('button', { name: /Submit Request/i });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText(/Please provide more details/i)).toBeInTheDocument();
    });
  });
});
