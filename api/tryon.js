export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const { human_img, garm_img, garment_des, category, needs_bg_removal } = req.body;
    const fashnKey = process.env.FASHN_KEY;
    const replicateKey = process.env.REPLICATE_KEY;

    // ── Función reutilizable para quitar fondo ──
    async function removeBackground(imageData) {
      if (!replicateKey) return imageData;
      try {
        const resp = await fetch('https://api.replicate.com/v1/predictions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Token ' + replicateKey
          },
          body: JSON.stringify({
            version: 'fb8af171cfa1616ddcf1242c093f9c46bcada5ad4cf6f2fbe8b81b330ec5c003',
            input: { image: imageData }
          })
        });
        const data = await resp.json();
        const predId = data.id;
        for (let i = 0; i < 30; i++) {
          await new Promise(r => setTimeout(r, 1000));
          const poll = await fetch('https://api.replicate.com/v1/predictions/' + predId, {
            headers: { 'Authorization': 'Token ' + replicateKey }
          });
          const pollData = await poll.json();
          if (pollData.status === 'succeeded' && pollData.output) {
            console.log('✓ Fondo eliminado');
            return pollData.output;
          }
          if (pollData.status === 'failed') {
            console.error('rembg falló');
            return imageData;
          }
        }
        return imageData;
      } catch (e) {
        console.error('rembg error:', e.message);
        return imageData;
      }
    }

    // ── PASO 1: Quitar fondo de la foto de la PERSONA siempre ──
    console.log('Quitando fondo de foto persona...');
    const finalHumanImg = await removeBackground(human_img);

    // ── PASO 2: Quitar fondo de la PRENDA si es necesario ──
    let finalGarmImg = garm_img;
    if (needs_bg_removal) {
      console.log('Quitando fondo de prenda...');
      finalGarmImg = await removeBackground(garm_img);
    }

    // ── PASO 3: Try-On con Fashn.ai ──
    const run = await fetch('https://api.fashn.ai/v1/run', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + fashnKey
      },
      body: JSON.stringify({
        model_name: 'tryon-v1.6',
        inputs: {
          model_image: finalHumanImg,
          garment_image: finalGarmImg,
          category: category || 'auto',
          mode: 'balanced',
          return_base64: true
        }
      })
    });

    const runData = await run.json();
    if (!run.ok) return res.status(run.status).json(runData);

    const predId = runData.id;
    for (let i = 0; i < 60; i++) {
      await new Promise(r => setTimeout(r, 1000));
      const poll = await fetch('https://api.fashn.ai/v1/status/' + predId, {
        headers: { 'Authorization': 'Bearer ' + fashnKey }
      });
      const pollData = await poll.json();
      if (pollData.status === 'completed' && pollData.output?.[0]) {
        return res.status(200).json({
          output: pollData.output[0],
          bg_removed: true
        });
      }
      if (pollData.status === 'failed') {
        return res.status(500).json({ error: pollData.error || 'Failed' });
      }
    }
    return res.status(504).json({ error: 'Timeout' });

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
