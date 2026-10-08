// SDK 57 installs expo/fetch globally. Use RN's networking adapter explicitly:
// its multipart implementation supports the { uri, name, type } photo parts.
export { sendXhr as sendHttp } from './xhrTransport';
export const transportName = 'XMLHttpRequest';
