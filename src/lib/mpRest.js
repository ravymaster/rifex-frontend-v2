export async function getMPUser(accessToken) {
  const r = await fetch('https://api.mercadopago.com/users/me', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await r.json();
  if (!r.ok) throw data;
  return data; // { id: <collector_id>, ... }
}

export async function getPayment(paymentId, accessToken) {
  const r = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await r.json();
  if (!r.ok) throw data;
  return data;
}
