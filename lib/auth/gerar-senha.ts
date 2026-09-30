const CARACTERES = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'

export function gerarSenha(tamanho = 12): string {
  const bytes = crypto.getRandomValues(new Uint8Array(tamanho))
  return Array.from(bytes, (b) => CARACTERES[b % CARACTERES.length]).join('')
}
