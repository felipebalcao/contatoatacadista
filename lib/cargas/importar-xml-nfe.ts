import { XMLParser, XMLValidator } from 'fast-xml-parser'

export interface ItemExtraidoXml {
  codigo_barras: string | null
  descricao_xml: string
  quantidade: number | null
  valor_unitario: number | null
  erro: string | null
}

export type ResultadoExtracaoXml = { itens: ItemExtraidoXml[] } | { erro: string }

function numeroOuNulo(valor: unknown): number | null {
  if (valor === undefined || valor === null) return null
  const texto = String(valor).trim()
  if (texto === '') return null
  const numero = Number(texto)
  return Number.isFinite(numero) ? numero : null
}

export function extrairItensXml(xmlConteudo: string): ResultadoExtracaoXml {
  const validacao = XMLValidator.validate(xmlConteudo)
  if (validacao !== true) {
    return { erro: 'Não foi possível ler o arquivo. Verifique se é um XML válido.' }
  }

  const parser = new XMLParser({
    isArray: (nome) => nome === 'det',
    parseTagValue: false,
  })

  const documento = parser.parse(xmlConteudo) as Record<string, unknown>
  const nfeProc = documento.nfeProc as Record<string, unknown> | undefined
  const nfe = (nfeProc?.NFe ?? documento.NFe) as Record<string, unknown> | undefined
  const infNFe = nfe?.infNFe as Record<string, unknown> | undefined

  if (!infNFe) {
    return { erro: 'Este arquivo não parece ser o XML de uma NF-e.' }
  }

  const detalhes = infNFe.det as Record<string, unknown>[] | undefined
  if (!detalhes || detalhes.length === 0) {
    return { erro: 'Esta nota não tem itens para importar.' }
  }

  const itens: ItemExtraidoXml[] = detalhes.map((det) => {
    const prod = det.prod as Record<string, unknown> | undefined
    if (!prod) {
      return {
        codigo_barras: null,
        descricao_xml: '',
        quantidade: null,
        valor_unitario: null,
        erro: 'Item sem dados de produto.',
      }
    }

    const cean = prod.cEAN != null ? String(prod.cEAN).trim() : ''
    const codigoBarras = cean === '' || cean.toUpperCase() === 'SEM GTIN' ? null : cean
    const descricao = prod.xProd != null ? String(prod.xProd) : ''
    const quantidade = numeroOuNulo(prod.qCom)
    const valorUnitario = numeroOuNulo(prod.vUnCom)

    if (quantidade === null || valorUnitario === null) {
      return {
        codigo_barras: codigoBarras,
        descricao_xml: descricao,
        quantidade,
        valor_unitario: valorUnitario,
        erro: 'Quantidade ou valor unitário inválido nesta linha.',
      }
    }

    return {
      codigo_barras: codigoBarras,
      descricao_xml: descricao,
      quantidade,
      valor_unitario: valorUnitario,
      erro: null,
    }
  })

  return { itens }
}
