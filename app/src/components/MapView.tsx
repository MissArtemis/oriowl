import { forwardRef, useImperativeHandle, useRef } from 'react';
import { WebView } from 'react-native-webview';
import type { MapHandle, MapMessage, MapProps } from '../lib/types';

const MapView = forwardRef<MapHandle, MapProps>(function MapView({ url, onMessage, onError }, ref) {
  const webview = useRef<WebView>(null);
  useImperativeHandle(ref, () => ({
    send(command) {
      const payload = JSON.stringify(command).replace(/</g, '\\u003c');
      webview.current?.injectJavaScript(`window.oriowlReceive && window.oriowlReceive(${payload}); true;`);
    },
  }));
  return (
    <WebView
      ref={webview}
      source={{ uri: url }}
      style={{ flex: 1, backgroundColor: '#EAECE0' }}
      javaScriptEnabled
      domStorageEnabled
      mixedContentMode="always"
      scrollEnabled={false}
      onMessage={(event) => {
        try {
          onMessage(JSON.parse(event.nativeEvent.data) as MapMessage);
        } catch {
          /* Ignore malformed bridge messages. */
        }
      }}
      onError={onError}
      onHttpError={onError}
      onShouldStartLoadWithRequest={(request) => request.url === url || request.url === 'about:blank'}
    />
  );
});
export default MapView;
