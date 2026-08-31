import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { signIn } from '@/actions/auth-actions'

export function LoginForm({ redirectTo, hasError }: { redirectTo: string; hasError: boolean }) {
  return (
    <form action={signIn} className="flex flex-col gap-4 w-full max-w-sm">
      <input type="hidden" name="redirectTo" value={redirectTo} />
      {hasError && (
        <p className="text-sm text-red-600">Email ou senha incorretos.</p>
      )}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" required />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password">Senha</Label>
        <Input id="password" name="password" type="password" required />
      </div>
      <Button type="submit" className="mt-2">Entrar</Button>
    </form>
  )
}
