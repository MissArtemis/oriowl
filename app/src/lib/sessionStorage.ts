import * as SecureStore from 'expo-secure-store';
import type { User } from './types';

export type Session = { apiUrl: string; token: string; user: User };
const KEY = 'owltrace.session';
export const readSession = () => SecureStore.getItemAsync(KEY);
export const writeSession = (session: Session | null) =>
  session ? SecureStore.setItemAsync(KEY, JSON.stringify(session)) : SecureStore.deleteItemAsync(KEY);
