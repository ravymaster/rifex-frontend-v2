// src/pages/_app.js
import '@/styles/globals.css';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { getStoredConsent, setStoredConsent } from '@/lib/consent';
import { initMetaPixel, trackPageView } from '@/lib/metaPixel';
import ConsentBanner from '@/components/ConsentBanner';
import DevBanner from '@/components/DevBanner';
import { isDevStage } from '@/lib/environmentPolicy';

export default function App({ Component, pageProps }) {
  const router = useRouter();
  // undefined = todavía no se leyó localStorage (evita el flash del banner
  // para quien ya había decidido); null = leyó y no hay decisión guardada
  // (mostrar banner); 'granted' | 'denied' = decisión ya tomada.
  const [consent, setConsent] = useState(undefined);

  useEffect(() => {
    setConsent(getStoredConsent());
  }, []);

  // Meta Pixel solo se carga/inicializa si hay consentimiento explícito.
  // PageView: uno al entrar (cuando el consentimiento ya está 'granted')
  // y exactamente uno más por cada navegación interna de Next.js —
  // routeChangeComplete no dispara en el mount inicial, así que nunca se
  // duplica con el PageView inicial de acá arriba.
  useEffect(() => {
    if (consent !== 'granted') return;
    initMetaPixel();
    trackPageView();

    const onRouteChangeComplete = () => trackPageView();
    router.events.on('routeChangeComplete', onRouteChangeComplete);
    return () => router.events.off('routeChangeComplete', onRouteChangeComplete);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [consent]);

  function handleAccept() {
    setStoredConsent('granted');
    setConsent('granted');
  }
  function handleReject() {
    setStoredConsent('denied');
    setConsent('denied');
  }

  // Si la página define un layout propio, úsalo; si no, renderiza tal cual.
  const getLayout = Component.getLayout || ((page) => page);
  return (
    <>
      {getLayout(<Component {...pageProps} />)}
      {consent === null && <ConsentBanner onAccept={handleAccept} onReject={handleReject} />}
      {isDevStage() && <DevBanner />}
    </>
  );
}
