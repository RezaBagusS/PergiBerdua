import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import type { Category, PlaceDraft } from './types';

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

export const fail = (status: number, message: string): never => {
  throw new ApiError(status, message);
};

export const hash = (s: string | number): string =>
  createHash('sha256').update(String(s)).digest('hex');

export const token = (): string => randomBytes(32).toString('hex');

export const otp = (): string => String(randomInt(0, 1000000)).padStart(6, '0');

export const otpHash = (secret: string, id: string, code: string): string =>
  createHmac('sha256', secret).update(`${id}:${code}`).digest('hex');

export function equal(a: string, b: string): boolean {
  const aa = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return aa.length === bb.length && timingSafeEqual(aa, bb);
}

export function validateEmail(v: unknown): string {
  const s = String(v || '').trim().toLowerCase();
  if (s.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) {
    fail(400, 'Alamat email tidak valid.');
  }
  return s;
}

export function validateUsername(v: unknown): string {
  const s = String(v || '').trim().toLowerCase();
  if (!/^[a-z0-9_]{3,24}$/.test(s)) {
    fail(400, 'Username: 3–24 huruf kecil, angka, atau underscore.');
  }
  return s;
}

export function validateText(v: unknown, max: number, required = false): string {
  const s = String(v ?? '').trim();
  if (s.length > max || (required && !s)) {
    fail(400, `Teks wajib diisi dan maksimal ${max} karakter.`);
  }
  return s;
}

export function validateUuid(v: unknown): string {
  const s = String(v || '');
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(s)) {
    fail(400, 'ID tidak valid.');
  }
  return s;
}

export function dateOnly(v: unknown): string | null {
  if (!v) return null;
  const s = String(v);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(s) ||
    !Number.isFinite(Date.parse(s)) ||
    new Date(s).toISOString().slice(0, 10) !== s ||
    s > new Date().toISOString().slice(0, 10)
  ) {
    fail(400, 'Tanggal jadian harus tanggal valid, bukan masa depan.');
  }
  return s;
}

export const pairKey = (a: string, b: string): string => [a, b].sort().join(':');

export function placeInput(b: Record<string, unknown>): PlaceDraft {
  const categoryRaw = validateText(b.category, 30, true);
  const validCategories: Category[] = ['Alam', 'Kuliner', 'Seni & budaya', 'Santai'];
  if (!validCategories.includes(categoryRaw as Category)) {
    fail(400, 'Kategori tidak valid.');
  }
  const category = categoryRaw as Category;
  const budget = Number(b.budget);
  if (!Number.isSafeInteger(budget) || budget < 0 || budget > 999999999) {
    fail(400, 'Budget tidak valid.');
  }
  return {
    name: validateText(b.name, 80, true),
    area: validateText(b.area, 100, true),
    category,
    budget,
    note: validateText(b.note, 600)
  };
}

export function scheduleTime(value: unknown): string {
  const d = new Date(String(value));
  if (!Number.isFinite(d.getTime()) || d.getTime() <= Date.now()) {
    fail(400, 'Pilih jadwal di masa depan.');
  }
  return d.toISOString();
}

export function reminderTimes(at: string | Date, now = Date.now()): string[] {
  const t = new Date(at).getTime();
  return [24 * 3600000, 2 * 3600000]
    .map(ms => t - ms)
    .filter(msTime => msTime > now)
    .map(msTime => new Date(msTime).toISOString());
}
