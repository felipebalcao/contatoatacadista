# Importação em massa via CSV (Clientes, Produtos, Fornecedores)

**Data:** 2026-09-29
**Status:** Aprovado para implementação

## Contexto

Cadastrar clientes, produtos e fornecedores um a um pelos formulários existentes é lento para quem já tem essa base numa planilha. Este módulo adiciona um fluxo de importação em massa via arquivo `.csv` aos três cadastros já existentes ([docs/superpowers/specs/2026-09-01-clientes-design.md](2026-09-01-clientes-design.md), [docs/superpowers/specs/2026-09-03-produtos-design.md](2026-09-03-produtos-design.md), [docs/superpowers/specs/2026-09-03-fornecedores-design.md](2026-09-03-fornecedores-design.md)).

Clientes e Fornecedores têm exatamente o mesmo formato de cadastro (PF/PJ, documento, endereço). Produtos é bem mais simples (5 campos, sem PF/PJ). Por isso, este spec constrói **um motor de importação genérico e reaproveitável**, e conecta os três módulos a ele — em vez de três implementações paralelas quase idênticas.

## Escopo

**Dentro do escopo:**
- Botão "Importar CSV" na listagem de cada um dos três módulos, ao lado do botão "Novo ...".
- Tela de importação por módulo (`/clientes/importar`, `/produtos/importar`, `/fornecedores/importar`): selecionar arquivo → mapear colunas ("de para") → revisar prévia com validação → confirmar → resultado.
- Mapeamento automático sugerido comparando o cabeçalho do CSV com os campos de cada módulo (com tolerância a acento/maiúscula e um pequeno conjunto de apelidos por campo, ex: "cpf"/"cnpj" para `documento`).
- Detecção automática de PF/PJ pelo tamanho do documento (11 dígitos = CPF/PF, 14 = CNPJ/PJ) em Clientes e Fornecedores — não existe coluna "tipo" no CSV.
- Validação linha a linha na prévia, reaproveitando as mesmas regras dos formulários (campos obrigatórios, dígito verificador do documento).
- Aviso de duplicidade já na prévia (documento/código já cadastrado), consultando o banco uma única vez ao entrar na prévia — mais um aviso de duplicidade dentro do próprio arquivo (duas linhas com o mesmo documento/código).
- Importação parcial: linhas válidas e não duplicadas são gravadas; linhas com erro ou duplicadas são puladas e listadas no resultado.
- Gravação reaproveitando as Server Actions de criar já existentes (`createCliente`/`createProduto`/`createFornecedor`), uma chamada por linha — sem duplicar a lógica de validação/unicidade do servidor.

**Fora do escopo:**
- Atualizar cadastros existentes via CSV (a duplicidade sempre pula, nunca sobrescreve).
- Editar/excluir em massa.
- Salvar um "perfil" de mapeamento entre importações diferentes.
- Importação de outros formatos (Excel, XML) — só `.csv`.
- Desfazer uma importação já confirmada.

## Arquitetura

Um componente client genérico, `<ImportadorCsv>`, dirige as quatro etapas (upload, mapear, revisar, resultado) e é configurado por módulo através de um objeto `ConfiguracaoImportacao<T>`:

```ts
export interface CampoImportacao {
  chave: string          // nome do campo no tipo Input do módulo, ex: "documento"
  rotulo: string         // rótulo exibido, ex: "Documento (CPF/CNPJ)"
  obrigatorio: boolean
  apelidos?: string[]    // variações de cabeçalho reconhecidas automaticamente
}

export interface LinhaImportacao<T> {
  numero: number                 // linha no CSV (1 = primeira linha de dados)
  bruta: Record<string, string>  // valores brutos das colunas mapeadas
  valores: T | null               // valores convertidos, só quando válida
  status: 'ok' | 'erro' | 'duplicada'
  mensagens: string[]
  incluir: boolean                // permite desmarcar uma linha antes de confirmar
}

export interface ResultadoImportacao {
  criados: number
  pulados: { linha: number; motivo: string }[]
}

export interface ConfiguracaoImportacao<T> {
  tituloModulo: string             // "clientes", "produtos", "fornecedores"
  campos: CampoImportacao[]
  validarLinha: (bruta: Record<string, string>) => { valores: T | null; mensagens: string[] }
  chaveUnica: (valores: T) => string
  listarChavesExistentes: () => Promise<string[]>
  importar: (linhas: T[]) => Promise<ResultadoImportacao>
  linkListagem: string             // para onde volta ao terminar, ex: "/clientes"
}
```

`validarLinha` roda no navegador e reaproveita o que os formulários já usam (`validarDocumento`, checagem de campo obrigatório) — nenhuma regra nova é inventada. `chaveUnica` extrai o valor usado para detectar duplicidade (documento normalizado para Clientes/Fornecedores, código para Produtos). `listarChavesExistentes` é uma nova Server Action pequena por módulo, chamada uma vez ao entrar na etapa de revisão. `importar` é a nova Server Action de gravação em lote.

### Fluxo

