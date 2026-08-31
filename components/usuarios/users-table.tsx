import type { Profile, Role } from '@/lib/types/database'

export function UsersTable({ users }: { users: (Profile & { role: Role })[] }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-slate-500 border-b">
          <th className="py-2">Nome</th>
          <th className="py-2">Email</th>
          <th className="py-2">Papel</th>
        </tr>
      </thead>
      <tbody>
        {users.map((user) => (
          <tr key={user.id} className="border-b">
            <td className="py-2">{user.nome}</td>
            <td className="py-2">{user.email}</td>
            <td className="py-2">{user.role.nome}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
