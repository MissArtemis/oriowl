const { networkInterfaces } = require('node:os');

module.exports = ({ config }) => {
  const interfaces = Object.entries(networkInterfaces()).sort(
    ([a], [b]) => Number(/WLAN|Wi-Fi|Ethernet/i.test(b)) - Number(/WLAN|Wi-Fi|Ethernet/i.test(a)),
  );
  const address = interfaces
    .flatMap(([, addresses]) => addresses || [])
    .find(
      (entry) => entry.family === 'IPv4' && !entry.internal && !entry.address.startsWith('169.254.'),
    )?.address;
  return {
    ...config,
    extra: { ...config.extra, devApiUrl: address ? `http://${address}:8081` : undefined },
  };
};
