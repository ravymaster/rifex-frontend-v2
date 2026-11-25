// src/lib/paymentEngine/engine.js
// Punto de entrada conceptual: Product -> Payment Engine -> Country Router
// -> Provider Registry -> Adapter. Solo arma el armazón — ningún endpoint
// financiero actual lo llama todavía (eso es P2). No reemplaza nada.
import { routeSellerToProvider } from "./countryRouter";
import { getAdapter } from "./providerRegistry";

export async function resolveAdapterForSeller(sellerId, capability) {
  const routed = await routeSellerToProvider(sellerId, capability);
  if (!routed.ok) return routed;

  const adapter = getAdapter(routed.country, routed.provider);
  if (!adapter) {
    return { ok: false, reason: "adapter_not_found", country: routed.country, provider: routed.provider };
  }

  return { ok: true, country: routed.country, provider: routed.provider, currency: routed.currency, adapter };
}
