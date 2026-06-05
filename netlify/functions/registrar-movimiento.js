exports.handler = async function(event) {
  try {
    if (event.httpMethod !== 'POST') {
      return { statusCode: 405, body: 'Método no permitido' };
    }

    const { userId, movimiento } = JSON.parse(event.body);

    const headers = {
      'Content-Type': 'application/json',
      'apikey': process.env.SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}`
    };

    // Verificar plan
    const perfilRes = await fetch(
      `${process.env.SUPABASE_URL}/rest/v1/perfiles?id=eq.${userId}&select=plan,plan_vence,organizacion_id`,
      { headers }
    );
    const perfiles = await perfilRes.json();
    const perfil = perfiles[0];
    const plan = perfil?.plan || 'free';
    const vence = perfil?.plan_vence ? new Date(perfil.plan_vence) : null;
    const esPremium = plan === 'premium' && vence && vence > new Date();

    if (!esPremium) {
      const hoy = new Date();
      const inicioMes = `${hoy.getFullYear()}-${String(hoy.getMonth()+1).padStart(2,'0')}-01`;
      const finMes = new Date(hoy.getFullYear(), hoy.getMonth()+1, 0).toISOString().split('T')[0];
      const conteoRes = await fetch(
        `${process.env.SUPABASE_URL}/rest/v1/movimientos?user_id=eq.${userId}&fecha=gte.${inicioMes}&fecha=lte.${finMes}&select=id`,
        { headers: { ...headers, 'Prefer': 'count=exact' } }
      );
      const conteo = parseInt(conteoRes.headers.get('content-range')?.split('/')[1] || '0');
      if (conteo >= 600) {
        return { statusCode: 403, body: JSON.stringify({ error: 'limite_alcanzado' }) };
      }
    }

    // Insertar movimiento
    const { esProducto, productoId, ...movimientoLimpio } = movimiento;

const insertRes = await fetch(
  `${process.env.SUPABASE_URL}/rest/v1/movimientos`,
  {
    method: 'POST',
    headers: { ...headers, 'Prefer': 'return=representation' },
    body: JSON.stringify(movimientoLimpio)
  }
);
    const data = await insertRes.json();
console.log('Insert status:', insertRes.status);
console.log('Insert response:', JSON.stringify(data));

    // Descontar stock si corresponde
    if (movimiento.esProducto && movimiento.productoId && movimiento.cantidad > 0 && movimiento.tipo === 'ingreso') {
      // Obtener stock actual
      const prodRes = await fetch(
        `${process.env.SUPABASE_URL}/rest/v1/productos?id=eq.${movimiento.productoId}&select=stock_actual,stock_minimo,nombre`,
        { headers }
      );
      const productos = await prodRes.json();
      const producto = productos[0];

      if (producto) {
        const nuevoStock = Math.max(0, producto.stock_actual - movimiento.cantidad);

        // Actualizar stock
        await fetch(
          `${process.env.SUPABASE_URL}/rest/v1/productos?id=eq.${movimiento.productoId}`,
          {
            method: 'PATCH',
            headers: { ...headers, 'Prefer': 'return=minimal' },
            body: JSON.stringify({ stock_actual: nuevoStock })
          }
        );

        // Registrar movimiento de stock
        await fetch(
          `${process.env.SUPABASE_URL}/rest/v1/movimientos_stock`,
          {
            method: 'POST',
            headers: { ...headers, 'Prefer': 'return=minimal' },
            body: JSON.stringify({
              producto_id: movimiento.productoId,
              organizacion_id: perfil?.organizacion_id,
              tipo: 'salida',
              cantidad: movimiento.cantidad,
              detalle: `Venta: ${movimiento.detalle || movimiento.categoria}`,
              fecha: movimiento.fecha,
              user_id: userId
            })
          }
        );
      }
    }

    return { statusCode: 200, body: JSON.stringify(data[0]) };

  } catch (err) {
    console.error('ERROR EN FUNCTION:', err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};