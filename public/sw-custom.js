/**
 * Custom Service Worker for CompTrails
 * 
 * Extends next-pwa functionality with Background Sync API support
 * for emergency sync operations when tabs are closed.
 */

// Import Workbox libraries for Background Sync
importScripts('https://storage.googleapis.com/workbox-cdn/releases/7.0.0/workbox-sw.js');

const { BackgroundSync } = workbox.backgroundSync;
const { Queue } = workbox.backgroundSync;

// Background Sync configuration
const SYNC_QUEUE_NAME = 'compensation-sync-queue';
const EMERGENCY_SYNC_TAG = 'emergency-compensation-sync';
const MAX_RETENTION_TIME = 24 * 60; // 24 hours in minutes

// Create background sync queue
const bgSyncQueue = new Queue(SYNC_QUEUE_NAME, {
  onSync: async ({ queue }) => {
    console.log('[SW] Processing background sync queue:', queue.name);
    
    let entry;
    while ((entry = await queue.shiftRequest())) {
      try {
        console.log('[SW] Processing sync request:', entry.request.url);
        const response = await fetch(entry.request);
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        console.log('[SW] Sync request successful:', entry.request.url);
        
        // Notify main thread of successful sync
        await self.registration.sync.register('sync-success');
        
      } catch (error) {
        console.error('[SW] Sync request failed:', error);
        
        // Re-add to queue for retry if it's a network error
        if (error.name === 'TypeError' && error.message.includes('Failed to fetch')) {
          await queue.unshiftRequest(entry);
          console.log('[SW] Re-queued failed request for retry');
        }
        
        throw error;
      }
    }
  },
});

// Background Sync event listener
self.addEventListener('sync', (event) => {
  console.log('[SW] Background sync event triggered:', event.tag);
  
  if (event.tag === EMERGENCY_SYNC_TAG) {
    event.waitUntil(performEmergencyBackgroundSync());
  } else if (event.tag === 'sync-success') {
    event.waitUntil(notifyMainThread('sync-completed'));
  } else if (event.tag.startsWith('compensation-sync')) {
    event.waitUntil(processCompensationSync(event.tag));
  }
});

/**
 * Perform emergency background sync
 */
async function performEmergencyBackgroundSync() {
  console.log('[SW] Performing emergency background sync');
  
  try {
    // Get pending sync data from IndexedDB
    const syncData = await getPendingSyncData();
    
    if (!syncData || syncData.length === 0) {
      console.log('[SW] No pending sync data found');
      return;
    }
    
    // Process sync data
    const endpoint = '/api/emergency-sync';
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(syncData),
    });
    
    if (response.ok) {
      console.log('[SW] Emergency background sync successful');
      await notifyMainThread('emergency-sync-success');
      await clearProcessedSyncData(syncData);
    } else {
      throw new Error(`Emergency sync failed: ${response.status}`);
    }
    
  } catch (error) {
    console.error('[SW] Emergency background sync failed:', error);
    await notifyMainThread('emergency-sync-failed', { error: error.message });
  }
}

/**
 * Process compensation sync operations
 */
async function processCompensationSync(tag) {
  console.log('[SW] Processing compensation sync:', tag);
  
  try {
    // Extract operation from tag (e.g., 'compensation-sync-create-123')
    const parts = tag.split('-');
    const operation = parts[2]; // create, update, delete
    const recordId = parts[3];
    
    const syncData = await getSpecificSyncData(operation, recordId);
    
    if (syncData) {
      const endpoint = '/api/emergency-sync';
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify([syncData]),
      });
      
      if (response.ok) {
        console.log('[SW] Compensation sync successful:', tag);
        await clearSpecificSyncData(operation, recordId);
        await notifyMainThread('sync-success', { tag, operation, recordId });
      } else {
        throw new Error(`Sync failed: ${response.status}`);
      }
    }
    
  } catch (error) {
    console.error('[SW] Compensation sync failed:', error);
    await notifyMainThread('sync-failed', { tag, error: error.message });
  }
}

/**
 * Get pending sync data from IndexedDB
 * This is a simplified version - in practice, you'd use the actual IndexedDB structure
 */
async function getPendingSyncData() {
  try {
    // Open IndexedDB connection
    const request = indexedDB.open('CompTrailsDB', 1);
    
    return new Promise((resolve, reject) => {
      request.onerror = () => reject(request.error);
      
      request.onsuccess = () => {
        const db = request.result;
        
        if (!db.objectStoreNames.contains('pendingSync')) {
          resolve([]);
          return;
        }
        
        const transaction = db.transaction(['pendingSync'], 'readonly');
        const store = transaction.objectStore('pendingSync');
        const getAllRequest = store.getAll();
        
        getAllRequest.onsuccess = () => {
          const allData = getAllRequest.result;
          const pendingData = allData
            .filter(item => item.status === 'pending')
            .slice(0, 10) // Limit to 10 items for background sync
            .map(item => ({
              id: item.id,
              type: 'pending_sync',
              operation: item.operation,
              recordId: item.recordId,
              data: item.data,
              tableName: item.tableName,
            }));
          
          resolve(pendingData);
        };
        
        getAllRequest.onerror = () => reject(getAllRequest.error);
      };
    });
    
  } catch (error) {
    console.error('[SW] Error getting pending sync data:', error);
    return [];
  }
}

/**
 * Get specific sync data by operation and record ID
 */
