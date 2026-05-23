exports.handler = async function(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Método no permitido' }) };
  }

  try {
    const { accion, adminId, datos } = JSON.parse(event.body);

    // Verificar que quien llama es admin
    const perfilRes = await fetch(
      `${process.env.SUPABASE_URL}/rest/v1/perfiles?id=eq.${adminId}&select=rol,organizacion_id`,
      {
        headers: {
          'apikey': process.env.SUPABASE_SERVICE_KEY,
          'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}`
        }
      }
    );
    const perfiles = await perfilRes.json();
    const perfil = perfiles[0];

    if (perfil?.rol !== 'admin') {
      return { statusCode: 403, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'No autorizado' }) };
    }

    const orgId = perfil.organizacion_id;
    const headers = {
      'Content-Type': 'application/json',
      'apikey': process.env.SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}`
    };

    // ── CREAR EMPLEADO ──
    if (accion === 'crear') {
      const { email, password, nombre, rol, locales } = datos;

      // Crear usuario en Supabase Auth
      const authRes = await fetch(
        `${process.env.SUPABASE_URL}/auth/v1/admin/users`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({ email, password, email_confirm: true })
        }
      );
      const authData = await authRes.json();
      if (authData.error || !authData.id) {
        return { statusCode: 400, body: JSON.stringify({ error: authData.error || authData.msg || 'Error al crear usuario' }) };
      }

      const nuevoId = authData.id;

      // Crear perfil
      await fetch(
        `${process.env.SUPABASE_URL}/rest/v1/perfiles`,
        {
          method: 'POST',
          headers: { ...headers, 'Prefer': 'return=minimal' },
          body: JSON.stringify({ id: nuevoId, organizacion_id: orgId, rol: rol || 'empleado', nombre, email })
        }
      );

      // Asignar locales
      if (locales && locales.length > 0) {
        const filas = locales.map(localId => ({
          perfil_id: nuevoId,
          local_id: localId,
          organizacion_id: orgId
        }));
        await fetch(
          `${process.env.SUPABASE_URL}/rest/v1/empleado_locales`,
          {
            method: 'POST',
            headers: { ...headers, 'Prefer': 'return=minimal' },
            body: JSON.stringify(filas)
          }
        );
      }

      return { statusCode: 200, body: JSON.stringify({ ok: true, id: nuevoId }) };
    }

    // ── ACTUALIZAR EMPLEADO ──
    if (accion === 'actualizar') {
      const { perfilId, nombre, rol, locales } = datos;

      // Actualizar perfil
      await fetch(
        `${process.env.SUPABASE_URL}/rest/v1/perfiles?id=eq.${perfilId}`,
        {
          method: 'PATCH',
          headers: { ...headers, 'Prefer': 'return=minimal' },
          body: JSON.stringify({ nombre, rol })
        }
      );

      // Reemplazar locales: borrar los viejos y poner los nuevos
      await fetch(
        `${process.env.SUPABASE_URL}/rest/v1/empleado_locales?perfil_id=eq.${perfilId}`,
        { method: 'DELETE', headers }
      );

      if (locales && locales.length > 0) {
        const filas = locales.map(localId => ({
          perfil_id: perfilId,
          local_id: localId,
          organizacion_id: orgId
        }));
        await fetch(
          `${process.env.SUPABASE_URL}/rest/v1/empleado_locales`,
          {
            method: 'POST',
            headers: { ...headers, 'Prefer': 'return=minimal' },
            body: JSON.stringify(filas)
          }
        );
      }

      return { statusCode: 200, body: JSON.stringify({ ok: true }) };
    }

    // ── DESACTIVAR EMPLEADO ──
    if (accion === 'desactivar') {
      const { perfilId } = datos;
      await fetch(
        `${process.env.SUPABASE_URL}/rest/v1/perfiles?id=eq.${perfilId}`,
        {
          method: 'PATCH',
          headers: { ...headers, 'Prefer': 'return=minimal' },
          body: JSON.stringify({ activo: false })
        }
      );
      return { statusCode: 200, body: JSON.stringify({ ok: true }) };
    }

    return { statusCode: 400, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Acción no reconocida' }) };

  } catch (err) {
    console.error('Error gestionar-empleado:', err);
    return { 
      statusCode: 500, 
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: err.message }) 
    };
  }
};