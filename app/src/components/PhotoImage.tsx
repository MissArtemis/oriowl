import { useRef } from 'react';
import { Image, type ImageProps } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { useTravel } from '../context/TravelContext';
import type { Photo } from '../lib/types';

export function PhotoImage({ photo, ...props }: Omit<ImageProps, 'source'> & { photo: Photo }) {
  const { token } = useAuth();
  const { apiUrl, sync } = useTravel();
  const retried = useRef('');
  const uri = photo.previewUri || (photo.previewPath ? apiUrl + photo.previewPath : photo.uri);
  const headers =
    token && uri.startsWith(apiUrl + '/api/media/') ? { Authorization: 'Bearer ' + token } : undefined;
  return (
    <Image
      {...props}
      source={{ uri, headers }}
      onError={(event) => {
        props.onError?.(event);
        if (retried.current !== uri) {
          retried.current = uri;
          void sync();
        }
      }}
    />
  );
}
