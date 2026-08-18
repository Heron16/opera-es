// ── Helper compartilhado: Redis (Upstash REST) + JWT auth ─────────────
const jwt    = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const REDIS_URL   = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const JWT_SECRET  = process.env.JWT_SECRET || 'coamo-dev-local-nao-usar-em-producao';

const REDIS_CHAVE_DADOS    = 'coamo:dados';
const REDIS_CHAVE_USUARIOS = 'coamo:users';

const USUARIOS_PADRAO = [
  { username: 'Coamo1',   password: 'Coamo1',   role: 'operador' },
  { username: 'admin',    password: 'admin123',  role: 'admin'    },
  { username: 'MFERRAZ',  password: '123456',    role: 'admin',   primeiroAcesso: true },
  { username: 'lpereira', password: '123456',    role: 'admin',   primeiroAcesso: true },
];

// ── Body parser manual (Vercel não parseia req.body automaticamente) ──
function parseBody(req) {
  return new Promise((resolve) => {
    // Se já foi parseado (ex: ambiente local com Express)
    if (req.body && typeof req.body === 'object') {
      resolve(req.body);
      return;
    }
    let data = '';
    req.on('data', chunk => { data += chunk; });
    req.on('end', () => {
      try { resolve(JSON.parse(data || '{}')); }
      catch { resolve({}); }
    });
    req.on('error', () => resolve({}));
  });
}

// ── Redis REST ────────────────────────────────────────────────────────
async function redisGet(chave) {
  if (!REDIS_URL || !REDIS_TOKEN) return null;
  const r = await fetch(`${REDIS_URL}/get/${encodeURIComponent(chave)}`, {
    headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
  });
  const json = await r.json();
  return json.result ?? null;
}

async function redisSet(chave, valor) {
  if (!REDIS_URL || !REDIS_TOKEN) return;
  await fetch(`${REDIS_URL}/set/${encodeURIComponent(chave)}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${REDIS_TOKEN}`,
      'Content-Type': 'text/plain',
    },
    body: valor,
  });
}

// Lê o hash coamo:dados como objeto {campo: valor}
async function redisHGetAll(chave) {
  if (!REDIS_URL || !REDIS_TOKEN) return null;
  try {
    const r = await fetch(`${REDIS_URL}/hgetall/${encodeURIComponent(chave)}`, {
      headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
    });
    const json = await r.json();
    // Upstash retorna array [campo1, valor1, campo2, valor2, ...]
    if (!json.result || !Array.isArray(json.result)) return null;
    const obj = {};
    for (let i = 0; i < json.result.length; i += 2) {
      obj[json.result[i]] = json.result[i + 1];
    }
    return obj;
  } catch { return null; }
}

// ── Dados da aplicação ────────────────────────────────────────────────
async function lerDados() {
  try {
    // Tenta ler como hash (novo formato atômico)
    const hash = await redisHGetAll(REDIS_CHAVE_DADOS);
    if (hash && Object.keys(hash).length > 0) return hash;

    // Fallback: lê como string JSON (formato antigo)
    const raw = await redisGet(REDIS_CHAVE_DADOS);
    if (!raw) return {};
    const dados = JSON.parse(raw);

    // Migra automaticamente do formato antigo (string JSON) para hash
    // fazendo um HSET para cada campo existente
    if (REDIS_URL && REDIS_TOKEN && typeof dados === 'object') {
      const entries = Object.entries(dados);
      if (entries.length > 0) {
        // Monta o array [campo1, valor1, campo2, valor2, ...]
        const flat = entries.flatMap(([k, v]) => [k, v]);
        await fetch(`${REDIS_URL}/hset/${encodeURIComponent(REDIS_CHAVE_DADOS)}`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${REDIS_TOKEN}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(flat),
        }).catch(() => {}); // migração silenciosa — não bloqueia se falhar
      }
    }
    return dados;
  } catch {
    return {};
  }
}

async function salvarDados(dados) {
  // Mantido para compatibilidade (usado por migrar.js, rotinas.js, etc.)
  // Salva como hash campo a campo
  if (!REDIS_URL || !REDIS_TOKEN) return;
  const entries = Object.entries(dados);
  if (entries.length === 0) return;
  const flat = entries.flatMap(([k, v]) => [k, v]);
  await fetch(`${REDIS_URL}/hset/${encodeURIComponent(REDIS_CHAVE_DADOS)}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${REDIS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(flat),
  });
}

// ── Usuários ──────────────────────────────────────────────────────────
async function lerUsuarios() {
  try {
    const raw = await redisGet(REDIS_CHAVE_USUARIOS);
    if (raw) return JSON.parse(raw);
  } catch {}
  if (process.env.USERS_JSON) {
    try { return JSON.parse(process.env.USERS_JSON); } catch {}
  }
  return USUARIOS_PADRAO;
}

async function salvarUsuarios(usuarios) {
  await redisSet(REDIS_CHAVE_USUARIOS, JSON.stringify(usuarios));
}

async function verificarSenha(senha, usuario) {
  if (usuario.passwordHash) return bcrypt.compareSync(senha, usuario.passwordHash);
  return senha === usuario.password;
}

// ── JWT ───────────────────────────────────────────────────────────────
function gerarToken(usuario) {
  return jwt.sign(
    { username: usuario.username, role: usuario.role },
    JWT_SECRET,
    { expiresIn: '12h' }
  );
}

function verificarToken(req) {
  const header = req.headers['authorization'] || '';
  const token  = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return null;
  try { return jwt.verify(token, JWT_SECRET); }
  catch { return null; }
}

// ── CORS ──────────────────────────────────────────────────────────────
function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
}

module.exports = {
  lerDados,
  salvarDados,
  lerUsuarios,
  salvarUsuarios,
  verificarSenha,
  gerarToken,
  verificarToken,
  setCors,
  parseBody,
  JWT_SECRET,
};
