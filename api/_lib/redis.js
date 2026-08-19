// ── Helper compartilhado: Redis (Upstash REST) + JWT auth ─────────────
const jwt    = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const REDIS_URL   = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const JWT_SECRET  = process.env.JWT_SECRET || 'coamo-dev-local-nao-usar-em-producao';

const REDIS_CHAVE_DADOS    = 'coamo:dados';
const REDIS_CHAVE_USUARIOS = 'coamo:users';

const USUARIOS_PADRAO = [
  { username: 'Coamo1',       password: 'Coamo1',   role: 'operador' },
  { username: 'admin',        password: 'admin123',  role: 'admin'    },
  { username: 'MFERRAZ',      password: '123456',    role: 'admin',    primeiroAcesso: true },
  { username: 'lpereira',     password: '123456',    role: 'admin',    primeiroAcesso: true },
  { username: 'hsilva',       password: '123456',    role: 'operador', primeiroAcesso: true },
  { username: 'hcarvalho',    password: '123456',    role: 'operador', primeiroAcesso: true },
  { username: 'vitorsilva',   password: '123456',    role: 'operador', primeiroAcesso: true },
  { username: 'vhonorato',    password: '123456',    role: 'operador', primeiroAcesso: true },
  { username: 'adolinek',     password: '123456',    role: 'operador', primeiroAcesso: true },
  { username: 'eduardosilva', password: '123456',    role: 'operador', primeiroAcesso: true },
  { username: 'coliveira',    password: '123456',    role: 'operador', primeiroAcesso: true },
  { username: 'eklein',       password: '123456',    role: 'operador', primeiroAcesso: true },
  { username: 'mmartins',     password: '123456',    role: 'operador', primeiroAcesso: true },
  { username: 'phdias',       password: '123456',    role: 'operador', primeiroAcesso: true },
];

// ── Body parser manual ────────────────────────────────────────────────
function parseBody(req) {
  return new Promise((resolve) => {
    if (req.body && typeof req.body === 'object') { resolve(req.body); return; }
    let data = '';
    req.on('data', chunk => { data += chunk; });
    req.on('end', () => { try { resolve(JSON.parse(data || '{}')); } catch { resolve({}); } });
    req.on('error', () => resolve({}));
  });
}

// ── Redis REST primitivos ─────────────────────────────────────────────
async function redisGet(chave) {
  if (!REDIS_URL || !REDIS_TOKEN) return null;
  try {
    const r = await fetch(`${REDIS_URL}/get/${encodeURIComponent(chave)}`, {
      headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
    });
    const json = await r.json();
    return json.result ?? null;
  } catch { return null; }
}

async function redisSet(chave, valor) {
  if (!REDIS_URL || !REDIS_TOKEN) return;
  await fetch(`${REDIS_URL}/set/${encodeURIComponent(chave)}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${REDIS_TOKEN}`, 'Content-Type': 'text/plain' },
    body: valor,
  });
}

// HSET atômico: define um campo dentro de um hash Redis
// Upstash REST: POST /hset/<hash>/<field>/<value>  (args na URL path)
async function redisHSet(hashKey, campo, valor) {
  if (!REDIS_URL || !REDIS_TOKEN) return false;
  try {
    const url = `${REDIS_URL}/hset/${encodeURIComponent(hashKey)}/${encodeURIComponent(campo)}/${encodeURIComponent(valor)}`;
    const r = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
    });
    return r.ok;
  } catch { return false; }
}

// HGETALL: lê todos os campos de um hash Redis
async function redisHGetAll(hashKey) {
  if (!REDIS_URL || !REDIS_TOKEN) return null;
  try {
    const r = await fetch(`${REDIS_URL}/hgetall/${encodeURIComponent(hashKey)}`, {
      headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
    });
    const json = await r.json();
    if (!json.result || !Array.isArray(json.result) || json.result.length === 0) return null;
    const obj = {};
    for (let i = 0; i < json.result.length; i += 2) {
      obj[json.result[i]] = json.result[i + 1];
    }
    return obj;
  } catch { return null; }
}

// ── Dados da aplicação ────────────────────────────────────────────────
// Os dados são armazenados como Hash no Redis (coamo:dados)
// Cada campo do hash = uma chave do dashboard (ex: status_diaria_2026-08-17)
// Isso permite salvar campos individualmente sem race condition

async function lerDados() {
  try {
    // Tenta ler como hash (formato atual)
    const hash = await redisHGetAll(REDIS_CHAVE_DADOS);
    if (hash && Object.keys(hash).length > 0) return hash;

    // Fallback: se a chave ainda for string JSON (formato antigo), lê e migra
    const raw = await redisGet(REDIS_CHAVE_DADOS);
    if (!raw) return {};
    const dados = JSON.parse(raw);

    // Migra automaticamente: converte de string JSON para hash
    if (REDIS_URL && REDIS_TOKEN && typeof dados === 'object') {
      const entries = Object.entries(dados);
      if (entries.length > 0) {
        // Deleta a chave string antiga e cria como hash
        await fetch(`${REDIS_URL}/del/${encodeURIComponent(REDIS_CHAVE_DADOS)}`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
        }).catch(() => {});
        // Salva cada campo no hash com formato correto (args na URL path)
        const args = entries.flatMap(([k, v]) => [
          encodeURIComponent(k),
          encodeURIComponent(typeof v === 'string' ? v : JSON.stringify(v))
        ]).join('/');
        await fetch(`${REDIS_URL}/hset/${encodeURIComponent(REDIS_CHAVE_DADOS)}/${args}`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
        }).catch(() => {});
      }
    }
    return dados;
  } catch {
    return {};
  }
}

async function salvarDados(dados) {
  if (!REDIS_URL || !REDIS_TOKEN || typeof dados !== 'object') return;
  const entries = Object.entries(dados);
  if (entries.length === 0) return;
  // Upstash REST HSET: POST /hset/<hash>/<field>/<value>/... (args na URL path)
  const args = entries.flatMap(([k, v]) => [
    encodeURIComponent(k),
    encodeURIComponent(typeof v === 'string' ? v : JSON.stringify(v))
  ]).join('/');
  await fetch(`${REDIS_URL}/hset/${encodeURIComponent(REDIS_CHAVE_DADOS)}/${args}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
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
  // Senha em texto puro (antes de trocar): aceita qualquer combinação de maiúsculas/minúsculas
  return senha.toLowerCase() === usuario.password.toLowerCase();
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
  redisHSet,
  REDIS_CHAVE_DADOS,
  lerUsuarios,
  salvarUsuarios,
  verificarSenha,
  gerarToken,
  verificarToken,
  setCors,
  parseBody,
  JWT_SECRET,
};
