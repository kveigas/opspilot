import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Modal } from '../src/components/Modal';

describe('accessible modal', () => {
  it('labels the dialog, traps keyboard focus, dismisses and returns focus', () => {
    const trigger = document.createElement('button');
    document.body.append(trigger);
    trigger.focus();
    const close = vi.fn();
    const { rerender, unmount } = render(<Modal title="Review evidence" isOpen onClose={close}><button>Save</button></Modal>);
    const dialog = screen.getByRole('dialog', { name: 'Review evidence' });
    expect(dialog).toHaveFocus();
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(screen.getByRole('button', { name: 'Save' })).toHaveFocus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(screen.getByRole('button', { name: 'Close Review evidence' })).toHaveFocus();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(close).toHaveBeenCalledOnce();
    rerender(<Modal title="Review evidence" isOpen={false} onClose={close}><button>Save</button></Modal>);
    expect(trigger).toHaveFocus();
    unmount();
    trigger.remove();
  });
});
