import type { Platform, Role } from './types';

const inr = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});
const indianNumber = new Intl.NumberFormat('en-IN');

/** ₹1,00,000 style (Indian digit grouping, whole rupees). */
export const formatINR = (amount: number): string => inr.format(amount);

/** 1,00,000 style. */
export const formatNumber = (value: number): string => indianNumber.format(value);

/** DD-MM-YYYY in the viewer's local time. */
export function formatDate(iso: string): string {
  const date = new Date(iso);
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  return `${dd}-${mm}-${date.getFullYear()}`;
}

export const PLATFORM_LABEL: Record<Platform, string> = {
  instagram: 'Instagram',
  youtube: 'YouTube',
};

export const homeFor = (role: Role): string => (role === 'brand' ? '/brand' : '/creator');
