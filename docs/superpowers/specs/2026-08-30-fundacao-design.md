# Fundação — Sistema de Gerenciamento de Distribuidora/Transportadora

**Data:** 2026-08-30
**Status:** Aprovado para implementação

## Contexto

Este é o primeiro de vários módulos de um sistema de gerenciamento para uma
distribuidora/transportadora. O sistema completo cobrirá cadastro de
clientes, produtos e cargas (com controle de estoque, vendas, devoluções e
despesas por carga). Dado o tamanho do projeto, ele foi dividido em
sub-projetos, cada um com seu próprio ciclo de design → spec →
implementação:

1. **Fundação** (este documento) — setup do projeto, autenticação, papéis e
   navegação base
2. Cadastro de Clientes
3. Cadastro de Produtos
4. Cargas (estoque, vendas, devoluções, despesas)
5. Importação de NF-e/XML (módulo transversal usado por Cargas)

## Objetivo deste módulo

Entregar a base sobre a qual todos os módulos seguintes serão construídos:
projeto rodando em produção (Vercel + Supabase), login funcional, e um
sistema de papéis (roles) com permissões por módulo que o Admin controla
pela própria interface — sem depender de alterações manuais no banco.

## Escopo

**Dentro do escopo:**
- Setup do projeto (Next.js + Supabase + deploy Vercel)
- Tela de login
- Estrutura de navegação (sidebar + layout principal)
- Tela de Usuários/Configurações: Admin cria usuários, cria papéis
  personalizados, define quais módulos cada papel acessa
- Papéis semente: `Admin` (acesso total, fixo) e `Financeiro` (permissões
  editáveis)
- Proteção de rotas por sessão e por papel

**Fora do escopo (módulos futuros):**
- Conteúdo real das páginas de Dashboard, Cargas, Clientes e Produtos —
  entram como placeholder "em construção" nesta fase
- Qualquer lógica de negócio de estoque, vendas, devoluções ou notas
  fiscais

**Empresa única:** o sistema é de uso interno de uma única distribuidora
(não é multi-tenant).

## Stack técnica

- **Frontend:** Next.js (App Router) + TypeScript
- **UI:** Tailwind CSS + shadcn/ui, tema customizado (ver seção Visual)
- **Backend/dados:** Supabase (Postgres + Auth), Row Level Security (RLS)
  como camada de autorização no próprio banco
- **Integração Next↔Supabase:** `@supabase/ssr`, funcionando em Server
  Components, Client Components e Server Actions
- **Deploy:** Vercel

## Modelo de dados

```
profiles
  id          uuid PK (= auth.users.id)
  nome        text
  email       text
  role_id     uuid FK -> roles.id
  ativo       boolean default true
  created_at  timestamptz default now()

roles
  id          uuid PK
  nome        text
  is_system   boolean default false   -- true para Admin e Financeiro
  created_at  timestamptz default now()

role_permissions
  role_id     uuid FK -> roles.id
  module_key  text   -- 'dashboard' | 'cargas' | 'clientes' | 'produtos' | 'usuarios'
  PRIMARY KEY (role_id, module_key)
```

Regras:
- `Admin` é semeado (seed) na criação do banco, `is_system = true`, e
  sempre tem todos os `module_key` — não editável, para evitar que o
  admin perca acesso ao próprio sistema.
- `Financeiro` é semeado como ponto de partida, mas suas permissões podem
  ser editadas livremente pelo Admin.
- Papéis personalizados criados pelo Admin têm `is_system = false` e podem
  ser editados/excluídos livremente (exceto se houver usuários vinculados
  — nesse caso, bloquear exclusão até reatribuir os usuários).
- A lista de `module_key` disponíveis cresce conforme novos módulos forem
  implementados; nesta fase, os cinco listados acima são os únicos
  válidos.

## Autenticação e sessão

- Login via Supabase Auth (email + senha).
- **Sem autocadastro público.** Só o Admin cria contas.
- **Criação de usuário:** Admin preenche nome, email e papel na tela de
  Usuários. Uma Server Action (rodando com a service role key, nunca
  exposta ao cliente) cria o usuário no Supabase Auth e o `profile`
  vinculado.
- **Definição de senha:** ao criar o usuário, o Supabase dispara um e-mail
  de convite com link para o próprio usuário definir a senha, usando o
  serviço de e-mail padrão do Supabase (sem necessidade de SMTP próprio
  nesta fase).
- **Recuperação de senha:** fluxo padrão "esqueci minha senha" do
  Supabase Auth.
- **Sessão:** cookies gerenciados por `@supabase/ssr`. Um middleware do
  Next.js valida a sessão em toda rota protegida.

## Autorização (papéis e permissões)

- Middleware/layout do servidor carrega o `profile` do usuário logado e
  seus `role_permissions`.
- A sidebar só renderiza os itens de navegação cujo `module_key` está
  liberado para o papel do usuário.
- RLS nas tabelas de cada módulo (a serem criadas nos próximos módulos)
  vai checar `auth.uid()` → `profile.role_id` → `role_permissions` antes
  de liberar leitura/escrita, garantindo que a regra valha mesmo para
  acessos diretos ao banco.

## Navegação e layout

Itens fixos da sidebar (sujeitos à permissão do papel):
- 📊 Dashboard
- 📦 Cargas
- 👤 Clientes
- 🏷️ Produtos
- ⚙️ Usuários / Configurações

Estrutura: sidebar fixa à esquerda + barra superior com nome do usuário +
área de conteúdo principal. Dashboard, Cargas, Clientes e Produtos
exibem uma tela placeholder "em construção" nesta fase.

## Estilo visual

Direção aprovada: **Moderno & Vibrante**, paleta azul/preto/branco.

- Sidebar com gradiente escuro (`#0f172a` → `#1e3a5f`), texto claro,
  item ativo destacado em azul (`#38bdf8` / fundo `rgba(56,189,248,.15)`)
- Área de conteúdo em fundo branco
- Cor de destaque (botões primários, links, indicadores): tons de azul
  (`#0ea5e9` / `#0284c7`), inclusive em gradiente para elementos de
  destaque (cards, botão de login)
- Tela de login: fundo com o mesmo gradiente escuro da sidebar, cartão
  branco centralizado com o formulário

## Tratamento de erros

- Login inválido: mensagem genérica ("email ou senha incorretos"), nunca
  revela se o email existe.
- Acesso a módulo sem permissão: item não aparece na sidebar; acesso
  direto pela URL mostra tela de "acesso negado" com botão para voltar
  ao Dashboard.
- Erro ao criar usuário (ex: email duplicado): mensagem inline no
  formulário, sem derrubar a tela.
- Sessão expirada: middleware redireciona para o login preservando a URL
  de destino, para retornar a ela após autenticar.

## Testes

- Unitários: regras de permissão (dado um papel com certas permissões,
  quais `module_key` ficam visíveis/bloqueados).
- Integração: fluxo de criação de usuário (cria no Auth + cria profile +
  vincula papel corretamente).
- Verificação manual no navegador: login → sidebar filtrada por papel →
  criar usuário/papel novo → logout.
