'use client';

import { useState, useEffect, useCallback } from 'react';
import { Settings, Info, Users, Plus, Pencil, Loader2, ShieldCheck, ShieldOff, History, RotateCcw, CheckCircle2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';

interface CurrentUser {
  id: string;
  username: string;
  role: 'ADMIN' | 'STAFF';
}

interface TeamAccount {
  id: string;
  username: string;
  name: string;
  role: 'ADMIN' | 'STAFF';
  isActive: boolean;
  createdAt: string;
}

interface ActivityLogEntry {
  id: string;
  username: string;
  action: 'CREATE' | 'UPDATE' | 'DELETE';
  entityType: string;
  entityLabel: string;
  restoredAt: string | null;
  restoredBy: string | null;
  createdAt: string;
}

function formatLogTime(iso: string): string {
  const d = new Date(iso);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  const hh = d.getHours().toString().padStart(2, '0');
  const mm = d.getMinutes().toString().padStart(2, '0');
  return `${d.getDate()} ${months[d.getMonth()]}, ${hh}:${mm}`;
}

export function SettingsPage() {
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [accounts, setAccounts] = useState<TeamAccount[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(true);

  const [addOpen, setAddOpen] = useState(false);
  const [addUsername, setAddUsername] = useState('');
  const [addPassword, setAddPassword] = useState('');
  const [addName, setAddName] = useState('');
  const [addRole, setAddRole] = useState<'ADMIN' | 'STAFF'>('STAFF');
  const [saving, setSaving] = useState(false);

  const [editTarget, setEditTarget] = useState<TeamAccount | null>(null);
  const [editName, setEditName] = useState('');
  const [editRole, setEditRole] = useState<'ADMIN' | 'STAFF'>('STAFF');
  const [editActive, setEditActive] = useState(true);
  const [editPassword, setEditPassword] = useState('');

  const [logs, setLogs] = useState<ActivityLogEntry[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(true);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  const fetchLogs = useCallback(async () => {
    setLoadingLogs(true);
    try {
      const res = await fetch('/api/activity-log');
      if (res.ok) {
        setLogs(await res.json());
      }
    } finally {
      setLoadingLogs(false);
    }
  }, []);

  const handleRestore = async (entry: ActivityLogEntry) => {
    setRestoringId(entry.id);
    try {
      const res = await fetch(`/api/activity-log/${entry.id}/restore`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal restore');
      toast.success('Berhasil di-restore');
      fetchLogs();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal restore');
    } finally {
      setRestoringId(null);
    }
  };

  const fetchAccounts = useCallback(async () => {
    setLoadingAccounts(true);
    try {
      const res = await fetch('/api/users');
      if (res.ok) {
        setAccounts(await res.json());
      }
    } finally {
      setLoadingAccounts(false);
    }
  }, []);

  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => (r.ok ? r.json() : null))
      .then((u) => setCurrentUser(u));
  }, []);

  useEffect(() => {
    if (currentUser?.role === 'ADMIN') {
      fetchAccounts();
      fetchLogs();
    }
  }, [currentUser, fetchAccounts, fetchLogs]);

  const handleAdd = async () => {
    if (!addUsername || !addPassword) {
      toast.error('Username dan password harus diisi');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: addUsername, password: addPassword, name: addName, role: addRole }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal menambah akun');
      toast.success(`Akun ${data.username} berhasil dibuat`);
      setAddOpen(false);
      setAddUsername('');
      setAddPassword('');
      setAddName('');
      setAddRole('STAFF');
      fetchAccounts();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal menambah akun');
    } finally {
      setSaving(false);
    }
  };

  const openEdit = (account: TeamAccount) => {
    setEditTarget(account);
    setEditName(account.name);
    setEditRole(account.role);
    setEditActive(account.isActive);
    setEditPassword('');
  };

  const handleSaveEdit = async () => {
    if (!editTarget) return;
    setSaving(true);
    try {
      const payload: { name?: string; role?: string; isActive?: boolean; password?: string } = {
        name: editName,
        role: editRole,
        isActive: editActive,
      };
      if (editPassword) payload.password = editPassword;

      const res = await fetch(`/api/users/${editTarget.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal menyimpan perubahan');
      toast.success('Akun berhasil diperbarui');
      setEditTarget(null);
      fetchAccounts();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal menyimpan perubahan');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-[#2d3436]">Settings</h1>
        <p className="text-sm text-[#4b5563] mt-1">Pengaturan dan konfigurasi sistem</p>
      </div>

      {/* Info Card */}
      <div className="bg-white rounded-xl shadow-sm p-6">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-[#4a6741]/10 flex items-center justify-center flex-shrink-0">
            <Settings className="w-6 h-6 text-[#4a6741]" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-[#2d3436] mb-1">Solutive Inventory System</h2>
            <p className="text-sm text-[#4b5563] leading-relaxed">
              Sistem manajemen inventory dan produksi untuk workspace kamu.
              Kelola printer di menu <strong>3D Printer DB</strong> di sidebar.
            </p>
          </div>
        </div>
      </div>

      {/* Team Accounts — Admin only */}
      {currentUser?.role === 'ADMIN' && (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-[#e8e8e8] flex items-center justify-between">
            <h3 className="text-sm font-semibold text-[#2d3436] flex items-center gap-2">
              <Users className="w-4 h-4 text-[#4b5563]" />
              Team Accounts
            </h3>
            <Button
              size="sm"
              onClick={() => setAddOpen(true)}
              className="h-8 rounded-lg bg-[#4a6741] hover:bg-[#3d5535] text-white text-xs gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              Tambah Akun
            </Button>
          </div>
          <div className="p-2">
            {loadingAccounts ? (
              <div className="flex items-center justify-center py-8 text-[#6b7280]">
                <Loader2 className="w-5 h-5 animate-spin" />
              </div>
            ) : (
              <table className="w-full">
                <tbody>
                  {accounts.map((account) => (
                    <tr key={account.id} className="border-b border-[#f0f0f0] last:border-0">
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-2">
                          {account.role === 'ADMIN' ? (
                            <ShieldCheck className="w-4 h-4 text-[#4a6741] flex-shrink-0" />
                          ) : (
                            <ShieldOff className="w-4 h-4 text-[#9ca3af] flex-shrink-0" />
                          )}
                          <div>
                            <p className="text-sm font-medium text-[#2d3436]">{account.name || account.username}</p>
                            <p className="text-[11px] text-[#6b7280]">@{account.username}</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-3">
                        <Badge
                          variant="outline"
                          className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${
                            account.role === 'ADMIN'
                              ? 'bg-[#4a6741]/10 text-[#4a6741] border-[#4a6741]/30'
                              : 'bg-[#e8e8e8] text-[#4b5563] border-[#d1d5db]'
                          }`}
                        >
                          {account.role === 'ADMIN' ? 'Admin' : 'Staff'}
                        </Badge>
                      </td>
                      <td className="py-3 px-3">
                        <Badge
                          variant="outline"
                          className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${
                            account.isActive
                              ? 'bg-[#15803d]/10 text-[#15803d] border-[#15803d]/30'
                              : 'bg-[#dc2626]/10 text-[#dc2626] border-[#dc2626]/30'
                          }`}
                        >
                          {account.isActive ? 'Aktif' : 'Nonaktif'}
                        </Badge>
                      </td>
                      <td className="py-3 px-3 text-right">
                        <button
                          onClick={() => openEdit(account)}
                          title="Edit akun"
                          className="w-7 h-7 rounded-lg inline-flex items-center justify-center text-[#4b5563] hover:bg-[#f5f6fa] transition-colors cursor-pointer"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {accounts.length === 0 && (
                    <tr>
                      <td colSpan={4} className="text-center py-6 text-sm text-[#6b7280]">
                        Belum ada akun tim
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* Activity Log — Admin only */}
      {currentUser?.role === 'ADMIN' && (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-[#e8e8e8]">
            <h3 className="text-sm font-semibold text-[#2d3436] flex items-center gap-2">
              <History className="w-4 h-4 text-[#4b5563]" />
              Activity Log
            </h3>
          </div>
          <div className="overflow-x-auto">
            {loadingLogs ? (
              <div className="flex items-center justify-center py-8 text-[#6b7280]">
                <Loader2 className="w-5 h-5 animate-spin" />
              </div>
            ) : (
              <table className="w-full min-w-[560px]">
                <thead>
                  <tr className="bg-[#f5f6fa]">
                    <th className="text-left text-xs font-medium text-[#4b5563] py-2 px-3">Waktu</th>
                    <th className="text-left text-xs font-medium text-[#4b5563] py-2 px-3">User</th>
                    <th className="text-left text-xs font-medium text-[#4b5563] py-2 px-3">Aksi</th>
                    <th className="text-left text-xs font-medium text-[#4b5563] py-2 px-3">Item</th>
                    <th className="w-24 text-right text-xs font-medium text-[#4b5563] py-2 px-3">Restore</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((entry) => (
                    <tr key={entry.id} className="border-t border-[#f0f0f0]">
                      <td className="py-2.5 px-3 text-xs text-[#6b7280] whitespace-nowrap">{formatLogTime(entry.createdAt)}</td>
                      <td className="py-2.5 px-3 text-xs text-[#2d3436]">{entry.username}</td>
                      <td className="py-2.5 px-3">
                        <Badge
                          variant="outline"
                          className={`text-[10px] px-1.5 py-0 rounded-full font-semibold ${
                            entry.action === 'CREATE'
                              ? 'bg-[#15803d]/10 text-[#15803d] border-[#15803d]/30'
                              : entry.action === 'DELETE'
                              ? 'bg-[#dc2626]/10 text-[#dc2626] border-[#dc2626]/30'
                              : 'bg-[#2563eb]/10 text-[#2563eb] border-[#2563eb]/30'
                          }`}
                        >
                          {entry.action}
                        </Badge>
                      </td>
                      <td className="py-2.5 px-3 text-xs text-[#4b5563]">
                        <span className="text-[#9ca3af]">{entry.entityType}</span> · {entry.entityLabel}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        {entry.restoredAt ? (
                          <span className="inline-flex items-center gap-1 text-[11px] text-[#15803d]">
                            <CheckCircle2 className="w-3 h-3" /> Restored
                          </span>
                        ) : (
                          <button
                            onClick={() => handleRestore(entry)}
                            disabled={restoringId === entry.id}
                            title="Restore ke kondisi sebelumnya"
                            className="w-7 h-7 rounded-lg inline-flex items-center justify-center text-[#4a6741] hover:bg-[#4a6741]/10 transition-colors cursor-pointer disabled:opacity-50"
                          >
                            {restoringId === entry.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <RotateCcw className="w-3.5 h-3.5" />
                            )}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {logs.length === 0 && (
                    <tr>
                      <td colSpan={5} className="text-center py-6 text-sm text-[#6b7280]">
                        Belum ada aktivitas tercatat
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* Quick Info */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-[#e8e8e8]">
          <h3 className="text-sm font-semibold text-[#2d3436] flex items-center gap-2">
            <Info className="w-4 h-4 text-[#4b5563]" />
            Informasi Sistem
          </h3>
        </div>
        <div className="p-5 space-y-3">
          <div className="flex items-center justify-between py-2 border-b border-[#f0f0f0]">
            <span className="text-sm text-[#4b5563]">Versi</span>
            <span className="text-sm font-medium text-[#2d3436]">1.0.0</span>
          </div>
          <div className="flex items-center justify-between py-2 border-b border-[#f0f0f0]">
            <span className="text-sm text-[#4b5563]">Framework</span>
            <span className="text-sm font-medium text-[#2d3436]">Next.js 16 + Prisma</span>
          </div>
          <div className="flex items-center justify-between py-2 border-b border-[#f0f0f0]">
            <span className="text-sm text-[#4b5563]">Database</span>
            <span className="text-sm font-medium text-[#2d3436]">SQLite</span>
          </div>
          <div className="flex items-center justify-between py-2">
            <span className="text-sm text-[#4b5563]">Theme</span>
            <span className="text-sm font-medium text-[#2d3436]">Light (Default)</span>
          </div>
        </div>
      </div>

      {/* Add Account Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-[400px] rounded-xl">
          <DialogHeader>
            <DialogTitle className="text-[#2d3436]">Tambah Akun Tim</DialogTitle>
            <DialogDescription>Buat akun baru untuk anggota tim</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label className="text-sm font-medium text-[#2d3436]">Nama</Label>
              <Input value={addName} onChange={(e) => setAddName(e.target.value)} placeholder="Nama tampilan" className="rounded-lg" />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium text-[#2d3436]">Username</Label>
              <Input value={addUsername} onChange={(e) => setAddUsername(e.target.value)} placeholder="username login" className="rounded-lg" />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium text-[#2d3436]">Password</Label>
              <Input type="password" value={addPassword} onChange={(e) => setAddPassword(e.target.value)} placeholder="minimal 6 karakter" className="rounded-lg" />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium text-[#2d3436]">Role</Label>
              <Select value={addRole} onValueChange={(v) => setAddRole(v as 'ADMIN' | 'STAFF')}>
                <SelectTrigger className="rounded-lg">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="STAFF">Staff</SelectItem>
                  <SelectItem value="ADMIN">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setAddOpen(false)} className="rounded-lg border-[#e8e8e8] text-[#4b5563]">
              Batal
            </Button>
            <Button onClick={handleAdd} disabled={saving} className="rounded-lg bg-[#4a6741] hover:bg-[#3d5535] text-white">
              {saving ? 'Menyimpan...' : 'Buat Akun'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Account Dialog */}
      <Dialog open={!!editTarget} onOpenChange={() => setEditTarget(null)}>
        <DialogContent className="sm:max-w-[400px] rounded-xl">
          <DialogHeader>
            <DialogTitle className="text-[#2d3436]">Edit Akun</DialogTitle>
            <DialogDescription>@{editTarget?.username}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label className="text-sm font-medium text-[#2d3436]">Nama</Label>
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} className="rounded-lg" />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium text-[#2d3436]">Role</Label>
              <Select value={editRole} onValueChange={(v) => setEditRole(v as 'ADMIN' | 'STAFF')}>
                <SelectTrigger className="rounded-lg">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="STAFF">Staff</SelectItem>
                  <SelectItem value="ADMIN">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between py-1">
              <Label className="text-sm font-medium text-[#2d3436]">Akun Aktif</Label>
              <Switch checked={editActive} onCheckedChange={setEditActive} />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium text-[#2d3436]">Reset Password</Label>
              <Input
                type="password"
                value={editPassword}
                onChange={(e) => setEditPassword(e.target.value)}
                placeholder="Kosongkan kalau tidak diubah"
                className="rounded-lg"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setEditTarget(null)} className="rounded-lg border-[#e8e8e8] text-[#4b5563]">
              Batal
            </Button>
            <Button onClick={handleSaveEdit} disabled={saving} className="rounded-lg bg-[#4a6741] hover:bg-[#3d5535] text-white">
              {saving ? 'Menyimpan...' : 'Simpan'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
