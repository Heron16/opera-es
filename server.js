// ============================================================
//  Servidor – Sistema de Rotinas Coamo
//  Node.js + Express  |  Porta: 3000
//  Dados: Upstash Redis (persistente) + fallback dados.json
//  Auth: JWT
// ============================================================

const express = require('express');
const fs      = require('fs');
const path    = require('path');
const jwt     = require('jsonwebtoken');
const bcrypt  = require('bcryptjs');

const app  = express();
const PORT = process.env.PORT || 3000;
const DIR  = __dirname;

// ── JWT ──────────────────────────────────────────────────────────────
const JWT_SECRET = process.env.JWT_SECRET || (() => {
  if (process.env.NODE_ENV === 'production') {
    console.error('ERRO CRÍTICO: JWT_SECRET não definido em produção!');
    process.exit(1);
  }
  return 'coamo-dev-local-nao-usar-em-producao';
})();

// ── REDIS (Upstash) ───────────────────────────────────────────────────
const REDIS_URL   = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const USAR_REDIS  = !!(REDIS_URL && REDIS_TOKEN);

// Chave no Redis onde ficam todos os dados
const REDIS_CHAVE = 'coamo:dados';

// Cache em memória para evitar leitura do Redis a cada requisição
let _cache = {};
let _cacheCarregado = false;

async function redisGet(chave) {
  const r = await fetch(`${REDIS_URL}/get/${encodeURIComponent(chave)}`, {
    headers: { Authorization: `Bearer ${REDIS_TOKEN}` }
  });
  const json = await r.json();
  return json.result; // null se não existir
}

