// Central API base URL — set VITE_API_BASE in .env.local to override.
// Empty string = use Vite proxy (/api/* → localhost:8181). Set VITE_API_BASE to a full URL to bypass proxy.
export const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:8181';
