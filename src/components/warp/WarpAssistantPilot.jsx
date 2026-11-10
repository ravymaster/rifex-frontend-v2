// src/components/warp/WarpAssistantPilot.jsx
// Widget flotante del asistente de Warp, solo para la página piloto local.
// Habla únicamente con las rutas del propio sitio; nunca recibe la key.
import { useEffect } from 'react';
import { PILOT_LINK_POLICY } from '@/lib/warp/pilotLinks';

export default function WarpAssistantPilot() {
  useEffect(() => {
    let widget = null;
    let cancelled = false;
    import('@warp-ai/assistant').then(({ createWarpWidgetGlobal }) => {
      if (cancelled) return;
      widget = createWarpWidgetGlobal();
      widget.init({
        title: 'Asistente Rifex (piloto)',
        endpoint: '/api/warp/chat',
        actionsEndpoint: '/api/warp/chat/actions',
        links: { internalHosts: [...PILOT_LINK_POLICY.internalHosts], allowedHosts: [...PILOT_LINK_POLICY.allowedHosts] },
      });
    });
    return () => {
      cancelled = true;
      if (widget) widget.destroy();
    };
  }, []);
  return null;
}
