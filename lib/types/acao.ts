export type ResultadoAcao<T = void> = { sucesso: true; dados: T } | { sucesso: false; erro: string }
