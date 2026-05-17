exports.handler = async function(event) {
  try {
    if (event.httpMethod !== 'POST') {
      return { statusCode: 405, body: 'Método no permitido' };
    }

    const { userId, movimiento } = JSON.parse(event.body);

    const perfilRes = await fetch(
      `${process.env.SUPABASE_URL}/rest/v1/perfiles?id=eq.${userId}&select=plan,plan_vence`,
      {
        headers: {
          'apikey': process.env.SUPABASE_SERVICE_KEY,
          'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}`
        }
      }
    );
    const perfiles = await perfilRes.json();
    const perfil = perfiles[0];
    const plan = perfil?.plan || 'free';
    const vence = perfil?.plan_vence ? new Date(perfil.plan_vence) : null;
    const esPremium = plan === 'premium' && vence && vence > new Date();

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

  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};