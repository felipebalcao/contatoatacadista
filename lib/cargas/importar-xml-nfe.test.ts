import { describe, it, expect } from 'vitest'
import { extrairItensXml } from './importar-xml-nfe'

const XML_NFE_PROC_DOIS_ITENS = `<nfeProc versao="4.00">
  <NFe>
    <infNFe Id="NFe1" versao="4.00">
      <det nItem="1">
        <prod>
          <cProd>001</cProd>
          <cEAN>7891000100103</cEAN>
          <xProd>ARROZ TIPO 1 5KG</xProd>
          <qCom>10.0000</qCom>
          <vUnCom>25.5000</vUnCom>
        </prod>
      </det>
      <det nItem="2">
        <prod>
          <cProd>002</cProd>
          <cEAN>7891000200104</cEAN>
          <xProd>FEIJAO CARIOCA 1KG</xProd>
          <qCom>20.0000</qCom>
          <vUnCom>8.9000</vUnCom>
        </prod>
      </det>
    </infNFe>
  </NFe>
</nfeProc>`

const XML_NFE_SOLTA_UM_ITEM = `<NFe>
  <infNFe Id="NFe2" versao="4.00">
    <det nItem="1">
      <prod>
        <cProd>003</cProd>
        <cEAN>7891000300105</cEAN>
        <xProd>ACUCAR REFINADO 1KG</xProd>
        <qCom>15.0000</qCom>
        <vUnCom>4.2000</vUnCom>
      </prod>
    </det>
  </infNFe>
</NFe>`

const XML_SEM_INFNFE = `<algumaCoisa>
  <outraTag>conteudo</outraTag>
</algumaCoisa>`

const XML_INFNFE_SEM_DET = `<NFe>
  <infNFe Id="NFe4" versao="4.00">
    <ide><nNF>123</nNF></ide>
  </infNFe>
</NFe>`

const XML_CEAN_AUSENTE_E_SEM_GTIN = `<NFe>
  <infNFe Id="NFe5" versao="4.00">
    <det nItem="1">
      <prod>
        <cProd>004</cProd>
        <xProd>PRODUTO SEM CODIGO DE BARRAS</xProd>
        <qCom>1.0000</qCom>
        <vUnCom>10.0000</vUnCom>
      </prod>
    </det>
    <det nItem="2">
      <prod>
        <cProd>005</cProd>
        <cEAN>SEM GTIN</cEAN>
        <xProd>OUTRO PRODUTO SEM EAN</xProd>
        <qCom>2.0000</qCom>
        <vUnCom>5.0000</vUnCom>
      </prod>
    </det>
  </infNFe>
</NFe>`

const XML_QCOM_INVALIDO_NUMA_LINHA = `<NFe>
  <infNFe Id="NFe6" versao="4.00">
    <det nItem="1">
      <prod>
        <cProd>006</cProd>
        <cEAN>7891000600106</cEAN>
        <xProd>PRODUTO COM QUANTIDADE INVALIDA</xProd>
        <qCom></qCom>
        <vUnCom>10.0000</vUnCom>
      </prod>
    </det>
    <det nItem="2">
      <prod>
        <cProd>007</cProd>
        <cEAN>7891000700107</cEAN>
        <xProd>PRODUTO OK</xProd>
        <qCom>3.0000</qCom>
        <vUnCom>7.0000</vUnCom>
      </prod>
    </det>
  </infNFe>
</NFe>`

const XML_CEAN_COM_ZERO_A_ESQUERDA = `<NFe>
  <infNFe Id="NFe7" versao="4.00">
    <det nItem="1">
      <prod>
        <cProd>008</cProd>
        <cEAN>0123456789012</cEAN>
        <xProd>PRODUTO COM EAN COMECANDO EM ZERO</xProd>
        <qCom>1.0000</qCom>
        <vUnCom>1.0000</vUnCom>
      </prod>
    </det>
  </infNFe>
</NFe>`

const XML_MALFORMADO = `<NFe><infNFe>texto sem fechar as tags corretamente`

describe('extrairItensXml', () => {
  it('extrai os itens de um XML com wrapper nfeProc e 2 itens', () => {
    const resultado = extrairItensXml(XML_NFE_PROC_DOIS_ITENS)
    if ('erro' in resultado) throw new Error('esperava sucesso')
    expect(resultado.itens).toHaveLength(2)
    expect(resultado.itens[0]).toEqual({
      codigo_barras: '7891000100103',
      descricao_xml: 'ARROZ TIPO 1 5KG',
      quantidade: 10,
      valor_unitario: 25.5,
      erro: null,
    })
    expect(resultado.itens[1].codigo_barras).toBe('7891000200104')
  })

  it('extrai corretamente uma NFe solta (sem nfeProc) com exatamente 1 item', () => {
    const resultado = extrairItensXml(XML_NFE_SOLTA_UM_ITEM)
    if ('erro' in resultado) throw new Error('esperava sucesso')
    expect(resultado.itens).toHaveLength(1)
    expect(resultado.itens[0].codigo_barras).toBe('7891000300105')
    expect(resultado.itens[0].quantidade).toBe(15)
  })

  it('retorna erro quando o XML não tem infNFe', () => {
    const resultado = extrairItensXml(XML_SEM_INFNFE)
    expect(resultado).toEqual({ erro: 'Este arquivo não parece ser o XML de uma NF-e.' })
  })

  it('retorna erro quando infNFe não tem nenhum det', () => {
    const resultado = extrairItensXml(XML_INFNFE_SEM_DET)
    expect(resultado).toEqual({ erro: 'Esta nota não tem itens para importar.' })
  })

  it('trata cEAN ausente e "SEM GTIN" como código de barras nulo', () => {
    const resultado = extrairItensXml(XML_CEAN_AUSENTE_E_SEM_GTIN)
    if ('erro' in resultado) throw new Error('esperava sucesso')
    expect(resultado.itens[0].codigo_barras).toBeNull()
    expect(resultado.itens[1].codigo_barras).toBeNull()
  })

  it('marca erro só na linha com quantidade inválida, sem afetar as outras', () => {
    const resultado = extrairItensXml(XML_QCOM_INVALIDO_NUMA_LINHA)
    if ('erro' in resultado) throw new Error('esperava sucesso')
    expect(resultado.itens).toHaveLength(2)
    expect(resultado.itens[0].erro).toBe('Quantidade ou valor unitário inválido nesta linha.')
    expect(resultado.itens[1].erro).toBeNull()
    expect(resultado.itens[1].quantidade).toBe(3)
  })

  it('preserva o zero à esquerda do código de barras', () => {
    const resultado = extrairItensXml(XML_CEAN_COM_ZERO_A_ESQUERDA)
    if ('erro' in resultado) throw new Error('esperava sucesso')
    expect(resultado.itens[0].codigo_barras).toBe('0123456789012')
  })

  it('retorna erro para um arquivo que não é XML válido', () => {
    const resultado = extrairItensXml(XML_MALFORMADO)
    expect(resultado).toEqual({ erro: 'Não foi possível ler o arquivo. Verifique se é um XML válido.' })
  })
})
