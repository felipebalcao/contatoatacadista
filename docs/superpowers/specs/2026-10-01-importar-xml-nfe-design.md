# Importação de itens de carga via XML de NF-e — Design Spec

## Contexto

Hoje, montar a lista de itens de uma carga significa adicionar produto por produto manualmente no formulário de carga (`components/cargas/carga-form.tsx` + `adicionar-produto-modal.tsx`). Quando o fornecedor manda o XML da NF-e junto com a carga, essa nota já tem todos os produtos, quantidades e preços de compra — a ideia é aproveitar esse arquivo pra preencher a lista de uma vez, casando cada item da nota com um produto já cadastrado no sistema (por código de barras), e deixando uma tela de revisão pra confirmar ou corrigir antes de entrar na carga.

## Escopo

**Dentro do escopo:**
- Upload de um arquivo XML de NF-e (schema padrão SEFAZ 4.00) dentro do formulário de criar/editar carga.
- Casamento automático de cada item da nota com um produto cadastrado, por código de barras (`cEAN` ↔ `produtos.codigo_barras`).
- Tela de revisão: cada item do XML vira uma linha editável (produto, quantidade, valor unitário), com indicação visual de se casou automático ou precisa de escolha manual.
- Itens sem casamento automático (ou ambíguos — mais de um produto com o mesmo código de barras) exigem seleção manual do produto antes de confirmar.
- Itens com erro de leitura (quantidade/valor inválido no XML) exigem correção manual antes de confirmar.
- Ao confirmar, os itens entram na mesma lista (`itens`) já usada pelo resto do formulário de carga — **nenhuma escrita no banco acontece na importação em si**; o salvamento continua sendo só quando o usuário clica em "Salvar carga", via as funções atômicas já existentes (`criar_carga_com_itens`/`atualizar_carga_com_itens`, inalteradas).
- Se um produto do XML já está na lista atual da carga (de uma adição manual anterior, ou de uma importação de XML anterior na mesma sessão de edição), soma as quantidades e usa o valor unitário do XML (mais recente).
- Múltiplos uploads de XML na mesma carga são permitidos (cada upload soma aos itens já presentes, pela mesma regra acima).
- Se o PRÓPRIO XML tiver duas linhas (`<det>`) que casam com o mesmo produto (ex: a nota lista o mesmo item em dois lotes), elas aparecem como duas linhas distintas na tela de revisão — a soma só acontece no momento de mesclar com a lista final da carga (mesma regra de duplicado), nunca escondendo uma linha do XML automaticamente antes da revisão.

**Fora do escopo:**
- Criar produtos novos a partir do XML — só vincula a produtos que já existem. Um item sem produto correspondente precisa ser associado manualmente a um produto existente (não cria um novo).
- Vincular pelo nome do produto (`xProd`) — usado só como texto de referência na tela de revisão, nunca para casamento automático.
- Suporte a layouts de XML fora do padrão NF-e 4.00 (NFC-e, CT-e, layouts antigos). Pode precisar de ajuste depois, quando testado contra um XML real de um fornecedor específico — nenhum arquivo de exemplo estava disponível no momento desta spec.
- Qualquer alteração no schema do banco — esta feature não precisa de nenhuma migração nova.
- Edição do campo `unidade` do produto a partir do XML (`uCom` da nota é só informativo na tela de revisão, nunca grava nada — `produtos.unidade` é um atributo fixo do cadastro).

## Arquitetura

```
Usuário seleciona o arquivo .xml
        │
        ▼
components/cargas/importar-xml-modal.tsx (client)
  lê o arquivo como texto (FileReader)
        │
        ▼
actions/xml-nfe-actions.ts → importarXmlNfe(xmlConteudo) [Server Action]
  1. assertModuleAccess('cargas')
  2. lib/cargas/importar-xml-nfe.ts → extrairItensXml(xmlConteudo)  [função pura, sem acesso a banco]
  3. busca produtos por codigo_barras (uma query .in(...) com todos os EANs extraídos)
  4. monta a lista de ItemXmlNfe (casado / manual / erro)
        │
        ▼
Modal mostra a tabela de revisão (editável)
        │
        ▼
Usuário confirma → onImportar(itens: ItemCargaLocal[]) devolve pro carga-form.tsx,
que mescla (soma quantidade se produto já estava na lista) — sem tocar no banco.
```

A separação entre `extrairItensXml` (parsing puro, testável sem banco) e `importarXmlNfe` (Server Action, faz a consulta de produtos) segue o mesmo padrão já usado entre `lib/cargas/resumo.ts` (cálculo puro) e as Server Actions que o alimentam.

## Parsing do XML

Biblioteca nova: `fast-xml-parser` (leve, sem dependências, parsing síncrono).

Aceita dois formatos de raiz:
- `<nfeProc><NFe><infNFe>...` (nota com protocolo de autorização anexado — formato mais comum)
- `<NFe><infNFe>...` sozinho

Para cada `<det>` dentro de `infNFe`, extrai de `<prod>`:
- `cEAN` → código de barras (string; pode vir `"SEM GTIN"`, tratado como ausente)
- `xProd` → descrição do produto na nota (só exibição, nunca usado pra casamento)
- `qCom` → quantidade (string numérica, ex: `"10.0000"`)
- `vUnCom` → valor unitário de compra (string numérica, ex: `"25.5000"`)

Se `infNFe` não existir no XML → erro "Este arquivo não parece ser o XML de uma NF-e."
Se não houver nenhum `<det>` → erro "Esta nota não tem itens para importar."
Se um item individual tiver `qCom`/`vUnCom` ilegível → essa linha entra com `status: 'erro'`, sem derrubar as outras linhas.

