import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Session } from './sessionStorage';

const KEY = '@owltrace/session';
export const readSession = () => AsyncStorage.getItem(KEY);
export const writeSession = (session: Session | null) =>
  session ? AsyncStorage.setItem(KEY, JSON.stringify(session)) : AsyncStorage.removeItem(KEY);
