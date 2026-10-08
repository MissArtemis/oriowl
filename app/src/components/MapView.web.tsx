import React, { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import type { MapHandle, MapMessage, MapProps } from '../lib/types';

const MapView = forwardRef<MapHandle, MapProps>(function MapView({ url, onMessage, onError }, ref) {
  const frame = useRef<HTMLIFrameElement>(null);
  useImperativeHandle(
    ref,
    () => ({
      send(command) {
        frame.current?.contentWindow?.postMessage(JSON.stringify(command), new URL(url).origin);
      },
    }),
    [url],
  );
  useEffect(() => {
    function receive(event: MessageEvent) {
      if (event.origin !== new URL(url).origin || event.source !== frame.current?.contentWindow) return;
      try {
        onMessage(JSON.parse(event.data) as MapMessage);
      } catch {
        /* Ignore unrelated messages. */
      }
    }
    window.addEventListener('message', receive);
    return () => window.removeEventListener('message', receive);
  }, [url, onMessage]);
  return React.createElement('iframe', {
    ref: frame,
    src: url,
    title: '旅行地图',
    onError,
    style: { border: 0, width: '100%', height: '100%', flex: 1 },
  });
});
export default MapView;
