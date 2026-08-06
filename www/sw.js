// Service worker: o app shell (HTML/JS/CSS) de propósito NÃO é cacheado —
// muda com frequência (deploys quase diários) e cache agressivo aqui geraria
// tela travada em versão antiga pro usuário. Sempre busca da rede.
//
// Fotos do Supabase Storage são a exceção: cada upload gera um nome de
// arquivo novo (UUID aleatório, nunca sobrescreve), então uma URL de foto
// nunca muda de conteúdo — cache-first é seguro pra sempre. Isso existe
// porque o Supabase não está honrando o cache-control que a gente manda no
// upload (confirmado via curl: header vem "no-cache" mesmo com
// cacheControl=31536000 setado), então sem isso aqui o app baixa a mesma
// foto de novo a cada tela — era a causa real da demora reportada em teste
// real no celular (categorias, "ver todos" prestadores, avatares no chat).
const IMAGE_CACHE = 'nexserv-images-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('nexserv-images-') && k !== IMAGE_CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const isSupabaseImage = request.method === 'GET' && request.url.includes('.supabase.co/storage/');
  if (!isSupabaseImage) {
    event.respondWith(fetch(request));
    return;
  }
  event.respondWith((async () => {
    const cache = await caches.open(IMAGE_CACHE);
    const cached = await cache.match(request);
    if (cached) return cached;
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  })());
});
