import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { ApiError, request } from '../lib/api';
import { readSession, writeSession, type Session } from '../lib/sessionStorage';
import type { User } from '../lib/types';
import { useConfig } from './ConfigContext';
import { canMigrateServerNotes, migrateServerNotes } from '../lib/migrateServerNotes';
import { sameDevBackend } from '../lib/serverAddress';

type Auth = {
  user: User | null;
  token: string | null;
  ready: boolean;
  authenticate: (
    mode: 'login' | 'register',
    username: string,
    password: string,
    nickname: string,
  ) => Promise<void>;
  logout: () => Promise<void>;
};
const Context = createContext<Auth | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { apiUrl, ready: configReady } = useConfig();
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const generation = useRef(0);
  useEffect(() => {
    if (!configReady) return;
    let active = true;
    const version = ++generation.current;
    const valid = () => active && version === generation.current;
    const load = async () => {
      const stored = await readSession();
      if (!stored) return;
      const saved: Session = JSON.parse(stored);
      if (saved.apiUrl !== apiUrl) {
        if (!canMigrateServerNotes(saved.apiUrl, apiUrl)) return;
        let verified: User;
        try {
          verified = await request<User>(apiUrl, '/api/auth/me', saved.token, { timeout: 5000 });
        } catch (error) {
          if (!sameDevBackend(saved.apiUrl, apiUrl) || !(error instanceof ApiError) ||
              (error.status !== 0 && error.status < 500)) return;
          // A gateway port migration must still allow local drafts while offline.
          verified = saved.user;
        }
        if (!valid() || verified.id !== saved.user.id) return;
        await migrateServerNotes(saved.apiUrl, apiUrl, verified.id);
        if (!valid()) return;
        const next = { ...saved, apiUrl, user: verified };
        await writeSession(next);
        if (valid()) setSession(next);
        return;
      }
      if (!valid()) return;
      setSession(saved);
      setReady(true);
      try {
        const verified = await request<User>(apiUrl, '/api/auth/me', saved.token);
        if (valid()) setSession({ ...saved, user: verified });
      } catch (error) {
        if (valid() && error instanceof ApiError && error.status === 401) {
          await writeSession(null);
          if (valid()) setSession(null);
          return;
        }
        // A saved session remains useful for reading local notes while offline.
      }
    };
    void load()
      .catch(() => {})
      .finally(() => {
        if (valid()) setReady(true);
      });
    return () => {
      active = false;
    };
  }, [apiUrl, configReady]);

  const authenticate: Auth['authenticate'] = async (mode, username, password, nickname) => {
    if (!/^[a-zA-Z0-9_]{3,24}$/.test(username.trim())) {
      throw new ApiError('账号需为 3–24 位英文字母、数字或下划线；中文名字请填写在昵称里', 422);
    }
    if (password.length < 8 || password.length > 128) {
      throw new ApiError('密码需要 8–128 位，请检查后重新提交', 422);
    }
    const version = ++generation.current;
    const result = await request<{ user: User; token: string }>(apiUrl, '/api/auth/' + mode, null, {
      method: 'POST',
      body: { username: username.trim(), password, nickname: nickname.trim() },
    });
    const next = { apiUrl, ...result };
    if (version !== generation.current) return;
    const stored = await readSession();
    if (stored) {
      const previous: Session = JSON.parse(stored);
      if (previous.user.id === next.user.id && canMigrateServerNotes(previous.apiUrl, apiUrl))
        await migrateServerNotes(previous.apiUrl, apiUrl, next.user.id);
    }
    if (version !== generation.current) return;
    await writeSession(next);
    setSession(next);
  };
  const logout = async () => {
    generation.current++;
    if (session?.apiUrl === apiUrl) {
      await request(apiUrl, '/api/auth/logout', session.token, { method: 'POST' }).catch(() => {});
    }
    await writeSession(null);
    setSession(null);
  };
  const current = session?.apiUrl === apiUrl ? session : null;
  return (
    <Context.Provider
      value={{
        user: current?.user || null,
        token: current?.token || null,
        ready,
        authenticate,
        logout,
      }}
    >
      {children}
    </Context.Provider>
  );
}

export function useAuth() {
  const auth = useContext(Context);
  if (!auth) throw new Error('AuthProvider is required');
  return auth;
}
