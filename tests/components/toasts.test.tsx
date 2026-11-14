import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import ToastContainer from '@/components/common/ToastContainer';
import { toast, useToastStore } from '@/store/toastStore';
import { copyToClipboard } from '@/lib/tauri';

vi.mock('@/lib/tauri', () => ({ copyToClipboard: vi.fn().mockResolvedValue(undefined) }));

beforeEach(() => {
  vi.useFakeTimers();
  useToastStore.getState().clearToasts();
});
afterEach(() => { vi.useRealTimers(); });

const advance = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });

test('repeated S3 errors merge and expire eight seconds after the first occurrence', () => {
  toast.error('S3 error: service error');
  render(<ToastContainer />);
  advance(6000);
  act(() => toast.error('S3 error: service error'));
  expect(screen.getAllByRole('alert')).toHaveLength(1);
  expect(screen.getByText('Occurred 2 times')).toBeTruthy();
  advance(1999);
  expect(screen.getByRole('alert')).toBeTruthy();
  advance(1);
  expect(screen.queryByRole('alert')).toBeNull();
  expect(useToastStore.getState().toasts).toHaveLength(0);
});

test('hover and keyboard focus independently pause the remaining lifetime', () => {
  toast.error('Failed');
  render(<ToastContainer />);
  advance(3000);
  fireEvent.mouseEnter(screen.getByRole('alert'));
  const close = screen.getByRole('button', { name: 'Close notification' });
  fireEvent.focus(close);
  advance(10000);
  fireEvent.mouseLeave(screen.getByRole('alert'));
  advance(10000);
  expect(screen.getByRole('alert')).toBeTruthy();
  fireEvent.blur(close, { relatedTarget: document.body });
  advance(4999);
  expect(screen.getByRole('alert')).toBeTruthy();
  advance(1);
  expect(screen.queryByRole('alert')).toBeNull();
});

test('details remain readable and copyable even if the toast is displaced', () => {
  const message = 'An error message with enough diagnostic context to exceed the truncation limit. '.repeat(2);
  toast.error(message);
  render(<ToastContainer />);
  fireEvent.click(screen.getByRole('button', { name: 'Show Details' }));
  advance(20000);
  expect(useToastStore.getState().toasts).toHaveLength(1);
  act(() => { toast.info('One'); toast.info('Two'); toast.info('Three'); });
  expect(screen.getByRole('dialog')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Copy to Clipboard' }));
  expect(copyToClipboard).toHaveBeenCalledWith(`${message}\n\n`);
  expect(useToastStore.getState().toasts.map(item => item.message)).toEqual(['One', 'Two', 'Three']);
});

test('closing details resumes the remaining time instead of starting a new timeout', () => {
  toast.error('Failed to load', 'S3 error: service error');
  render(<ToastContainer />);
  advance(3000);
  fireEvent.click(screen.getByRole('button', { name: 'Show Details' }));
  advance(20000);
  fireEvent.click(screen.getByRole('button', { name: /^Close$/ }));
  advance(4999);
  expect(useToastStore.getState().toasts).toHaveLength(1);
  advance(1);
  expect(useToastStore.getState().toasts).toHaveLength(0);
});

test('a burst of errors stays bounded and a new failure can appear after dismissal', () => {
  for (let index = 0; index < 100; index++) toast.error(`Failure ${index}`);
  expect(useToastStore.getState().toasts.map(item => item.message)).toEqual(['Failure 97', 'Failure 98', 'Failure 99']);
  const id = useToastStore.getState().toasts[2].id;
  useToastStore.getState().removeToast(id);
  toast.error('Failure 99');
  expect(useToastStore.getState().toasts[2]).toMatchObject({ message: 'Failure 99', count: 1 });
  expect(useToastStore.getState().toasts[2].id).not.toBe(id);
});

test('explicit persistent errors can be dismissed and ordinary success expires after five seconds', () => {
  toast.error('Scheduling stopped', undefined, undefined, { autoHide: false });
  toast.success('Saved');
  render(<ToastContainer />);
  advance(5000);
  expect(screen.queryByText('Saved')).toBeNull();
  advance(20000);
  expect(screen.getByText('Scheduling stopped')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Close notification' }));
  expect(useToastStore.getState().toasts).toHaveLength(0);
});

test('distinct details, resource keys, and action targets are not merged', () => {
  toast.error('Failed', 'Bucket A');
  toast.error('Failed', 'Bucket B');
  expect(useToastStore.getState().toasts).toHaveLength(2);
  useToastStore.getState().clearToasts();
  toast.error('Failed', undefined, undefined, { dedupeKey: 'profile-a/bucket-a' });
  toast.error('Failed', undefined, undefined, { dedupeKey: 'profile-b/bucket-a' });
  toast.error('Failed again', undefined, undefined, { dedupeKey: 'profile-a/bucket-a' });
  expect(useToastStore.getState().toasts).toHaveLength(2);
  expect(useToastStore.getState().toasts[0]).toMatchObject({ message: 'Failed again', count: 2 });
  useToastStore.getState().clearToasts();
  toast.error('Failed', undefined, { label: 'Retry', onClick: vi.fn() });
  toast.error('Failed', undefined, { label: 'Retry', onClick: vi.fn() });
  expect(useToastStore.getState().toasts).toHaveLength(2);
});