async function getSpecificSyncData(operation, recordId) {
  try {
    const request = indexedDB.open('CompTrailsDB', 1);
    
    return new Promise((resolve, reject) => {
      request.onerror = () => reject(request.error);
      
      request.onsuccess = () => {
        const db = request.result;
        
        if (!db.objectStoreNames.contains('pendingSync')) {
          resolve(null);
          return;
        }
        
        const transaction = db.transaction(['pendingSync'], 'readonly');
        const store = transaction.objectStore('pendingSync');
        const getAllRequest = store.getAll();
        
        getAllRequest.onsuccess = () => {
          const allData = getAllRequest.result;
          const syncItem = allData.find(item => 
            item.operation === operation && 
            item.recordId === recordId && 
            item.status === 'pending'
          );
          
          if (syncItem) {
            resolve({
              id: syncItem.id,
              type: 'pending_sync',
              operation: syncItem.operation,
              recordId: syncItem.recordId,
              data: syncItem.data,
              tableName: syncItem.tableName,
            });
          } else {
            resolve(null);
          }
        };
        
        getAllRequest.onerror = () => reject(getAllRequest.error);
      };
    });
    
  } catch (error) {
    console.error('[SW] Error getting specific sync data:', error);
    return null;
  }
}

/**
 * Clear processed sync data from IndexedDB
 */
async function clearProcessedSyncData(syncData) {
  try {
    const request = indexedDB.open('CompTrailsDB', 1);
    
    return new Promise((resolve, reject) => {
      request.onerror = () => reject(request.error);
      
      request.onsuccess = () => {
        const db = request.result;
        
        if (!db.objectStoreNames.contains('pendingSync')) {
          resolve();
          return;
        }
        
        const transaction = db.transaction(['pendingSync'], 'readwrite');
        const store = transaction.objectStore('pendingSync');
        
        const promises = syncData.map(item => {
          return new Promise((itemResolve, itemReject) => {
            const deleteRequest = store.delete(item.id);
            deleteRequest.onsuccess = () => itemResolve();
            deleteRequest.onerror = () => itemReject(deleteRequest.error);
          });
        });
        
        Promise.all(promises)
          .then(() => resolve())
          .catch(reject);
      };
    });
    
  } catch (error) {
    console.error('[SW] Error clearing processed sync data:', error);
  }
}

/**
 * Clear specific sync data by operation and record ID
 */
async function clearSpecificSyncData(operation, recordId) {
  try {
    const request = indexedDB.open('CompTrailsDB', 1);
    
    return new Promise((resolve, reject) => {
      request.onerror = () => reject(request.error);
      
      request.onsuccess = () => {
        const db = request.result;
        
        if (!db.objectStoreNames.contains('pendingSync')) {
          resolve();
          return;
        }
        
        const transaction = db.transaction(['pendingSync'], 'readwrite');
        const store = transaction.objectStore('pendingSync');
        const getAllRequest = store.getAll();
        
        getAllRequest.onsuccess = () => {
          const allData = getAllRequest.result;
          const syncItem = allData.find(item => 
            item.operation === operation && 
            item.recordId === recordId
          );
          
          if (syncItem) {
            const deleteRequest = store.delete(syncItem.id);
            deleteRequest.onsuccess = () => resolve();
            deleteRequest.onerror = () => reject(deleteRequest.error);
          } else {
            resolve();
          }
        };
        
        getAllRequest.onerror = () => reject(getAllRequest.error);
      };
    });
    
  } catch (error) {
    console.error('[SW] Error clearing specific sync data:', error);
  }
}

/**
 * Notify main thread of sync events
 */
async function notifyMainThread(type, data = {}) {
  try {
    const clients = await self.clients.matchAll({
      includeUncontrolled: true,
      type: 'window'
    });
    
    const message = {
      type: 'sw-background-sync',
      payload: {
        event: type,
        ...data,
        timestamp: Date.now(),
      }
    };
    
    clients.forEach(client => {
      client.postMessage(message);
    });
    
    console.log('[SW] Notified main thread:', type, data);
    
  } catch (error) {
    console.error('[SW] Error notifying main thread:', error);
  }
}

/**
 * Handle failed requests by adding them to background sync queue
 */
self.addEventListener('fetch', (event) => {
  // Only handle emergency sync requests
  if (event.request.url.includes('/api/emergency-sync')) {
    event.respondWith(
      fetch(event.request)
        .catch((error) => {
          console.log('[SW] Emergency sync request failed, adding to queue:', error);
          
          // Add to background sync queue
          return bgSyncQueue.pushRequest({ request: event.request })
            .then(() => {
              // Register for background sync
              return self.registration.sync.register(EMERGENCY_SYNC_TAG);
            })
            .then(() => {
              // Return a response indicating the request was queued
              return new Response(
                JSON.stringify({
                  success: false,
                  queued: true,
                  message: 'Request queued for background sync'
                }),
                {
                  status: 202,
                  headers: { 'Content-Type': 'application/json' }
                }
              );
            });
        })
    );
  }
});

/**
 * Handle messages from main thread
 */
self.addEventListener('message', (event) => {
  console.log('[SW] Received message:', event.data);
  
  if (event.data && event.data.type === 'REGISTER_BACKGROUND_SYNC') {
    const { tag, operation, recordId } = event.data;
    
    // Register background sync for specific operation
    self.registration.sync.register(tag)
      .then(() => {
        console.log('[SW] Background sync registered:', tag);
        return notifyMainThread('background-sync-registered', { tag, operation, recordId });
      })
      .catch((error) => {
        console.error('[SW] Background sync registration failed:', error);
        return notifyMainThread('background-sync-registration-failed', { 
          tag, 
          operation, 
          recordId, 
          error: error.message 
        });
      });
  }
});

console.log('[SW] Custom service worker loaded with Background Sync support');