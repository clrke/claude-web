import '@testing-library/jest-dom';

// Polyfill crypto.subtle for jsdom environment
if (typeof globalThis.crypto === 'undefined' || typeof globalThis.crypto.subtle === 'undefined') {
  const nodeCrypto = require('crypto');

  Object.defineProperty(globalThis, 'crypto', {
    value: {
      subtle: {
        digest: async (algorithm: string, data: Uint8Array) => {
          const hash = nodeCrypto.createHash(algorithm.toLowerCase().replace('-', ''));
          hash.update(data);
          return hash.digest().buffer;
        },
      },
      getRandomValues: (arr: Uint8Array) => nodeCrypto.randomFillSync(arr),
    },
  });
}
