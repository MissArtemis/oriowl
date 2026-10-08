import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { useNotes } from '../lib/useNotes';
import type { Place } from '../lib/types';
import { useAuth } from './AuthContext';
import { useConfig } from './ConfigContext';
import { colors } from '../ui/theme';

type TravelStore = ReturnType<typeof useNotes> & {
  apiUrl: string;
  saveApiUrl: (url: string) => Promise<void>;
  selectedPlace: Place | null;
  setSelectedPlace: (place: Place | null) => void;
  focusPlace: Place | null;
  setFocusPlace: (place: Place | null) => void;
  currentPlace: Place | null;
  setCurrentPlace: (place: Place | null) => void;
  notify: (text: string) => void;
};
const TravelContext = createContext<TravelStore | null>(null);

export function TravelProvider({ children }: { children: React.ReactNode }) {
  const { apiUrl, saveApiUrl } = useConfig();
  const { user, token } = useAuth();
  const notes = useNotes(apiUrl, user, token);
  const [selectedPlace, setSelectedPlace] = useState<Place | null>(null);
  const [focusPlace, setFocusPlace] = useState<Place | null>(null);
  const [currentPlace, setCurrentPlace] = useState<Place | null>(null);
  const [toast, setToast] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const notify = useCallback((message: string) => {
    if (timer.current) clearTimeout(timer.current);
    setToast(message);
    timer.current = setTimeout(() => setToast(''), 3500);
  }, []);

  return (
    <TravelContext.Provider
      value={{
        ...notes,
        apiUrl,
        saveApiUrl,
        selectedPlace,
        setSelectedPlace,
        focusPlace,
        setFocusPlace,
        currentPlace,
        setCurrentPlace,
        notify,
      }}
    >
      {children}
      {!!toast && (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            bottom: 100,
            left: 24,
            right: 24,
            padding: 15,
            backgroundColor: colors.ink,
            borderRadius: 16,
            zIndex: 100,
          }}
        >
          <Text style={{ color: 'white', textAlign: 'center', fontSize: 13 }}>{toast}</Text>
        </View>
      )}
    </TravelContext.Provider>
  );
}

export function useTravel() {
  const context = useContext(TravelContext);
  if (!context) throw new Error('TravelProvider is required');
  return context;
}
