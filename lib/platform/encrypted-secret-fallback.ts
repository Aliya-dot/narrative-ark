const DATABASE_NAME = "narrative-ark-encrypted-secrets";
const DATABASE_VERSION = 1;
const STORE_NAME = "secrets";

type EncryptedSecretRecord = {
  id: string;
  cryptoKey: CryptoKey;
  iv: Uint8Array<ArrayBuffer>;
  ciphertext: ArrayBuffer;
  updatedAt: string;
};

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("加密凭据数据库操作失败"));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("加密凭据事务失败"));
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("加密凭据事务已中止"));
  });
}

async function openDatabase(): Promise<IDBDatabase> {
  const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
  request.onupgradeneeded = () => {
    const database = request.result;
    if (!database.objectStoreNames.contains(STORE_NAME)) {
      database.createObjectStore(STORE_NAME, { keyPath: "id" });
    }
  };
  return await requestResult(request);
}

export async function encryptSecretValue(
  value: string,
  cryptoApi: Crypto = globalThis.crypto,
) {
  const cryptoKey = await cryptoApi.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
  const iv = cryptoApi.getRandomValues(new Uint8Array(12));
  const ciphertext = await cryptoApi.subtle.encrypt(
    { name: "AES-GCM", iv },
    cryptoKey,
    new TextEncoder().encode(value),
  );
  return { cryptoKey, iv, ciphertext };
}

export async function decryptSecretValue(
  record: Pick<EncryptedSecretRecord, "cryptoKey" | "iv" | "ciphertext">,
  cryptoApi: Crypto = globalThis.crypto,
) {
  const plaintext = await cryptoApi.subtle.decrypt(
    { name: "AES-GCM", iv: record.iv },
    record.cryptoKey,
    record.ciphertext,
  );
  return new TextDecoder().decode(plaintext);
}

export function createLegacyEncryptedSecretStore() {
  return {
    async get(id: string) {
      const database = await openDatabase();
      try {
        const transaction = database.transaction(STORE_NAME, "readonly");
        const record = (await requestResult(
          transaction.objectStore(STORE_NAME).get(id),
        )) as EncryptedSecretRecord | undefined;
        if (!record) return null;
        return await decryptSecretValue(record);
      } finally {
        database.close();
      }
    },

    async remove(id: string) {
      const database = await openDatabase();
      try {
        const transaction = database.transaction(STORE_NAME, "readwrite");
        transaction.objectStore(STORE_NAME).delete(id);
        await transactionDone(transaction);
      } finally {
        database.close();
      }
    },

    async has(id: string) {
      return (await this.get(id)) !== null;
    },
  };
}
