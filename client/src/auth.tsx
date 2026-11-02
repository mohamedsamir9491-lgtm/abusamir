import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { get, post } from './api';

export interface User { id: string; email: string; full_name: string; role_code: string; permissions: string[]; must_change_password: boolean }
interface Ctx { user: User | null; loading: boolean; login: (email: string, password: string) => Promise<void>; logout: () => Promise<void>; refresh: () => Promise<void>; can: (...p: string[]) => boolean }
const AuthCtx = createContext<Ctx>(null as unknown as Ctx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null); const [loading, setLoading] = useState(true);
  const refresh = async () => { try { const r = await get<{ user: User }>('/auth/me'); setUser(r.user); } catch { setUser(null); } finally { setLoading(false); } };
  useEffect(() => { refresh(); const h = () => setUser(null); window.addEventListener('auth:expired', h); return () => window.removeEventListener('auth:expired', h); }, []);
  const login = async (email: string, password: string) => { await post('/auth/login', { email, password }); await refresh(); };
  const logout = async () => { try { await post('/auth/logout'); } finally { setUser(null); } };
  const can = (...p: string[]) => !!user && p.every((x) => user.permissions.includes(x));
  return <AuthCtx.Provider value={{ user, loading, login, logout, refresh, can }}>{children}</AuthCtx.Provider>;
}
export const useAuth = () => useContext(AuthCtx);
