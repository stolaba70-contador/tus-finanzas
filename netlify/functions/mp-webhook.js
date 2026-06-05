exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  const payload = JSON.parse(event.body || '{}');

  // Solo procesamos notificaciones de pagos
  if (payload.type !== 'payment') {
    return { statusCode: 200, body: 'Ignored' };
  }

  const paymentId = payload.data?.id;
  if (!paymentId) return { statusCode: 400, body: 'No payment ID' };

  // Consultar detalles del pago a MP
  const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
    headers: { Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}` }
  });
  const pago = await mpRes.json();

  console.log('Pago recibido:', JSON.stringify(pago));

  if (pago.status !== 'approved') {
    return { statusCode: 200, body: 'Payment not approved, skipped' };
  }

  const esIngreso = pago.transaction_amount > 0;

  const movimiento = {
    descripcion: pago.description || `Pago MP #${paymentId}`,
    monto: Math.abs(pago.transaction_amount),
    tipo: esIngreso ? 'ingreso' : 'egreso',
    categoria: 'MercadoPago',
    fecha: pago.date_approved?.split('T')[0],
    origen: 'mercadopago',
    referencia_externa: String(paymentId),
    medio: 'MercadoPago'
  };

  const headers = {
    'Content-Type': 'application/json',
    'apikey': process.env.SUPABASE_SERVICE_KEY,
    'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}`
  };

  // Evitar duplicados
  const checkRes = await fetch(
    `${process.env.SUPABASE_URL}/rest/v1/movimientos?referencia_externa=eq.${paymentId}&select=id`,
    { headers }
  );
  const existing = await checkRes.json();
  if (existing.length > 0) {
    return { statusCode: 200, body: 'Already registered' };
  }

  const insertRes = await fetch(
    `${process.env.SUPABASE_URL}/rest/v1/movimientos`,
    {
      method: 'POST',
      headers: { ...headers, 'Prefer': 'return=minimal' },
      body: JSON.stringify(movimiento)
    }
  );

  console.log('Insert status:', insertRes.status);

  return { statusCode: 200, body: 'OK' };
};