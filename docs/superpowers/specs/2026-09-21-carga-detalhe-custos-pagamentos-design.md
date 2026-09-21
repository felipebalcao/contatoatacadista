# Tela da carga, Custos extras e Pagamentos

**Data:** 2026-09-21
**Status:** Aprovado para implementação

## Contexto

O módulo de Cargas ([docs/superpowers/specs/2026-09-04-cargas-design.md](2026-09-04-cargas-design.md)) hoje tem listagem, "Nova carga" e "Editar carga". Cada carga passa a ter uma **tela de detalhe** com abas e um resumo financeiro. O pedido completo tem quatro abas (Custos, Pagamentos, Vendas, Devoluções) e três indicadores novos (Faturamento, Lucro líquido, Pago/Falta). Por serem sub-sistemas de complexidade bem diferente, o trabalho foi dividido em três etapas, cada uma com seu spec, plano e implementação:

1. **Etapa 1 (este spec):** tela de detalhe da carga + aba Custos + aba Pagamentos + Pago/Falta na listagem.
2. **Etapa 2:** aba Vendas (faturamento, baixa de estoque por carga, cliente) e os cards Faturamento e Lucro líquido.
3. **Etapa 3:** aba Devoluções (item, quantidade, observação, e a opção de voltar ou não ao estoque).

## Escopo (etapa 1 de 3)

**Dentro do escopo:**
- Nova tela `/cargas/[id]` com cabeçalho, cartões de resumo e abas Itens, Custos e Pagamentos
- Custos extras da carga (transporte, comissão, descarga etc.): criar, editar e excluir
- Pagamentos da carga: criar, editar e excluir
- Resumo: Custo total, Custos extras, Pago e Falta pagar
- Listagem `/cargas`: nome da carga vira link para o detalhe; novas colunas Pago e Falta

**Fora do escopo:**
- Vendas, Faturamento, Lucro líquido (etapa 2) e Devoluções (etapa 3). As abas e cartões só aparecem quando existirem.
- Fórmula do lucro líquido, já decidida para a etapa 2: **Faturamento − Custo total − Custos extras**.
- Forma de pagamento (Pix, boleto...), parcelas e vencimentos
- Bloquear lançamentos em carga inativa (não há restrição nesta etapa)

## Modelo de dados

```
custos_carga
  id          uuid PK default gen_random_uuid()
  carga_id    uuid not null references cargas(id) on delete cascade
  categoria   text not null
  descricao   text
  valor       numeric not null check (valor > 0)
  data        date not null
  created_at  timestamptz not null default now()

pagamentos_carga
  id          uuid PK default gen_random_uuid()
  carga_id    uuid not null references cargas(id) on delete cascade
  data        date not null
  valor       numeric not null check (valor > 0)
  observacao  text
  created_at  timestamptz not null default now()
```

Regras:
- `categoria` é texto livre. O formulário oferece sugestões (Transporte, Comissão, Descarga) por `<datalist>`, mas aceita qualquer valor.
- Nenhum total é armazenado. Tudo é calculado na hora (ver "Cálculos").
- Migração: `supabase/migrations/0006_cargas_lancamentos.sql`.

## Autorização (RLS)

Ambas as tabelas: RLS habilitada, com policies de `select`, `insert`, `update` e `delete` usando `has_module_access('cargas')`.

Assim como `itens_carga`, estas tabelas **têm** policy de `delete` — exceção deliberada ao padrão "sem delete" dos cadastros, porque o requisito é poder excluir um lançamento errado. Nada depende ainda destes lançamentos (o único consumidor é o resumo, calculado na hora), então excluir de verdade é seguro. Se a etapa 2 ou 3 passar a referenciá-los, isso deve ser revisto.

As Server Actions usam `createAdminClient()` (service role), que ignora RLS: a autorização real é `assertModuleAccess('cargas')` como primeira linha de cada ação, e as policies são defesa em profundidade, como nos módulos anteriores.

## Cálculos

Função pura em `lib/cargas/resumo.ts`:

```ts
calcularResumoCarga(
  itens: { quantidade: number; valor_unitario: number }[],
  custos: { valor: number }[],
  pagamentos: { valor: number }[]
): { custoTotal: number; custosExtras: number; pago: number; falta: number }
```

