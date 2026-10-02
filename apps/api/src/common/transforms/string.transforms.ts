import { Transform } from 'class-transformer';

/** Trims string input (non-strings pass through so validators can reject them). */
export const Trim = () =>
  Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));

/** Emails are case-insensitive identifiers: store and compare them trimmed + lowercased. */
export const NormalizeEmail = () =>
  Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value));
