/* Plantão do Suporte — service worker de avisos push (prazo de tarefas) */
self.addEventListener('install', e => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('push', e => {
  let dados = { title: '⏰ Aviso do Plantão', body: 'Você tem um prazo chegando.' };
  try { dados = e.data.json(); } catch (err) {}
  e.waitUntil(self.registration.showNotification(dados.title, {
    body: dados.body,
    icon: 'icone-192.png',
    badge: 'icone-192.png',
    tag: dados.tag || 'plantao-prazo',
    renotify: true,
    data: { url: self.registration.scope + '?aba=agenda' }
  }));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || self.registration.scope;
  e.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(lista => {
    for (const c of lista) { if (c.url.indexOf(self.registration.scope) === 0 && 'focus' in c) return c.focus(); }
    return clients.openWindow(url);
  }));
});
