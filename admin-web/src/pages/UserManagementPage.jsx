import { useCallback, useEffect, useState } from 'react';
import { createAdminUser, fetchAdminUsers, updateAdminUser, updateUserStatus } from '../apiClient.js';
import { useAuth } from '../AuthContext.jsx';
import TableScrollWrapper from '../components/TableScrollWrapper.jsx';

const ROLES = ['USER', 'OWNER'];

const Badge = ({ children, variant = "default" }) => {
    const styles = {
        default: "bg-slate-100 text-slate-700",
        premium: "bg-amber-100 text-amber-800 border border-amber-200",
        active: "bg-emerald-100 text-emerald-800 border border-emerald-200",
        locked: "bg-red-100 text-red-800 border border-red-200",
        role: "bg-indigo-50 text-indigo-700 border border-indigo-100"
    };
    return (
        <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-[11px] font-black uppercase tracking-tight ${styles[variant] || styles.default}`}>
            {children}
        </span>
    );
};

export default function UserManagementPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editTargetId, setEditTargetId] = useState('');
  
  const [form, setForm] = useState({
    email: '',
    fullName: '',
    password: '',
    role: 'USER',
    isActive: true,
    qrScanCount: 0,
  });
  
  const [editForm, setEditForm] = useState({
    email: '',
    fullName: '',
    role: 'USER',
    isPremium: false,
    isActive: true,
    qrScanCount: 0,
    password: '',
  });

  const load = useCallback(async () => {
    setErr('');
    setLoading(true);
    try {
      const res = await fetchAdminUsers();
      const list = Array.isArray(res?.data) ? res.data : [];
      const currentUserId = String(user?.id || user?._id || '');
      setRows(
        list.filter(
          (u) =>
            String(u.id || u._id || '') !== currentUserId &&
            String(u.role || '').toUpperCase() !== 'ADMIN',
        ),
      );
    } catch (e) {
      setErr(e.message || 'Không thể tải danh sách người dùng');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [user?.id, user?._id]);

  useEffect(() => {
    load();
  }, [load]);

  async function onStatusToggle(userId, next) {
    setBusyId(userId);
    setErr('');
    try {
      await updateUserStatus(userId, next);
      await load();
    } catch (e) {
      setErr(e.message || 'Cập nhật trạng thái thất bại');
    } finally {
      setBusyId(null);
    }
  }

  async function onCreateUser(e) {
    e.preventDefault();
    setErr('');
    try {
      await createAdminUser({
        email: form.email.trim(),
        fullName: form.fullName.trim(),
        password: form.password,
        role: form.role,
        isActive: form.isActive,
        qrScanCount: Number(form.qrScanCount || 0),
      });
      setCreateOpen(false);
      setForm({ email: '', fullName: '', password: '', role: 'USER', isActive: true, qrScanCount: 0 });
      await load();
    } catch (e) {
      setErr(e.message || 'Tạo tài khoản thất bại');
    }
  }

  function openEdit(row) {
    setEditTargetId(String(row.id || row._id || ''));
    setEditForm({
      email: row.email || '',
      fullName: row.fullName || '',
      role: row.role || 'USER',
      isPremium: row.isPremium === true,
      isActive: row.isActive !== false,
      qrScanCount: Number(row.qrScanCount || 0),
      password: '',
    });
    setEditOpen(true);
  }

  async function onEditUser(e) {
    e.preventDefault();
    if (!editTargetId) return;
    setErr('');
    setBusyId(editTargetId);
    try {
      await updateAdminUser(editTargetId, {
        email: editForm.email.trim(),
        fullName: editForm.fullName.trim(),
        role: editForm.role,
        isPremium: editForm.isPremium,
        isActive: editForm.isActive,
        qrScanCount: Number(editForm.qrScanCount || 0),
        ...(editForm.password ? { password: editForm.password } : {}),
      });
      setEditOpen(false);
      setEditTargetId('');
      await load();
    } catch (e) {
      setErr(e.message || 'Cập nhật người dùng thất bại');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-slate-900">Quản lý người dùng</h1>
          <p className="mt-1 text-sm font-medium text-slate-500">Phân quyền vai trò và kiểm soát trạng thái truy cập.</p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={load}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50 transition-all active:scale-95"
          >
            Làm mới
          </button>
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-black text-white shadow-lg shadow-emerald-200 hover:bg-emerald-500 hover:-translate-y-0.5 transition-all active:scale-95"
          >
            + THÊM NGƯỜI DÙNG
          </button>
        </div>
      </div>

      {err && (
        <div className="rounded-2xl border border-red-100 bg-red-50 p-4 text-sm text-red-600 font-bold">{err}</div>
      )}

      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        {loading ? (
            <div className="py-20 text-center">
                <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-emerald-500 border-r-transparent"></div>
                <p className="mt-4 text-sm font-bold text-slate-400">Đang tải danh sách...</p>
            </div>
        ) : (
          <TableScrollWrapper>
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-400">
                <tr>
                  <th className="px-6 py-4 font-bold uppercase tracking-widest text-[10px]">Người dùng</th>
                  <th className="px-6 py-4 font-bold uppercase tracking-widest text-[10px]">Vai trò</th>
                  <th className="px-6 py-4 font-bold uppercase tracking-widest text-[10px]">Trạng thái</th>
                  <th className="px-6 py-4 font-bold uppercase tracking-widest text-[10px] text-right">Hành động</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((row) => {
                  const id = String(row.id || row._id || '');
                  const busy = busyId === id;
                  return (
                    <tr key={id} className="group hover:bg-slate-50/50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                            <span className="font-bold text-slate-900">{row.fullName || 'Chưa đặt tên'}</span>
                            <span className="text-xs text-slate-400">{row.email}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <Badge variant="role">{row.role || 'USER'}</Badge>
                      </td>
                      <td className="px-6 py-4">
                        {row.isActive !== false ? (
                            <Badge variant="active">ĐANG HOẠT ĐỘNG</Badge>
                        ) : (
                            <Badge variant="locked">ĐÃ KHÓA</Badge>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="inline-flex gap-2">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => openEdit(row)}
                            className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:border-slate-400 transition-all disabled:opacity-50"
                          >
                            Sửa
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => onStatusToggle(id, row.isActive === false)}
                            className={`rounded-xl px-3 py-1.5 text-xs font-bold transition-all disabled:opacity-50 ${
                                row.isActive === false 
                                ? 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100' 
                                : 'bg-slate-900 text-white hover:bg-slate-800'
                            }`}
                          >
                            {row.isActive === false ? 'Mở khóa' : 'Khóa'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableScrollWrapper>
        )}
      </div>

      {/* CREATE MODAL */}
      {createOpen && (
        <Modal 
            title="Thêm người dùng" 
            onClose={() => setCreateOpen(false)}
            onSubmit={onCreateUser}
            busy={loading}
        >
              <Input
                label="Email"
                type="email"
                required
                value={form.email}
                onChange={(v) => setForm((f) => ({ ...f, email: v }))}
              />
              <Input
                label="Họ tên"
                value={form.fullName}
                onChange={(v) => setForm((f) => ({ ...f, fullName: v }))}
              />
              <Input
                label="Mật khẩu"
                type="password"
                required
                minLength={6}
                value={form.password}
                onChange={(v) => setForm((f) => ({ ...f, password: v }))}
              />
              <label className="block">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5 block">Vai trò</span>
                <select
                  value={form.role}
                  onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-bold text-slate-900 outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 transition-all"
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 border border-slate-100 cursor-pointer">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                  checked={form.isActive}
                  onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
                />
                <span className="text-sm font-bold text-slate-700">Kích hoạt tài khoản ngay</span>
              </label>
        </Modal>
      )}

      {/* EDIT MODAL */}
      {editOpen && (
        <Modal 
            title="Chỉnh sửa người dùng" 
            onClose={() => setEditOpen(false)}
            onSubmit={onEditUser}
            busy={busyId === editTargetId}
        >
              <Input
                label="Email"
                type="email"
                required
                value={editForm.email}
                onChange={(v) => setEditForm((f) => ({ ...f, email: v }))}
              />
              <Input
                label="Họ tên"
                value={editForm.fullName}
                onChange={(v) => setEditForm((f) => ({ ...f, fullName: v }))}
              />
              <Input
                label="Mật khẩu mới (để trống nếu không đổi)"
                type="password"
                value={editForm.password}
                onChange={(v) => setEditForm((f) => ({ ...f, password: v }))}
              />
              <label className="block">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5 block">Vai trò</span>
                <select
                  value={editForm.role}
                  onChange={(e) => setEditForm((f) => ({ ...f, role: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-bold text-slate-900 outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 transition-all"
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </label>
              <div className="flex justify-center">
                  <label className="flex flex-col items-center justify-center p-4 w-full rounded-2xl bg-slate-50 border border-slate-100 cursor-pointer hover:border-emerald-300 transition-all">
                    <input
                      type="checkbox"
                      className="h-5 w-5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 mb-2"
                      checked={editForm.isActive}
                      onChange={(e) => setEditForm((f) => ({ ...f, isActive: e.target.checked }))}
                    />
                    <span className="text-[10px] font-black uppercase text-emerald-700">TRẠNG THÁI HOẠT ĐỘNG</span>
                  </label>
              </div>
        </Modal>
      )}
    </div>
  );
}

// ── Shared UI Components ──
function Modal({ title, children, onClose, onSubmit, busy }) {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="w-full max-w-md overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl animate-in zoom-in-95 duration-300">
                <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
                    <h2 className="text-xl font-black tracking-tight text-slate-900">{title}</h2>
                    <button onClick={onClose} className="rounded-full p-1 text-slate-400 hover:bg-slate-100 transition-colors">
                        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>
                <form onSubmit={onSubmit} className="p-6 space-y-4">
                    {children}
                    <div className="flex gap-3 pt-4">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 rounded-2xl border border-slate-200 bg-white py-3 text-sm font-black text-slate-500 hover:bg-slate-50 transition-all"
                        >
                            HỦY
                        </button>
                        <button
                            type="submit"
                            disabled={busy}
                            className="flex-1 rounded-2xl bg-slate-900 py-3 text-sm font-black text-white shadow-lg shadow-slate-200 hover:bg-slate-800 transition-all disabled:opacity-50"
                        >
                            {busy ? "ĐANG XỬ LÝ..." : "XÁC NHẬN"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

function Input({ label, type = "text", value, onChange, ...props }) {
    return (
        <label className="block">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5 block">{label}</span>
            <input
                type={type}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-bold text-slate-900 outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 transition-all"
                {...props}
            />
        </label>
    );
}
