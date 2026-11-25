// src/pages/c/[token].jsx
// Enlace compartible neutral de Rifex: /c/<token>. No contiene título,
// slug, id interno ni datos del contenido. La resolución completa vive en
// el servidor (src/lib/raffleShareAccess.js#resolveShareLinkPage):
//   - deshabilitado (`off`) → 410 neutro;
//   - `gated` sin autorización → puerta neutra (misma respuesta para
//     personas y crawlers);
//   - con autorización o en `on` → redirección temporal a la ficha.
import { resolveShareLinkPage } from '../../lib/raffleShareAccess';
import RaffleGonePage from '../../components/RaffleGonePage';
import SharedAccessGate from '../../components/SharedAccessGate';

export async function getServerSideProps({ params, req, res }) {
  return resolveShareLinkPage({ req, res }, String(params?.token || ''));
}

export default function SharedLinkPage(props) {
  if (props.raffleGone) return <RaffleGonePage />;
  return <SharedAccessGate {...props.sharedGate} />;
}