async function redisSet(chave, valor) {
  await fetch(`${REDIS_URL}/set/${encodeURIComponent(chave)}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${REDIS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ value: valor })
  });
}

// Carrega todos os dados do Redis (ou arquivo local) na inicialização
async function carregarDados() {
  if (USAR_REDIS) {
    try {
      const raw = await redisGet(REDIS_CHAVE);
      _cache = raw ? JSON.parse(raw) : {};
      console.log('  [Redis] Dados carregados do Upstash');
    } catch (e) {
      console.warn('  [Redis] Falha ao carregar — usando arquivo local:', e.message);
      _cache = lerArquivoLocal();
    }
  } else {
    _cache = lerArquivoLocal();
  }
  _cacheCarregado = true;
}

function lerArquivoLocal() {
  const p = path.join(DIR, 'dados.json');
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); }
  catch { return {}; }
}

function lerDados() {
  return _cache;
}

async function salvarDadosChave(chave, valor) {
  _cache[chave] = valor;
  if (USAR_REDIS) {
    try {
      await redisSet(REDIS_CHAVE, JSON.stringify(_cache));
    } catch (e) {
      console.warn('  [Redis] Falha ao salvar chave:', chave, e.message);
    }
  } else {
    // Fallback: salva no arquivo local
    try {
      fs.writeFileSync(path.join(DIR, 'dados.json'), JSON.stringify(_cache, null, 2), 'utf8');
    } catch {}
  }
}

// ── USUÁRIOS ─────────────────────────────────────────────────────────
const USUARIOS_PADRAO = [
  { username: 'Coamo1',  password: 'Coamo1',   role: 'operador' },
  { username: 'admin',   password: 'admin123',  role: 'admin'    }
];

function carregarUsuarios() {
  const raw = process.env.USERS_JSON || null;
  if (raw) { try { return JSON.parse(raw); } catch {} }
  const p = path.join(DIR, 'users.json');
  if (fs.existsSync(p)) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch {} }
  return USUARIOS_PADRAO;
}

async function verificarSenha(senha, usuario) {
  if (usuario.passwordHash) return bcrypt.compareSync(senha, usuario.passwordHash);
  return senha === usuario.password;
}

// ── MIDDLEWARE ────────────────────────────────────────────────────────
app.use(express.json({ limit: '5mb' }));

function autenticar(req, res, next) {
  const header = req.headers['authorization'] || '';
  const token  = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ erro: 'Não autenticado' });
  try { req.usuario = jwt.verify(token, JWT_SECRET); next(); }
  catch { res.status(401).json({ erro: 'Token inválido ou expirado' }); }
}

// ── ROTAS DE AUTENTICAÇÃO ─────────────────────────────────────────────

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password)
    return res.status(400).json({ erro: 'Usuário e senha são obrigatórios' });

  const usuarios = carregarUsuarios();
  const usuario  = usuarios.find(u => u.username === username);
  if (!usuario || !(await verificarSenha(password, usuario)))
    return res.status(401).json({ erro: 'Usuário ou senha incorretos' });

  const token = jwt.sign(
    { username: usuario.username, role: usuario.role },
    JWT_SECRET,
    { expiresIn: '12h' }
  );
  res.json({ token, username: usuario.username, role: usuario.role, primeiroAcesso: !!usuario.primeiroAcesso });
});

app.post('/api/trocar-senha', autenticar, async (req, res) => {
  const { novaSenha } = req.body || {};
  if (!novaSenha) return res.status(400).json({ erro: 'Nova senha obrigatória' });

  const forte = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).{8,}$/.test(novaSenha);
  if (!forte)
    return res.status(400).json({ erro: 'A senha deve ter no mínimo 8 caracteres com letra maiúscula, minúscula, número e caractere especial.' });

  const usuarios = carregarUsuarios();
  const idx = usuarios.findIndex(u => u.username === req.usuario.username);
  if (idx === -1) return res.status(404).json({ erro: 'Usuário não encontrado' });

  usuarios[idx].passwordHash = bcrypt.hashSync(novaSenha, 10);
  delete usuarios[idx].password;
  delete usuarios[idx].primeiroAcesso;

  // Persiste no arquivo local e em memória
  try { fs.writeFileSync(path.join(DIR, 'users.json'), JSON.stringify(usuarios, null, 2), 'utf8'); } catch {}
  process.env.USERS_JSON = JSON.stringify(usuarios);
  res.json({ ok: true });
});

// ── ROTAS DE DADOS ────────────────────────────────────────────────────

app.get('/api/dados', autenticar, (req, res) => {
  res.json(lerDados());
});

// POST /api/dados/migrar — salva todos os dados de uma vez (migração do localStorage)
app.post('/api/migrar', autenticar, async (req, res) => {
  const dadosNovos = req.body || {};
  if (typeof dadosNovos !== 'object' || Array.isArray(dadosNovos))
    return res.status(400).json({ erro: 'Formato inválido' });

  try {
    // Mescla com dados existentes — novos dados têm prioridade
    const existentes = lerDados();
    const merged = { ...existentes, ...dadosNovos };
    _cache = merged;

    if (USAR_REDIS) {
      await redisSet(REDIS_CHAVE, JSON.stringify(merged));
    } else {
      fs.writeFileSync(path.join(DIR, 'dados.json'), JSON.stringify(merged, null, 2), 'utf8');
    }
    res.json({ ok: true, chaves: Object.keys(dadosNovos).length });
  } catch (e) {
    res.status(500).json({ erro: 'Erro ao migrar dados' });
  }
});

app.post('/api/dados/:chave', autenticar, async (req, res) => {
  const chave = decodeURIComponent(req.params.chave);

  if (chave.startsWith('horarios_') && req.usuario.role !== 'admin')
    return res.status(403).json({ erro: 'Apenas administradores podem editar horários.' });

  const valor = req.body.valor !== undefined ? req.body.valor : req.body;

  try {
    await salvarDadosChave(chave, valor);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ erro: 'Erro ao salvar dados' });
  }
});

// ── ARQUIVOS ESTÁTICOS ────────────────────────────────────────────────
const ARQUIVOS_BLOQUEADOS = new Set([
  'dados.json','users.json','server.js','package.json',
  'package-lock.json','.env','servidor.ps1','servico_wrapper.ps1',
  'INSTALAR_SERVICO_TI.ps1','DESINSTALAR_SERVICO_TI.ps1'
]);

app.use((req, res, next) => {
  const nome = req.path.replace(/^\//, '');
  if (ARQUIVOS_BLOQUEADOS.has(nome) || ARQUIVOS_BLOQUEADOS.has(nome.toLowerCase()))
    return res.status(403).send('Proibido');
  next();
});

app.use(express.static(DIR, {
  index: 'index.html',
  setHeaders(res, filePath) {
    if (filePath.endsWith('.html') || filePath.endsWith('.js'))
      res.setHeader('Cache-Control', 'no-cache');
  }
}));

// ── START ─────────────────────────────────────────────────────────────
carregarDados().then(() => {
  app.listen(PORT, () => {
    console.log(`\n  ==========================================`);
    console.log(`   SERVIDOR INICIADO - PORTA ${PORT}`);
    console.log(`   Acesso: http://localhost:${PORT}`);
    console.log(`   Armazenamento: ${USAR_REDIS ? 'Upstash Redis ✓' : 'Arquivo local'}`);
    console.log(`  ==========================================\n`);
  });
});