## Casamento automático de produtos

Depois do parsing, a Server Action coleta todos os `cEAN` não vazios dos itens e faz uma única consulta:

```ts
supabase.from('produtos').select('id, codigo, nome, unidade, codigo_barras').in('codigo_barras', eans).eq('ativo', true)
```

Para cada item do XML:
- Sem `cEAN` → `status: 'manual'`, nenhum produto pré-selecionado.
- `cEAN` casa com exatamente 1 produto ativo → `status: 'casado'`, produto pré-selecionado.
- `cEAN` casa com 0 produtos → `status: 'manual'`.
- `cEAN` casa com 2+ produtos (não há `unique` em `produtos.codigo_barras` hoje) → tratado como ambíguo, `status: 'manual'` (nunca escolhe um dos dois arbitrariamente).

## Interfaces TypeScript

Novo arquivo `lib/cargas/importar-xml-nfe.ts`:

```ts
export interface ItemExtraidoXml {
  codigo_barras: string | null
  descricao_xml: string
  quantidade: number | null
  valor_unitario: number | null
  erro: string | null
}

export function extrairItensXml(xmlConteudo: string): { itens: ItemExtraidoXml[] } | { erro: string }
```

Novo tipo em `lib/types/database.ts` (ou direto em `actions/xml-nfe-actions.ts`, decidido na fase de implementação):

```ts
export interface ItemXmlNfe {
  codigo_barras: string | null
  descricao_xml: string
  quantidade: number | null
  valor_unitario: number | null
  produto_id: string | null
  produto_codigo: string | null
  produto_nome: string | null
  produto_unidade: string | null
  status: 'casado' | 'manual' | 'erro'
  mensagem_erro: string | null
}
```

## Server Action

`actions/xml-nfe-actions.ts`:

```ts
export async function importarXmlNfe(xmlConteudo: string): Promise<ResultadoAcao<ItemXmlNfe[]>>
```

- `assertModuleAccess('cargas')` primeiro, como toda ação do módulo.
- Erros de parsing (arquivo inválido, não é NF-e, sem itens) voltam como `{ sucesso: false, erro: string }` — nunca lançados.
- Sucesso devolve a lista completa de `ItemXmlNfe` (inclusive os com `status: 'manual'`/`'erro'`) — a decisão de bloquear a confirmação até tudo estar resolvido é da UI, não da Server Action.

## UI

Novo componente `components/cargas/importar-xml-modal.tsx`, no mesmo espírito do `adicionar-produto-modal.tsx` já existente, em 2 passos internos:

**Passo 1 — Upload:** campo de arquivo (`accept=".xml"`), botão "Importar". Ao selecionar, lê como texto e chama `importarXmlNfe` via `startTransition`. Erro de parsing aparece aqui, sem avançar pro passo 2.

**Passo 2 — Revisão:** tabela com uma linha por item retornado, cada uma com:
- Selo de status: "Casado automaticamente" (verde) / "Selecione o produto" (âmbar) / "Erro" (vermelho).
- `<select>` de produto (mesma lista `produtosDisponiveis` já usada no resto do formulário), pré-selecionado quando `status === 'casado'`.
- Campos de quantidade e valor unitário editáveis (pré-preenchidos do XML).
- Descrição do XML (`descricao_xml`) como texto de referência, não editável.
- Botão "Remover" por linha.

O botão "Confirmar importação" fica desabilitado enquanto existir alguma linha sem produto selecionado ou com valores inválidos — força o usuário a resolver ou remover cada linha problemática antes de prosseguir (nada entra na carga pela metade).

Ao confirmar, o modal chama `onImportar(itens: ItemCargaLocal[])`. Em `carga-form.tsx`, o handler dessa prop mescla cada item na lista `itens` já existente: se o `produto_id` já está presente, soma a quantidade e substitui o valor unitário pelo do XML; senão, adiciona como novo item — mesma função que `handleConfirmarItem` já usa como padrão de atualização de lista, só que em lote.

Novo botão "Importar XML da NF-e" ao lado do já existente "Adicionar produto" em `carga-form.tsx`.

## Testes

- `lib/cargas/importar-xml-nfe.test.ts`: testes unitários puros (sem banco) para `extrairItensXml`, usando strings XML literais como fixture:
  - XML válido com `nfeProc` wrapper, 2+ itens, todos os campos presentes.
  - XML válido com `NFe` solto (sem `nfeProc`).
  - XML sem `infNFe` → erro.
  - XML com `infNFe` mas sem nenhum `det` → erro.
  - Item com `cEAN` ausente ou `"SEM GTIN"` → `codigo_barras: null`.
  - Item com `qCom`/`vUnCom` ilegível → `erro` preenchido nesse item, outros itens não afetados.
- `actions/xml-nfe-actions.test.ts`: testes de integração (como os demais deste módulo, batendo no Supabase Cloud real) cobrindo:
  - Produto com `codigo_barras` correspondente → `status: 'casado'`.
  - Nenhum produto com aquele `codigo_barras` → `status: 'manual'`.
  - Dois produtos com o mesmo `codigo_barras` → `status: 'manual'` (ambíguo), não escolhe nenhum.
  - Produto inativo com `codigo_barras` correspondente → não casa (mesmo filtro `ativo = true` já usado em `listProdutosAtivos`).
  - Usuário sem acesso ao módulo `cargas` → `assertModuleAccess` lança "Acesso negado.".
- Sem teste automatizado pro componente `importar-xml-modal.tsx` (UI pura), seguindo a mesma convenção já usada pelos outros modais deste módulo — verificação manual no navegador ao final.
