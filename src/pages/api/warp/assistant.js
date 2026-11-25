// src/pages/api/warp/assistant.js
// Estado del asistente para el botón global: { enabled: boolean }
// (src/lib/warp/assistantPilot.js). Nunca expone la URL de Warp ni la key.
import { createAssistantStatusRoute } from '@/lib/warp/assistantPilot';

export default createAssistantStatusRoute();
