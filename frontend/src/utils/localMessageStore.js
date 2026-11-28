/**
 * Client-side Device-First IndexedDB Store (WhatsApp-style local chat log storage).
 * Enforces owner isolation, status progression (sent -> delivered -> seen),
 * re-edit unseen reset, and automatic disappearing message cleanup.
 */

const DB_NAME = "vartalap_device_store";
const DB_VERSION = 2;
const STORE_NAME = "messages";
const STATUS_RANK = { sent: 1, delivered: 2, seen: 3 };

let dbPromise = null;
const pendingPatchesByMsg = new Map();

const normalizeId = (value) => {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") {
    return (value._id ?? value.id ?? "").toString();
  }
  return value.toString();
};

const toTimestamp = (value) => {
  if (!value) return 0;
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? 0 : ms;
};

const isMessageExpired = (msg) => {
  if (!msg?.disappearAt) return false;
  const ts = new Date(msg.disappearAt).getTime();
  return !Number.isNaN(ts) && ts <= Date.now();
};

const pickHigherStatus = (prevStatus, nextStatus) => {
  const r1 = STATUS_RANK[prevStatus] || 0;
  const r2 = STATUS_RANK[nextStatus] || 0;
  return r2 >= r1 ? nextStatus : prevStatus;
};

const resolveNextStatus = (prevStatus, patchStatus, allowStatusDowngrade) => {
  if (!patchStatus) return prevStatus;
  if (allowStatusDowngrade) return patchStatus;
  return pickHigherStatus(prevStatus, patchStatus);
};

const makeLocalKey = (ownerId, chatType, chatId, msgId) =>
  `${ownerId}_${chatType}_${chatId}_${msgId}`;

const ensureIndexes = (store) => {
  if (!store.indexNames.contains("by_owner")) {
    store.createIndex("by_owner", "ownerId", { unique: false });
  }
  if (!store.indexNames.contains("by_owner_chat")) {
    store.createIndex("by_owner_chat", ["ownerId", "chatType", "chatId"], {
      unique: false,
    });
  }
  if (!store.indexNames.contains("by_owner_msg")) {
    store.createIndex("by_owner_msg", ["ownerId", "_id"], { unique: false });
  }
};

const openDB = () => {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("IndexedDB is not supported in this environment."));
  }
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      const store = db.objectStoreNames.contains(STORE_NAME)
        ? request.transaction?.objectStore(STORE_NAME)
        : db.createObjectStore(STORE_NAME, { keyPath: "localKey" });
      if (store) ensureIndexes(store);
    };

    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      db.onclose = () => {
        dbPromise = null;
      };
      resolve(db);
    };

    request.onerror = () => {
      dbPromise = null;
      reject(request.error || new Error("Failed to open IndexedDB."));
    };

    request.onblocked = () => {
      dbPromise = null;
      reject(new Error("IndexedDB upgrade blocked by another open tab."));
    };
  });

  return dbPromise;
};

const runTransaction = (db, mode, executor) =>
  new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, mode);
    let resultValue;
    let settled = false;

    const fail = (err) => {
      if (settled) return;
      settled = true;
      reject(err instanceof Error ? err : new Error("IndexedDB transaction failed."));
    };

    tx.oncomplete = () => {
      if (settled) return;
      settled = true;
      resolve(resultValue);
    };
    tx.onerror = () => fail(tx.error);
    tx.onabort = () => fail(tx.error || new Error("IndexedDB transaction aborted."));

    executor(
      tx.objectStore(STORE_NAME),
      (val) => {
        resultValue = val;
      },
      fail
    );
  });

const readByIndex = async (indexName, keyRange) => {
  const db = await openDB();
  return runTransaction(db, "readonly", (store, setResult, fail) => {
    const req = store.index(indexName).getAll(keyRange);
    req.onsuccess = () => setResult(req.result || []);
    req.onerror = () => fail(req.error);
  });
};

const deleteLocalKeys = async (localKeys) => {
  if (!localKeys.length) return 0;
  const db = await openDB();
  return runTransaction(db, "readwrite", (store, setResult) => {
    localKeys.forEach((key) => store.delete(key));
    setResult(localKeys.length);
  });
};

const deleteByCursor = async (indexName, keyRange, shouldDelete = () => true) => {
  const db = await openDB();
  return runTransaction(db, "readwrite", (store, setResult, fail) => {
    const req = store.index(indexName).openCursor(keyRange);
    let deleted = 0;

    req.onsuccess = () => {
      const cursor = req.result;
      if (!cursor) {
        setResult(deleted);
        return;
      }
      if (shouldDelete(cursor.value)) {
        cursor.delete();
        deleted += 1;
      }
      cursor.continue();
    };
    req.onerror = () => fail(req.error);
  });
};

