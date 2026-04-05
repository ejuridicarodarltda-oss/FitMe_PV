export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const { human_img, garm_img, garment_des, category } = req.body;
    const key = process.env.FASHN_KEY;

    const run = await fetch('https://api.fashn.ai/v1/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
      body: JSON.stringify({
        model_name: 'tryon-v1.6',
        inputs: { model_image: human_img, garment_image: garm_img, category: category || 'auto', mode: 'balanced', return_base64: true }
      })
    });

    const runData = await run.json();
    if (!run.ok) return res.status(run.status).json(runData);

    const predId = runData.id;
    for (let i = 0; i < 60; i++) {
      await new Promise(r => setTimeout(r, 1000));
      const poll = await fetch('https://api.fashn.ai/v1/status/' + predId, {
        headers: { 'Authorization': 'Bearer ' + key }
      });
      const pollData = await poll.json();
      if (pollData.status === 'completed' && pollData.output?.[0]) {
        return res.status(200).json({ output: pollData.output[0] });
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
