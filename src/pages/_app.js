// src/pages/_app.js
import '@/styles/globals.css';

export default function App({ Component, pageProps }) {
  // Si la página define un layout propio, úsalo; si no, renderiza tal cual.
  const getLayout = Component.getLayout || ((page) => page);
  return getLayout(<Component {...pageProps} />);
}
