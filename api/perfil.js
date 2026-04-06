export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;

  if (!url || !token) {
    return res.status(500).json({ error: 'KV no configurado' });
  }

  async function kv(command, ...args) {
    const resp = await fetch(`${url}/${command}/${args.map(a => encodeURIComponent(typeof a === 'object' ? JSON.stringify(a) : a)).join('/')}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return resp.json();
  }

  async function kvSet(key, value) {
    const resp = await fetch(`${url}/set/${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: JSON.stringify(value) })
    });
    return resp.json();
  }

  async function kvGet(key) {
    const resp = await fetch(`${url}/get/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await resp.json();
    if (!data.result) return null;
    try { return JSON.parse(data.result); } catch { return data.result; }
  }

  async function kvDel(key) {
    const resp = await fetch(`${url}/del/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return resp.json();
  }

  async function kvSmembers(key) {
    const resp = await fetch(`${url}/smembers/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await resp.json();
    return data.result || [];
  }

  async function kvSadd(key, member) {
    const resp = await fetch(`${url}/sadd/${encodeURIComponent(key)}/${encodeURIComponent(member)}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return resp.json();
  }

  async function kvSrem(key, member) {
    const resp = await fetch(`${url}/srem/${encodeURIComponent(key)}/${encodeURIComponent(member)}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return resp.json();
  }

  const MAX_USERS = 10;
  const USERS_SET = 'fitme:usuarios';

  try {
    // ── GET /api/perfil?nombre=Juan — cargar perfil ──
    if (req.method === 'GET') {
      const nombre = req.query.nombre?.trim().toLowerCase();
      if (!nombre) return res.status(400).json({ error: 'Nombre requerido' });

      const perfil = await kvGet(`fitme:perfil:${nombre}`);
      if (!perfil) return res.status(404).json({ error: 'Perfil no encontrado' });

      // No devolver la foto (muy pesada) — se guarda en localStorage del dispositivo
      const { foto, ...perfilSinFoto } = perfil;
      return res.status(200).json({ perfil: perfilSinFoto, tieneFoto: !!foto });
    }

    // ── POST /api/perfil — guardar perfil ──
    if (req.method === 'POST') {
      const { nombre, userData, perfil, gender, foto } = req.body;
      if (!nombre || !userData || !perfil) {
        return res.status(400).json({ error: 'Datos incompletos' });
      }

      const key = nombre.trim().toLowerCase();

      // Verificar límite de usuarios
      const usuarios = await kvSmembers(USERS_SET);
      const esNuevo = !usuarios.includes(key);

      if (esNuevo && usuarios.length >= MAX_USERS) {
        return res.status(429).json({
          error: `Límite de ${MAX_USERS} usuarios alcanzado. Habla con el administrador.`
        });
      }

      // Guardar perfil
      await kvSet(`fitme:perfil:${key}`, {
        nombre: nombre.trim(),
        userData,
        perfil,
        gender,
        foto: foto || null, // foto base64 opcional
        updatedAt: new Date().toISOString()
      });

      // Registrar en set de usuarios
      if (esNuevo) await kvSadd(USERS_SET, key);

      return res.status(200).json({ ok: true, esNuevo });
    }

    // ── DELETE /api/perfil?nombre=Juan — borrar perfil ──
    if (req.method === 'DELETE') {
      const nombre = req.query.nombre?.trim().toLowerCase();
      if (!nombre) return res.status(400).json({ error: 'Nombre requerido' });

      await kvDel(`fitme:perfil:${nombre}`);
      await kvSrem(USERS_SET, nombre);
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Método no permitido' });

  } catch (e) {
    console.error('perfil.js error:', e);
    return res.status(500).json({ error: e.message });
  }
}
