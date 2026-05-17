export async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Método no permitido' };
  }

  const { userId, movimiento } = JSON.parse(event.body);

  // 1. Leer plan del usuario desde Supabase
  const perfilRes = await fetch(
    `${process.env.SUPABASE_URL}/rest/v1/perfiles?id=eq.${userId}&select=plan,plan_vence`,
    {
      headers: {
        'apikey': process.env.SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}`
      }
    }
  );
  const [perfil] = await perfilRes.json();
  const plan = perfil?.plan || 'free';
  const vence = perfil?.plan_vence ? new Date(perfil.plan_vence) : null;
  const esPremium = plan === 'premium' && vence && vence > new Date();

  // 2. Si es free, contar movimientos del mes actual en Supabase
  if (!esPremium) {
    const hoy = new Date();
    const inicioMes = `${hoy.getFullYear()}-${String(hoy.getMonth()+1).padStart(2,'0')}-01`;
    const finMes = new Date(hoy.getFullYear(), hoy.getMonth()+1, 0)
      .toISOString().split('T')[0];

    const conteoRes = await fetch(
      `${process.env.SUPABASE_URL}/rest/v1/movimientos?user_id=eq.${userId}&fecha=gte.${inicioMes}&fecha=lte.${finMes}&select=id`,
      {
        headers: {
          'apikey': process.env.SUPABASE_SERVICE_KEY,
          'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
          'Prefer': 'count=exact'
        }
      }
    );
    const conteo = parseInt(conteoRes.headers.get('content-range')?.split('/')[1] || '0');

    if (conteo >= 600) {
      return {
        statusCode: 403,
        body: JSON.stringify({ error: 'limite_alcanzado' })
      };
    }
  }

  // 3. Insertar el movimiento
  const insertRes = await fetch(
    `${process.env.SUPABASE_URL}/rest/v1/movimientos`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': process.env.SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
        'Prefer': 'return=representation'
      },
      body: JSON.stringify(movimiento)
    }
  );
  const data = await insertRes.json();

  return {
    statusCode: 200,
    body: JSON.stringify(data[0])
  };
}