const mergeMessageRecords = (prev, msg) => {
  const isNewerEdit = Boolean(
    msg.isEdited && toTimestamp(msg.editedAt) > toTimestamp(prev.editedAt)
  );
  return {
    ...prev,
    ...msg,
    starredBy: msg.starredBy?.length ? msg.starredBy : prev.starredBy || [],
    replyPreview: msg.replyPreview || prev.replyPreview || null,
    isDeletedForEveryone: Boolean(prev.isDeletedForEveryone || msg.isDeletedForEveryone),
    deliveryStatus: resolveNextStatus(prev.deliveryStatus, msg.deliveryStatus, isNewerEdit),
  };
};

const applyPatchDescriptor = (record, { patch, allowStatusDowngrade = false }) => {
  const nextStatus = resolveNextStatus(
    record.deliveryStatus,
    patch.deliveryStatus,
    allowStatusDowngrade
  );
  return {
    ...record,
    ...patch,
    ...(nextStatus ? { deliveryStatus: nextStatus } : {}),
  };
};

const queuePendingPatch = (ownerId, messageId, descriptor) => {
  const key = `${ownerId}_${messageId}`;
  const list = pendingPatchesByMsg.get(key) || [];
  list.push(descriptor);
  pendingPatchesByMsg.set(key, list);
};

export const saveLocalMessages = async (ownerId, messages = []) => {
  const oId = normalizeId(ownerId);
  if (!oId || !Array.isArray(messages) || messages.length === 0) return 0;

  const batched = new Map();
  messages.forEach((raw) => {
    const msgId = normalizeId(raw?._id);
    const chatId = normalizeId(raw?.chatId);
    if (!msgId || !raw?.chatType || !chatId || isMessageExpired(raw)) return;

    const localKey = makeLocalKey(oId, raw.chatType, chatId, msgId);
    const msg = { ...raw, ownerId: oId, chatId, _id: msgId, localKey };
    const existing = batched.get(localKey);
    batched.set(localKey, existing ? mergeMessageRecords(existing, msg) : msg);
  });

  if (batched.size === 0) return 0;
  const db = await openDB();

  return runTransaction(db, "readwrite", (store, setResult, fail) => {
    batched.forEach((msg, localKey) => {
      const req = store.get(localKey);
      req.onsuccess = () => {
        const prev = req.result;
        let nextRecord = prev ? mergeMessageRecords(prev, msg) : msg;
        const pendingKey = `${oId}_${msg._id}`;
        const queued = pendingPatchesByMsg.get(pendingKey);
        if (queued?.length) {
          pendingPatchesByMsg.delete(pendingKey);
          queued.forEach((desc) => {
            nextRecord = applyPatchDescriptor(nextRecord, desc);
          });
        }
        store.put(nextRecord);
      };
      req.onerror = () => fail(req.error);
    });
    setResult(batched.size);
  });
};

export const purgeExpiredDisappearingMessages = async (ownerId) => {
  const oId = normalizeId(ownerId);
  if (!oId) return 0;
  return deleteByCursor("by_owner", IDBKeyRange.only(oId), isMessageExpired);
};

export const getLocalChatMessages = async (ownerId, chatType, chatId) => {
  const oId = normalizeId(ownerId);
  const cId = normalizeId(chatId);
  if (!oId || !chatType || !cId) return [];

  const all = await readByIndex("by_owner_chat", IDBKeyRange.only([oId, chatType, cId]));
  const items = [];
  const expiredKeys = [];

  for (const msg of all) {
    if (isMessageExpired(msg)) {
      if (msg.localKey) expiredKeys.push(msg.localKey);
    } else {
      items.push(msg);
    }
  }

  if (expiredKeys.length > 0) {
    await deleteLocalKeys(expiredKeys).catch(() => {});
  }

  items.sort((a, b) => toTimestamp(a.createdAt) - toTimestamp(b.createdAt));
  return items;
};

export const getLocalLastMessagesMap = async (ownerId) => {
  const oId = normalizeId(ownerId);
  if (!oId) return {};

  const all = await readByIndex("by_owner", IDBKeyRange.only(oId));
  const map = {};
  const expiredKeys = [];

  for (const msg of all) {
    if (isMessageExpired(msg)) {
      if (msg.localKey) expiredKeys.push(msg.localKey);
      continue;
    }
    const key = `${msg.chatType}:${msg.chatId}`;
    const prev = map[key];
    if (!prev || toTimestamp(msg.createdAt) >= toTimestamp(prev.createdAt)) {
      map[key] = msg;
    }
  }

  if (expiredKeys.length > 0) {
    await deleteLocalKeys(expiredKeys).catch(() => {});
  }

  return map;
};

