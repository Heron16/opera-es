# Deploy no Railway — Passo a Passo

## Pré-requisitos (fazer uma vez só)
- Conta no GitHub: https://github.com
- Conta no Railway: https://railway.app  (pode entrar com a conta GitHub)

---

## 1. Subir o projeto no GitHub

1. Acesse https://github.com e crie um repositório **privado** chamado `coamo-operacoes`
2. No computador onde está o projeto, abra o terminal (CMD) e execute:

```
cd D:\projeto2
git init
git add .
git commit -m "primeiro deploy"
git branch -M main
git remote add origin https://github.com/SEU_USUARIO/coamo-operacoes.git
git push -u origin main
```

---

## 2. Deploy no Railway

1. Acesse https://railway.app e clique em **"New Project"**
2. Escolha **"Deploy from GitHub repo"**
3. Selecione o repositório `coamo-operacoes`
4. Railway detecta automaticamente que é Node.js e faz o deploy

---

## 3. Configurar variáveis de ambiente (OBRIGATÓRIO)

No painel do Railway, clique no serviço → aba **"Variables"** e adicione:

| Variável     | Valor                              |
|--------------|------------------------------------|
| JWT_SECRET   | uma frase longa e aleatória (ex: CoamoSistema2025@XyZ!)  |

**Opcional** — se quiser adicionar mais usuários sem editar o código, adicione também:

| Variável     | Valor                                                       |
|--------------|-------------------------------------------------------------|
| USERS_JSON   | `[{"username":"Coamo1","password":"Coamo1","role":"operador"},{"username":"admin","password":"admin123","role":"admin"}]` |

---

## 4. Acessar o site

Após o deploy (1-2 minutos), Railway gera uma URL pública como:
`https://coamo-operacoes-production.up.railway.app`

Essa URL funciona em **qualquer computador**, sem instalar nada, sem PowerShell.

---

## Logins

| Usuário | Senha     | Permissão                          |
|---------|-----------|------------------------------------|
| Coamo1  | Coamo1    | Operador — acessa rotinas, não edita horários |
| admin   | admin123  | Supervisor — acessa tudo, edita horários |

---

## Dados

Os dados ficam salvos no arquivo `dados.json` dentro do servidor Railway.
> ⚠️ O Railway pode resetar o disco ao fazer um novo deploy.
> Para dados persistentes, configure um **Railway Volume** no painel:
> Serviço → **"Add Volume"** → monte em `/app` (ou onde o projeto estiver).

---

## Plano gratuito Railway

O plano gratuito (Hobby) oferece $5/mês de crédito — suficiente para rodar
o servidor 24/7 no plano básico. Não precisa de cartão para começar.
