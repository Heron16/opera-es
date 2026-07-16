// ── Helper compartilhado: Redis (Upstash REST) + JWT auth ─────────────
const jwt    = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const REDIS_URL   = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const JWT_SECRET  = process.env.JWT_SECRET || 'coamo-dev-local-nao-usar-em-producao';

const REDIS_CHAVE_DADOS    = 'coamo:dados';
const REDIS_CHAVE_USUARIOS = 'coamo:users';

const USUARIOS_PADRAO = [
  { username: 'Coamo1', password: 'Coamo1',  role: 'operador' },
  { username: 'admin',  password: 'admin123', role: 'admin'    },
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
  // Upstash REST API: POST /set/chave com valor no body como texto plano
  await fetch(`${REDIS_URL}/set/${encodeURIComponent(chave)}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${REDIS_TOKEN}`,
      'Content-Type': 'text/plain',
    },
    body: valor,
  });
}

// ── Dados da aplicação ────────────────────────────────────────────────
async function lerDados() {
  try {
    const raw = await redisGet(REDIS_CHAVE_DADOS);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

async function salvarDados(dados) {
  await redisSet(REDIS_CHAVE_DADOS, JSON.stringify(dados));
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
