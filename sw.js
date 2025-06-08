// OKRトラッカー Service Worker
const CACHE_NAME = 'okr-tracker-v1.0.0';
const urlsToCache = [
  '/',
  '/index.html',
  '/app.js',
  '/manifest.json',
  '/assets/icon-192x192.png',
  '/assets/icon-512x512.png',
  '/assets/favicon.ico',
  '/privacy.html',
  '/terms.html',
  '/contact.html',
  'https://cdn.tailwindcss.com',
  'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/3.9.1/chart.min.js'
];

// インストール時のキャッシュ処理
self.addEventListener('install', (event) => {
  console.log('Service Worker: Install');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Service Worker: Caching files');
        return cache.addAll(urlsToCache);
      })
      .then(() => {
        console.log('Service Worker: Cache complete');
        return self.skipWaiting();
      })
      .catch((error) => {
        console.log('Service Worker: Cache failed', error);
      })
  );
});

// アクティベート時の古いキャッシュ削除
self.addEventListener('activate', (event) => {
  console.log('Service Worker: Activate');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('Service Worker: Deleting old cache', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      console.log('Service Worker: Claiming clients');
      return self.clients.claim();
    })
  );
});

// フェッチイベント - キャッシュファーストストラテジー
self.addEventListener('fetch', (event) => {
  // chrome-extensionなど、http/https以外のリクエストは無視
  if (!event.request.url.startsWith('http')) {
    return;
  }

  // Google Analytics やその他の外部リクエストはキャッシュしない
  if (event.request.url.includes('google-analytics.com') || 
      event.request.url.includes('googletagmanager.com') ||
      event.request.url.includes('doubleclick.net')) {
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // キャッシュにあればそれを返す
        if (response) {
          console.log('Service Worker: Serving from cache', event.request.url);
          return response;
        }

        // キャッシュになければネットワークから取得
        console.log('Service Worker: Fetching from network', event.request.url);
        return fetch(event.request).then((response) => {
          // レスポンスが有効でない場合はそのまま返す
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }

          // レスポンスをクローンしてキャッシュに保存
          const responseToCache = response.clone();
          caches.open(CACHE_NAME)
            .then((cache) => {
              cache.put(event.request, responseToCache);
            });

          return response;
        }).catch(() => {
          // ネットワークエラーの場合、オフラインページを返す
          if (event.request.destination === 'document') {
            return caches.match('/index.html');
          }
        });
      })
  );
});

// バックグラウンド同期（将来的な機能拡張用）
self.addEventListener('sync', (event) => {
  console.log('Service Worker: Background sync', event.tag);
  
  if (event.tag === 'okr-data-sync') {
    event.waitUntil(
      // 将来的にサーバー同期機能を実装する場合のプレースホルダー
      syncOKRData()
    );
  }
});

// プッシュ通知（将来的な機能拡張用）
self.addEventListener('push', (event) => {
  console.log('Service Worker: Push received');
  
  const options = {
    body: event.data ? event.data.text() : 'OKRの進捗を更新しましょう！',
    icon: '/assets/icon-192x192.png',
    badge: '/assets/icon-72x72.png',
    vibrate: [200, 100, 200],
    tag: 'okr-reminder',
    requireInteraction: true,
    actions: [
      {
        action: 'update-progress',
        title: '進捗更新',
        icon: '/assets/icon-192x192.png'
      },
      {
        action: 'dismiss',
        title: '後で',
        icon: '/assets/icon-192x192.png'
      }
    ]
  };

  event.waitUntil(
    self.registration.showNotification('OKRトラッカー', options)
  );
});

// 通知クリック処理
self.addEventListener('notificationclick', (event) => {
  console.log('Service Worker: Notification click', event.action);
  
  event.notification.close();

  if (event.action === 'update-progress') {
    event.waitUntil(
      clients.openWindow('/?action=update-progress')
    );
  } else if (event.action === 'dismiss') {
    // 何もしない
  } else {
    event.waitUntil(
      clients.openWindow('/')
    );
  }
});

// メッセージ処理
self.addEventListener('message', (event) => {
  console.log('Service Worker: Message received', event.data);
  
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'GET_VERSION') {
    event.ports[0].postMessage({version: CACHE_NAME});
  }
});

// ヘルパー関数
async function syncOKRData() {
  try {
    // 将来的にサーバー同期を実装する場合のプレースホルダー
    console.log('Service Worker: Syncing OKR data');
    
    // IndexedDBからデータを取得
    // サーバーにデータを送信
    // 結果を処理
    
    return Promise.resolve();
  } catch (error) {
    console.error('Service Worker: Sync failed', error);
    throw error;
  }
}

// エラーハンドリング
self.addEventListener('error', (event) => {
  console.error('Service Worker: Error', event.error);
});

self.addEventListener('unhandledrejection', (event) => {
  console.error('Service Worker: Unhandled promise rejection', event.reason);
});