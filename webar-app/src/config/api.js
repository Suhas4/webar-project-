// Central API base URL — set VITE_API_BASE in .env.local to override.
// Empty string = use Vite proxy (/api/* → localhost:8181). Set VITE_API_BASE to a full URL to bypass proxy.
export const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:8181';

// R2 public CDN base — used to fetch pre-built public .mind file.
// Override with VITE_R2_PUBLIC_URL if the bucket URL ever changes.
export const R2_PUBLIC_URL = (import.meta.env.VITE_R2_PUBLIC_URL ?? 'https://pub-4cb6dfb082c64346a30587f3e9123a37.r2.dev').replace(/\/$/, '');
