/* Plantão do Suporte — service worker (v6.2)
   Só push e clique em notificação. NÃO faz cache: o painel sempre carrega do servidor. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) { d = { body: e.data ? e.data.text() : '' }; }
  const titulo = d.title || 'Plantão do Suporte';
  const opts = {
    body: d.body || '',
    icon: 'icone-192.png',
    badge: 'icone-192.png',
    tag: d.tag || ('pop-' + Date.now()),
    renotify: true,
    requireInteraction: !!d.urgente,
    data: { url: d.url || './?aba=agenda', id: d.id || null },
    actions: d.id ? [{ action: 'abrir', title: 'Abrir tarefa' }] : []
  };
  e.waitUntil(self.registration.showNotification(titulo, opts));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || './?aba=agenda', self.location.href).href;
  const id = e.notification.data && e.notification.data.id;
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const aberta = wins.find(w => w.url.startsWith(self.registration.scope));
    if (aberta) {
      await aberta.focus();
      if (id) aberta.postMessage({ tipo: 'abrir-ev', id });
      return;
    }
    await self.clients.openWindow(url);
  })());
});
