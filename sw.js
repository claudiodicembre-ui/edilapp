// =====================================================================
//  EdilApp - service worker
//
//  Fa tre cose:
//   1. tiene in cache il codice dell'app, cosi' dalla seconda apertura
//      parte subito invece di riscaricare qualche megabyte;
//   2. la fa aprire anche senza rete, che e' il presupposto di tutta la
//      parte offline (timbrature e foto in coda);
//   3. soddisfa i requisiti perche' il telefono proponga "Installa app".
//
//  Le versioni recenti di Flutter non generano piu' un service worker
//  funzionante: ne creano uno che si disinstalla da solo. Questo lo
//  scriviamo noi.
// =====================================================================

const VERSIONE = 'edilapp-v2';

// Il minimo perche' l'app si apra anche partendo da spenta e senza rete.
const ESSENZIALI = [
  './',
  './index.html',
  './flutter_bootstrap.js',
  './manifest.json',
  './favicon.png',
  './apple-touch-icon.png',
  './icons/Icon-192.png',
  './icons/Icon-512.png',
];

self.addEventListener('install', (evento) => {
  evento.waitUntil((async () => {
    const cache = await caches.open(VERSIONE);
    // 'reload' evita di riempire la cache con roba gia' vecchia.
    await Promise.all(ESSENZIALI.map(async (indirizzo) => {
      try {
        await cache.add(new Request(indirizzo, { cache: 'reload' }));
      } catch (e) {
        // Un file mancante non deve far fallire tutta l'installazione.
      }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil((async () => {
    const nomi = await caches.keys();
    await Promise.all(
      nomi.filter((n) => n !== VERSIONE).map((n) => caches.delete(n)),
    );
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (evento) => {
  const richiesta = evento.request;
  if (richiesta.method !== 'GET') return;

  let indirizzo;
  try {
    indirizzo = new URL(richiesta.url);
  } catch (e) {
    return;
  }

  // I dati veri non si mettono mai in cache: timbrature, lavori e foto
  // devono essere quelli del momento, non una copia vecchia.
  if (indirizzo.hostname.endsWith('.supabase.co') ||
      indirizzo.hostname.endsWith('.supabase.in')) {
    return;
  }

  // La pagina: prima la rete, cosi' gli aggiornamenti arrivano subito;
  // se la rete manca, la copia salvata.
  if (richiesta.mode === 'navigate') {
    evento.respondWith((async () => {
      try {
        const risposta = await fetch(richiesta);
        const cache = await caches.open(VERSIONE);
        cache.put('./index.html', risposta.clone());
        return risposta;
      } catch (e) {
        const cache = await caches.open(VERSIONE);
        const salvata = await cache.match('./index.html');
        return salvata || Response.error();
      }
    })());
    return;
  }

  // Tutto il resto (codice, motore grafico, icone, caratteri): si usa
  // subito la copia salvata e intanto si aggiorna in silenzio.
  evento.respondWith((async () => {
    const cache = await caches.open(VERSIONE);
    const salvata = await cache.match(richiesta);

    const dallaRete = fetch(richiesta).then((risposta) => {
      if (risposta && (risposta.status === 200 || risposta.type === 'opaque')) {
        cache.put(richiesta, risposta.clone()).catch(() => {});
      }
      return risposta;
    }).catch(() => undefined);

    if (salvata) return salvata;
    const risposta = await dallaRete;
    return risposta || Response.error();
  })());
});
