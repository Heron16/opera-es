// Debug completo — sem autenticação para facilitar teste
const REDIS_URL   = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

  if (!REDIS_URL || !REDIS_TOKEN) {
    return res.status(500).json({ erro: 'Variáveis de ambiente não configuradas', REDIS_URL: !!REDIS_URL, REDIS_TOKEN: !!REDIS_TOKEN });
  }

  try {
    const resultado = {};

    // 1. Verifica o tipo da chave coamo:dados
    const tipoR = await fetch(`${REDIS_URL}/type/coamo%3Adados`, {
      headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
    });
    const tipoJson = await tipoR.json();
    resultado.tipo_chave = tipoJson.result;

    // 2. Se for hash, lê com HGETALL
    if (tipoJson.result === 'hash') {
      const hR = await fetch(`${REDIS_URL}/hgetall/coamo%3Adados`, {
        headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
      });
      const hJson = await hR.json();
      const arr = hJson.result;
      resultado.formato = 'HASH';
      resultado.num_campos = Array.isArray(arr) ? arr.length / 2 : 0;
      resultado.campos = Array.isArray(arr) ? arr.filter((_,i) => i%2===0) : [];

    // 3. Se for string, lê com GET
    } else if (tipoJson.result === 'string') {
      const gR = await fetch(`${REDIS_URL}/get/coamo%3Adados`, {
        headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
      });
      const gJson = await gR.json();
      resultado.formato = 'STRING (formato antigo)';
      const raw = gJson.result || '';
      resultado.tamanho = raw.length;
      try {
        const obj = JSON.parse(raw);
        resultado.num_chaves = Object.keys(obj).length;
        resultado.chaves = Object.keys(obj).slice(0, 10);
      } catch { resultado.parse_erro = true; resultado.inicio = raw.substring(0,100); }

    } else {
      resultado.formato = 'CHAVE NÃO EXISTE';
    }

    // 4. Testa escrita: salva um campo de teste
    const testeR = await fetch(`${REDIS_URL}/hset/coamo%3Adados`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${REDIS_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(['_debug_teste', new Date().toISOString()]),
    });
    const testeJson = await testeR.json();
    resultado.teste_escrita_hset = testeJson;

    return res.json(resultado);
  } catch (e) {
    return res.status(500).json({ erro: e.message, stack: e.stack });
  }
};