1. **Selecionar arquivo** — `<input type="file" accept=".csv">`. O arquivo é lido e parseado no navegador com `papaparse` (`header: true, skipEmptyLines: true`, delimitador detectado automaticamente — cobre tanto `,` quanto `;`, comum em exportações de planilha brasileira).
2. **Mapear colunas** — para cada campo de `campos`, um `<select>` com as colunas do CSV. Pré-selecionado quando o nome da coluna (normalizado: minúsculo, sem acento, sem pontuação) bate com o `rotulo`, a `chave` ou algum `apelido` do campo. Campos obrigatórios sem coluna mapeada bloqueiam o avanço.
3. **Revisar** — aplica `validarLinha` em cada linha usando o mapeamento; busca `listarChavesExistentes()` uma vez e marca como `'duplicada'` qualquer linha cuja `chaveUnica` já exista no banco **ou** já tenha aparecido numa linha anterior do próprio arquivo. Mostra uma tabela: número da linha, campos mapeados, status (badge ok/erro/duplicada), motivo quando houver, e um checkbox `incluir` (desmarcado por padrão para `erro`/`duplicada`, marcado para `ok`). Um resumo no topo mostra quantas linhas de cada status. Botão "Importar N linhas" usa a contagem de `incluir` marcados.
4. **Confirmar** — chama `importar(linhas)` só com as linhas marcadas e com `status === 'ok'`. A Server Action chama a ação de criar existente do módulo para cada linha; uma violação de unicidade (documento/código já existe — pode ter mudado entre a revisão e a confirmação) é convertida em "pulado", não em erro fatal; qualquer outro erro do servidor também vira "pulado" com o motivo.
5. **Resultado** — quantos foram criados, lista de pulados com o motivo, e um link para a listagem ou para importar outro arquivo.

## Módulos

Cada módulo ganha um arquivo de configuração (`components/<modulo>/importar-<modulo>-config.ts`) e duas Server Actions novas.

**Produtos** (`actions/produto-actions.ts`): campos `codigo*`, `nome*`, `unidade*`, `codigo_barras`, `categoria`. `chaveUnica` = `codigo` (aparado). Novas actions: `listCodigosProdutos(): Promise<string[]>`, `importarProdutos(linhas: ProdutoInput[]): Promise<ResultadoImportacao>`.

**Clientes** (`actions/cliente-actions.ts`): campos `documento*`, `nome*`, `nome_fantasia`, `telefone`, `email`, `endereco_rua`, `endereco_numero`, `endereco_bairro`, `endereco_cidade`, `endereco_uf`, `endereco_cep`, `observacoes`. `tipo` é derivado do tamanho do documento normalizado dentro de `validarLinha` (11 dígitos → `pf`, 14 → `pj`); um documento com qualquer outro tamanho não tem `tipo` definido e a linha cai em `status: 'erro'` com "Documento inválido." — mesma mensagem usada no formulário manual. `chaveUnica` = `documento` (normalizado). Novas actions: `listDocumentosClientes(): Promise<string[]>`, `importarClientes(linhas: ClienteInput[]): Promise<ResultadoImportacao>`.

**Fornecedores** (`actions/fornecedor-actions.ts`): idêntico a Clientes. Novas actions: `listDocumentosFornecedores(): Promise<string[]>`, `importarFornecedores(linhas: FornecedorInput[]): Promise<ResultadoImportacao>`.

## Autorização

`listDocumentosClientes`/`listCodigosProdutos`/`listDocumentosFornecedores` e as três `importar*` chamam `assertModuleAccess('clientes'|'produtos'|'fornecedores')` como primeira linha, mesmo padrão das demais Server Actions desses módulos. As páginas `/clientes/importar`, `/produtos/importar`, `/fornecedores/importar` são protegidas por `requireModuleAccess`, mesmo padrão das páginas `novo`/`editar`. Nenhuma tabela ou policy nova — só reaproveita as tabelas e o RLS já existentes de cada módulo.

## Tratamento de erros

- Arquivo vazio ou sem nenhuma linha de dados: mensagem na etapa de upload, sem avançar.
- Campo obrigatório sem coluna mapeada: bloqueia o avanço para a revisão, com a lista dos campos faltando.
- Linha com erro de validação (documento inválido, campo obrigatório vazio): status `'erro'` na revisão, com a mensagem específica; não é enviada na confirmação a menos que o usuário a exclua da seleção primeiro (o que não corrige o dado — na prática, uma linha `'erro'` deve ser corrigida no CSV original e reimportada à parte).
- Linha duplicada (no banco ou dentro do próprio arquivo): status `'duplicada'`, não enviada por padrão.
- Erro do servidor durante a gravação (unicidade, RLS, rede): a linha específica cai em "pulados" no resultado, com o motivo; as demais linhas continuam sendo processadas — uma falha isolada não aborta a importação inteira.

## Testes

- Unitário: `lib/importacao/normalizar.ts` (acentos, maiúsculas, pontuação); a lógica de sugestão de mapeamento (rótulo, chave e apelidos batendo com variações de cabeçalho); `validarLinha` de cada módulo (campo obrigatório faltando, documento inválido, detecção de tipo PF/PJ pelo tamanho do documento).
- Integração: `importarClientes`/`importarProdutos`/`importarFornecedores` contra o Supabase real — cria múltiplas linhas válidas, confirma que uma linha com documento/código já existente é reportada como pulada (não gera erro nem duplicata), confirma o guard de `assertModuleAccess`.
- Verificação manual no navegador: montar um CSV pequeno (cabeçalhos em ordem diferente dos campos, um CPF e um CNPJ, uma linha com documento inválido, uma linha repetida), confirmar o mapeamento automático, revisar a prévia, importar, e conferir a listagem depois.