export const patchLocalMessage = async (
  ownerId,
  messageId,
  patch = {},
  { allowStatusDowngrade = false } = {}
) => {
  const oId = normalizeId(ownerId);
  const mId = normalizeId(messageId);
  if (!oId || !mId) return;

  const db = await openDB();
  let matchedCount = 0;

  await runTransaction(db, "readwrite", (store, _setResult, fail) => {
    const req = store.index("by_owner_msg").getAll([oId, mId]);
    req.onsuccess = () => {
      const records = req.result || [];
      matchedCount = records.length;
      records.forEach((record) => {
        store.put(applyPatchDescriptor(record, { patch, allowStatusDowngrade }));
      });
    };
    req.onerror = () => fail(req.error);
  });

  if (matchedCount === 0) {
    queuePendingPatch(oId, mId, { patch, allowStatusDowngrade });
  }
};

const buildPatchForEvent = (ev) => {
  if (ev.eventType === "edit") {
    return {
      patch: {
        content: ev.payload?.content,
        isEdited: true,
        editedAt: ev.payload?.editedAt || new Date().toISOString(),
        deliveryStatus: ev.payload?.deliveryStatus || "delivered",
      },
      allowStatusDowngrade: true,
    };
  }
  if (ev.eventType === "delivered" || ev.eventType === "seen") {
    return { patch: { deliveryStatus: ev.eventType }, allowStatusDowngrade: false };
  }
  if (ev.eventType === "pin") {
    return { patch: { isPinned: Boolean(ev.payload?.isPinned) }, allowStatusDowngrade: false };
  }
  if (ev.eventType === "delete_for_everyone") {
    return {
      patch: {
        isDeletedForEveryone: true,
        isPinned: false,
        content: "This message was deleted",
        mediaUrl: "",
        mediaType: "text",
        fileName: "",
        fileSize: 0,
      },
      allowStatusDowngrade: false,
    };
  }
  return null;
};

export const applyPendingEventsLocally = async (ownerId, events = []) => {
  const oId = normalizeId(ownerId);
  if (!oId || !Array.isArray(events) || events.length === 0) return;

  const scheduledMessages = [];
  const groupedByMsg = new Map();

  for (const ev of events) {
    if (ev?.eventType === "scheduled_sent" && ev.payload?.message) {
      scheduledMessages.push(ev.payload.message);
      continue;
    }
    const mId = normalizeId(ev?.messageId);
    const descriptor = mId ? buildPatchForEvent(ev) : null;
    if (!descriptor) continue;
    const list = groupedByMsg.get(mId) || [];
    list.push(descriptor);
    groupedByMsg.set(mId, list);
  }

  if (scheduledMessages.length > 0) {
    await saveLocalMessages(oId, scheduledMessages);
  }

  if (groupedByMsg.size === 0) return;
  const db = await openDB();

  await runTransaction(db, "readwrite", (store, _setResult, fail) => {
    const index = store.index("by_owner_msg");
    groupedByMsg.forEach((descriptors, mId) => {
      const req = index.getAll([oId, mId]);
      req.onsuccess = () => {
        const records = req.result || [];
        if (records.length === 0) {
          descriptors.forEach((d) => queuePendingPatch(oId, mId, d));
          return;
        }
        records.forEach((record) => {
          let updated = record;
          descriptors.forEach((d) => {
            updated = applyPatchDescriptor(updated, d);
          });
          store.put(updated);
        });
      };
      req.onerror = () => fail(req.error);
    });
  });
};

export const deleteLocalMessages = async (ownerId, messageIds = []) => {
  const oId = normalizeId(ownerId);
  if (!oId || !Array.isArray(messageIds) || messageIds.length === 0) return 0;

  const idSet = new Set(messageIds.map(normalizeId).filter(Boolean));
  if (idSet.size === 0) return 0;

  return deleteByCursor(
    "by_owner",
    IDBKeyRange.only(oId),
    (val) => idSet.has(normalizeId(val?._id)) && !val.isSystemMessage
  );
};

export const clearLocalChatMessages = async (ownerId, chatType, chatId) => {
  const oId = normalizeId(ownerId);
  const cId = normalizeId(chatId);
  if (!oId || !chatType || !cId) return 0;

  return deleteByCursor("by_owner_chat", IDBKeyRange.only([oId, chatType, cId]));
};

export const clearAllLocalDataForUser = async (ownerId) => {
  const oId = normalizeId(ownerId);
  if (!oId) return 0;
  return deleteByCursor("by_owner", IDBKeyRange.only(oId));
};

export const exportLocalBackup = async (ownerId) => {
  const oId = normalizeId(ownerId);
  const base = { app: "Vartalap", version: 1, ownerId: oId, exportedAt: new Date().toISOString() };
  if (!oId) return { ...base, messages: [] };

  const all = await readByIndex("by_owner", IDBKeyRange.only(oId));
  return { ...base, messages: all.filter((m) => !isMessageExpired(m)) };
};

export const importLocalBackup = async (ownerId, backupPayload) => {
  const list = Array.isArray(backupPayload?.messages) ? backupPayload.messages : [];
  if (list.length === 0) return 0;
  return saveLocalMessages(ownerId, list);
};
