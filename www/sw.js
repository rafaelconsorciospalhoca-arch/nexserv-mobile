// Service worker mínimo — só existe pra satisfazer o critério de instalação
// do PWA (precisa ter um fetch handler registrado). De propósito NÃO faz
// cache de nada: o app muda com frequência (deploys quase diários) e cache
// agressivo aqui geraria tela travada em versão antiga pro usuário. Sempre
// busca da rede.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request));
});
