import { AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { signIn } from '@/actions/auth-actions'

export function LoginForm({ redirectTo, hasError }: { redirectTo: string; hasError: boolean }) {
  return (
    <form action={signIn} className="flex w-full flex-col gap-4">
      <input type="hidden" name="redirectTo" value={redirectTo} />

      {hasError && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          Email ou senha incorretos.
        </p>
      )}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email" className="text-sm font-medium text-slate-700">
          Email
        </Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="voce@empresa.com.br"
          required
          className="h-10"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password" className="text-sm font-medium text-slate-700">
          Senha
        </Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="h-10"
        />
      </div>

      <Button
        type="submit"
        className="mt-2 h-10 w-full bg-gradient-to-r from-sky-500 to-sky-600 text-sm font-semibold shadow-sm shadow-sky-500/25 hover:from-sky-600 hover:to-sky-600"
      >
        Entrar
      </Button>
    </form>
  )
}
