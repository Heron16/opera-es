// ============================================================
//  Servidor – Sistema de Rotinas Coamo
//  Node.js + Express  |  Porta: 3000
//  Dados: dados.json  |  Auth: JWT
// ============================================================

const express  = require('express');
const fs       = require('fs');
const path     = require('path');
const jwt      = require('jsonwebtoken');
const bcrypt   = require('bcryptjs');

const app  = express();
const PORT = process.env.PORT || 3000;
const DIR  = __dirname;

// ── Segredo JWT (Railway define via variável de ambiente) ────────────
const JWT_SECRET = process.env.JWT_SECRET || 'coamo-secret-local-dev-2025';

// ── Arquivo de dados ─────────────────────────────────────────────────
const DADOS_PATH = path.join(DIR, 'dados.json');
if (!fs.existsSync(DADOS_PATH)) fs.writeFileSync(DADOS_PATH, '{}', 'utf8');

// ── Usuários (senhas em hash bcrypt ou texto plano para compatibilidade)
// Para adicionar usuários, edite o arquivo users.json ou
// defina a variável de ambiente USERS_JSON no Railway.
// Formato: [{ "username": "x", "passwordHash": "bcrypt-hash", "role": "operador|admin" }]
// ─────────────────────────────────────────────────────────────────────
function carregarUsuarios() {
  // Tenta carregar de variável de ambiente (Railway) ou arquivo local
  const raw = process.env.USERS_JSON || null;
  if (raw) {
    try { return JSON.parse(raw); } catch { /* cai no padrão */ }
  }
  const usersPath = path.join(DIR, 'users.json');
  if (fs.existsSync(usersPath)) {
    try { return JSON.parse(fs.readFileSync(usersPath, 'utf8')); } catch {}
  }
  // Usuários padrão (fallback)
  return USUARIOS_PADRAO;
}

// Usuários padrão – mesmos do index.html original
// As senhas aqui estão em bcrypt hash OU em texto plano (campo "password")
const USUARIOS_PADRAO = [
  { username: 'Coamo1',  password: 'Coamo1',   role: 'operador' },
  { username: 'admin',   password: 'admin123',  role: 'admin'    }
];

// Verifica senha (aceita tanto bcrypt hash quanto texto plano)
async function verificarSenha(senha, usuario) {
  if (usuario.passwordHash) {
    return bcrypt.compareSync(senha, usuario.passwordHash);
  }
  // texto plano (compatibilidade com configuração original)
  return senha === usuario.password;
}

// ── Middleware ────────────────────────────────────────────────────────
app.use(express.json({ limit: '5mb' }));

// Middleware de autenticação JWT
function autenticar(req, res, next) {
  const header = req.headers['authorization'] || '';
  const token  = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ erro: 'Não autenticado' });
  try {
    req.usuario = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ erro: 'Token inválido ou expirado' });
  }
}

// Middleware que exige role admin
function soAdmin(req, res, next) {
  if (req.usuario?.role !== 'admin') {
    return res.status(403).json({ erro: 'Acesso negado. Apenas administradores.' });
  }
  next();
}

// Mutex simples para escrita no JSON
let escrevendo = false;
const filaEscrita = [];

function escreverDados(dados) {
  return new Promise((resolve, reject) => {
    const executar = () => {
      escrevendo = true;
      try {
        fs.writeFileSync(DADOS_PATH, JSON.stringify(dados, null, 2), 'utf8');
        resolve();
      } catch (e) {
        reject(e);
      } finally {
        escrevendo = false;
        if (filaEscrita.length > 0) filaEscrita.shift()();
      }
    };
    if (escrevendo) filaEscrita.push(executar);
    else executar();
  });
}

function lerDados() {
  try { return JSON.parse(fs.readFileSync(DADOS_PATH, 'utf8')); }
  catch { return {}; }
}

// ── ROTAS DE AUTENTICAÇÃO ─────────────────────────────────────────────

// POST /api/login
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ erro: 'Usuário e senha são obrigatórios' });
  }
  const usuarios = carregarUsuarios();
  const usuario  = usuarios.find(u => u.username === username);
  if (!usuario) {
    return res.status(401).json({ erro: 'Usuário ou senha incorretos' });
  }
  const ok = await verificarSenha(password, usuario);
  if (!ok) {
    return res.status(401).json({ erro: 'Usuário ou senha incorretos' });
  }
  const token = jwt.sign(
    { username: usuario.username, role: usuario.role },
    JWT_SECRET,
    { expiresIn: '12h' }
  );
  res.json({ token, username: usuario.username, role: usuario.role });
});

// ── ROTAS DE DADOS ────────────────────────────────────────────────────

// GET /api/dados  → retorna todos os dados (qualquer usuário autenticado)
app.get('/api/dados', autenticar, (req, res) => {
  res.json(lerDados());
});

// POST /api/dados/:chave  → salva um valor (qualquer usuário autenticado)
// Chaves que começam com "horarios_" só podem ser salvas por admin
app.post('/api/dados/:chave', autenticar, async (req, res) => {
  const chave = decodeURIComponent(req.params.chave);

  // Protege as chaves de horário para somente admin
  if (chave.startsWith('horarios_') && req.usuario.role !== 'admin') {
    return res.status(403).json({ erro: 'Apenas administradores podem editar horários.' });
  }

  let valor;
  try   { valor = req.body.valor !== undefined ? req.body.valor : req.body; }
  catch { valor = req.body; }

  try {
    const dados = lerDados();
    dados[chave] = valor;
    await escreverDados(dados);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ erro: 'Erro ao salvar dados' });
  }
});

// ── ARQUIVOS ESTÁTICOS ────────────────────────────────────────────────
// Serve os arquivos da pasta raiz (index.html, dashboard.html, etc.)
app.use(express.static(DIR, {
  index: 'index.html',
  // Não expõe arquivos sensíveis
  setHeaders(res, filePath) {
    // Cache curto para HTML/JS para facilitar atualizações
    if (filePath.endsWith('.html') || filePath.endsWith('.js')) {
      res.setHeader('Cache-Control', 'no-cache');
    }
  }
}));

// Bloqueia acesso a arquivos sensíveis
app.get(['/dados.json', '/users.json', '/server.js', '/package.json',
         '/package-lock.json', '/.env', '/servidor.ps1'], (req, res) => {
  res.status(403).send('Proibido');
});

// ── START ─────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n  ==========================================`);
  console.log(`   SERVIDOR INICIADO - PORTA ${PORT}`);
  console.log(`   Acesso: http://localhost:${PORT}`);
  console.log(`  ==========================================\n`);
});
