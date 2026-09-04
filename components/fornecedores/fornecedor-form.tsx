'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createFornecedor, updateFornecedor } from '@/actions/fornecedor-actions'
import { validarDocumento } from '@/lib/validation/documento'
import type { Fornecedor, FornecedorInput, TipoCliente } from '@/lib/types/database'

export function FornecedorForm({ fornecedor }: { fornecedor?: Fornecedor }) {
  const router = useRouter()
  const [tipo, setTipo] = useState<TipoCliente>(fornecedor?.tipo ?? 'pf')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const isEditing = Boolean(fornecedor)

  function handleSubmit(formData: FormData) {
    setError(null)

    const documento = formData.get('documento') as string

    if (!validarDocumento(tipo, documento)) {
      setError('Documento inválido.')
      return
    }

    const input: FornecedorInput = {
      tipo,
      documento,
      nome: formData.get('nome') as string,
      nome_fantasia: tipo === 'pj' ? (formData.get('nome_fantasia') as string) || null : null,
      telefone: (formData.get('telefone') as string) || null,
      email: (formData.get('email') as string) || null,
      endereco_rua: (formData.get('endereco_rua') as string) || null,
      endereco_numero: (formData.get('endereco_numero') as string) || null,
      endereco_bairro: (formData.get('endereco_bairro') as string) || null,
      endereco_cidade: (formData.get('endereco_cidade') as string) || null,
      endereco_uf: (formData.get('endereco_uf') as string) || null,
      endereco_cep: (formData.get('endereco_cep') as string) || null,
      observacoes: (formData.get('observacoes') as string) || null,
    }

    startTransition(async () => {
      try {
        if (isEditing && fornecedor) {
          await updateFornecedor(fornecedor.id, input)
        } else {
          await createFornecedor(input)
        }
        router.push('/fornecedores')
        router.refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erro ao salvar fornecedor.')
      }
    })
  }

  return (
    <form action={handleSubmit} className="space-y-6 max-w-2xl">
      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex gap-4">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="radio"
            name="tipo"
            value="pf"
            checked={tipo === 'pf'}
            onChange={() => setTipo('pf')}
          />
          Pessoa Física
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="radio"
            name="tipo"
            value="pj"
            checked={tipo === 'pj'}
            onChange={() => setTipo('pj')}
          />
          Pessoa Jurídica
        </label>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="documento">{tipo === 'pf' ? 'CPF' : 'CNPJ'}</Label>
          <Input id="documento" name="documento" defaultValue={fornecedor?.documento} required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="nome">{tipo === 'pf' ? 'Nome completo' : 'Razão social'}</Label>
          <Input id="nome" name="nome" defaultValue={fornecedor?.nome} required />
        </div>
      </div>

      {tipo === 'pj' && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="nome_fantasia">Nome fantasia</Label>
          <Input id="nome_fantasia" name="nome_fantasia" defaultValue={fornecedor?.nome_fantasia ?? ''} />
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="telefone">Telefone</Label>
          <Input id="telefone" name="telefone" defaultValue={fornecedor?.telefone ?? ''} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" defaultValue={fornecedor?.email ?? ''} />
        </div>
      </div>

      <fieldset className="space-y-4">
        <legend className="text-sm font-medium">Endereço</legend>
        <div className="grid grid-cols-3 gap-4">
          <div className="flex flex-col gap-1.5 col-span-2">
            <Label htmlFor="endereco_rua">Rua</Label>
            <Input id="endereco_rua" name="endereco_rua" defaultValue={fornecedor?.endereco_rua ?? ''} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="endereco_numero">Número</Label>
            <Input id="endereco_numero" name="endereco_numero" defaultValue={fornecedor?.endereco_numero ?? ''} />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="endereco_bairro">Bairro</Label>
            <Input id="endereco_bairro" name="endereco_bairro" defaultValue={fornecedor?.endereco_bairro ?? ''} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="endereco_cidade">Cidade</Label>
            <Input id="endereco_cidade" name="endereco_cidade" defaultValue={fornecedor?.endereco_cidade ?? ''} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="endereco_uf">UF</Label>
            <Input id="endereco_uf" name="endereco_uf" maxLength={2} defaultValue={fornecedor?.endereco_uf ?? ''} />
          </div>
        </div>
        <div className="flex flex-col gap-1.5 max-w-xs">
          <Label htmlFor="endereco_cep">CEP</Label>
          <Input id="endereco_cep" name="endereco_cep" defaultValue={fornecedor?.endereco_cep ?? ''} />
        </div>
      </fieldset>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="observacoes">Observações</Label>
        <textarea
          id="observacoes"
          name="observacoes"
          defaultValue={fornecedor?.observacoes ?? ''}
          className="border rounded-md px-3 py-2 text-sm min-h-24"
        />
      </div>

      <div className="flex gap-2">
        <Button type="submit" disabled={isPending}>
          {isPending ? 'Salvando...' : 'Salvar'}
        </Button>
        <Button type="button" variant="ghost" onClick={() => router.push('/fornecedores')}>
          Cancelar
        </Button>
      </div>
    </form>
  )
}