- `custoTotal` = soma de `quantidade × valor_unitario` dos itens
- `custosExtras` = soma dos `valor` dos custos
- `pago` = soma dos `valor` dos pagamentos
- `falta` = `custoTotal − pago`. **Os custos extras não entram na conta do que falta pagar** (os pagamentos quitam o valor dos itens da carga). `falta` pode ficar negativo: a tela mostra isso em destaque como "Pago a mais", sem esconder.

## Server Actions

`actions/carga-lancamentos-actions.ts`. Toda ação chama `await assertModuleAccess('cargas')` primeiro, e todo insert/update enumera as colunas explicitamente (sem espalhar o input).

- Custos: `listCustos(cargaId)`, `createCusto(cargaId, input)`, `updateCusto(id, input)`, `deleteCusto(id)`
- Pagamentos: `listPagamentos(cargaId)`, `createPagamento(cargaId, input)`, `updatePagamento(id, input)`, `deletePagamento(id)`

Tipos em `lib/types/database.ts`:
- `Custo` e `Pagamento` (a linha completa)
- `CustoInput = { categoria: string; descricao: string | null; valor: number; data: string }`
- `PagamentoInput = { valor: number; data: string; observacao: string | null }`

Validação no servidor (fonte da verdade), com mensagens em português:
- `valor` precisa ser um número finito maior que zero
- `data` precisa estar no formato `YYYY-MM-DD` e ser uma data válida
- `categoria` é aparada (`trim`) e não pode ficar vazia

`listCargas` (em `actions/carga-actions.ts`) passa a trazer também `pagamentos_carga(valor)` e a devolver `pago` e `falta` em cada `CargaResumo`, calculados com a mesma função pura.

## Telas

- **`/cargas/[id]`** (nova, protegida por `requireModuleAccess('cargas')`): carga inexistente → 404.
  - Cabeçalho: nome, fornecedor, data e botão "Editar carga" (leva para `/cargas/[id]/editar`, que não muda).
  - Quatro cartões: Custo total, Custos extras, Pago e Falta pagar (com o destaque de "Pago a mais").
  - Abas por `?aba=itens|custos|pagamentos`, padrão `itens`; valor inválido cai em `itens`. As abas são links, renderizadas no servidor.
  - **Itens:** tabela somente leitura (produto, quantidade, valor unitário, subtotal).
  - **Custos:** tabela (data, categoria, descrição, valor) com Editar e Excluir por linha; botão "Novo custo".
  - **Pagamentos:** tabela (data, valor, observação) com Editar e Excluir por linha; botão "Novo pagamento".
- Novo e Editar abrem um modal (o `Dialog` de `components/ui/dialog.tsx`). A data de um lançamento novo vem preenchida com hoje (`dataHojeSaoPaulo`). Ao salvar ou excluir, a tela chama `router.refresh()` e os cartões se atualizam.
- Excluir pede confirmação antes de apagar.
- **`/cargas`** (listagem): o nome da carga vira link para o detalhe; novas colunas Pago e Falta.

## Tratamento de erros

- Falhas de Server Action aparecem no modal, sem fechar. Mensagens dizem o que corrigir ("Informe um valor maior que zero.").
- Valor, data ou categoria inválidos: rejeitados pela ação mesmo que o navegador deixe passar.
- Carga inexistente em `/cargas/[id]`: 404 padrão. Lançamento inexistente ao editar ou excluir: erro amigável.
- Sem permissão em `cargas`: mesmo comportamento dos outros módulos.

## Testes

- Unitário: `calcularResumoCarga` (sem itens, com itens, custos extras fora do "falta", pago igual, maior e menor que o custo total).
- Integração contra o Supabase real (`tests/carga-lancamentos-actions.test.ts`): criar, listar, editar e excluir custo e pagamento; rejeitar valor `<= 0`, data inválida e categoria vazia; `listCargas` devolvendo `pago` e `falta` corretos; guard de `assertModuleAccess` em uma ação de cada tipo.
- Verificação manual no navegador: abrir uma carga, alternar as abas, lançar/editar/excluir custo e pagamento, conferir os cartões, pagar a mais, e ver Pago e Falta na listagem.
