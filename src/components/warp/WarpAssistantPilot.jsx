// src/components/warp/WarpAssistantPilot.jsx
// Widget flotante del asistente de Warp, solo para la página piloto local.
// Habla únicamente con las rutas del propio sitio; nunca recibe la key.
import { useEffect } from 'react';

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
      });
    });
    return () => {
      cancelled = true;
      if (widget) widget.destroy();
    };
  }, []);
  return null;
}
