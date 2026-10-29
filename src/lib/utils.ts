// Utility functions shared across the application

/**
 * Format bytes into human-readable size string
 * @param bytes - Number of bytes
 * @returns Formatted string like "1.5 MB"
 */
export const formatSize = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
};

/**
 * Get file extension from filename
 * @param name - Filename or path
 * @returns Lowercase extension without dot, or empty string
 */
export const getFileExtension = (name: string): string => {
  const i = name.lastIndexOf('.');
  return i > 0 ? name.slice(i + 1).toLowerCase() : '';
};

/**
 * Format date for display
 * @param dateString - ISO date string or null
 * @returns Formatted date string or placeholder
 */
export const formatDate = (dateString: string | null): string => {
  if (!dateString) return '—';
  return new Date(dateString).toLocaleDateString();
};

/**
 * Format an S3 timestamp as a compact, sortable local date-time.
 * Returns an empty string for missing or invalid values so callers can
 * render their own placeholder.
 */
export const formatDateTime = (dateString: string | null | undefined): string => {
  if (!dateString) return '';
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
};
