import { useCallback, useEffect, useState } from "react";
import {
    createPoi,
    deletePoiByCode,
    fetchMasterPois,
    updatePoiByCode,
} from "../apiClient.js";
import TranslationWorkflow from "../components/TranslationWorkflow.jsx";
import TableScrollWrapper from "../components/TableScrollWrapper.jsx";

const Badge = ({ children, variant = "default" }) => {
    const styles = {
        default: "bg-slate-100 text-slate-700 border-slate-200",
        premium: "bg-amber-100 text-amber-800 border-amber-200",
        approved: "bg-emerald-100 text-emerald-800 border-emerald-200",
        pending: "bg-blue-100 text-blue-800 border-blue-200",
        rejected: "bg-red-100 text-red-800 border-red-200"
    };
    return (
        <span className={`inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-tight border ${styles[variant] || styles.default}`}>
            {children}
        </span>
    );
};

function safeText(v) {
    return v && String(v).trim() ? String(v).trim() : "—";
}

function emptyForm() {
    return {
        code: "",
        name: "",
        summary: "",
        narrationShort: "",
        narrationLong: "",
        lat: "",
        lng: "",
        radius: "100",
        priority: "0",
    };
}

export default function MasterPoisPage() {
    const [rows, setRows] = useState([]);
    const [pagination, setPagination] = useState({
        page: 1,
        limit: 50,
        total: 0,
        totalPages: 0,
    });
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState("");
    const [busyCode, setBusyCode] = useState(null);

    const [createOpen, setCreateOpen] = useState(false);
    const [editRow, setEditRow] = useState(null);
    const [deleteRow, setDeleteRow] = useState(null);
    const [form, setForm] = useState(emptyForm);
    const [editTab, setEditTab] = useState("base"); // "base" | "translations"

    const load = useCallback(async (page = 1) => {
        setErr("");
        setLoading(true);
        try {
            const res = await fetchMasterPois(page, pagination.limit);
            const list = Array.isArray(res?.data) ? res.data : [];
            setRows(list);
            if (res?.pagination) setPagination((p) => ({ ...p, ...res.pagination }));
        } catch (e) {
            const msg = e.message || "Không thể tải danh sách POI";
            setErr(msg);
            setRows([]);
        } finally {
            setLoading(false);
        }
    }, [pagination.limit]);

    useEffect(() => {
        load(1);
    }, [load]);

    function openCreate() {
        setForm(emptyForm());
        setCreateOpen(true);
    }

    function openEdit(row) {
        const loc = row.location || {};
        setForm({
            code: row.code || "",
            name: row.name || row.localizedContent?.vi?.name || "",
            summary: row.summary || row.localizedContent?.vi?.summary || "",
            narrationShort: row.narrationShort || row.localizedContent?.vi?.narrationShort || "",
            narrationLong: row.narrationLong || row.localizedContent?.vi?.narrationLong || "",
            lat: loc.lat != null ? String(loc.lat) : "",
            lng: loc.lng != null ? String(loc.lng) : "",
            radius: row.radius != null ? String(row.radius) : "100",
            priority: row.priority != null ? String(row.priority) : "0",
        });
        setEditRow(row);
        setEditTab("base");
    }

    async function submitCreate(e) {
        e.preventDefault();
        const code = form.code.trim();
        const lat = Number(form.lat);
        const lng = Number(form.lng);
        if (!code) {
            setErr("Mã địa điểm là bắt buộc");
            return;
        }
        if (Number.isNaN(lat) || Number.isNaN(lng)) {
            setErr("Vĩ độ và kinh độ phải là số hợp lệ");
            return;
        }
        const radius = Number(form.radius);
        const priority = Number(form.priority);
        const name = form.name.trim();
        if (!name) {
            setErr("Tên địa điểm là bắt buộc");
            return;
        }
        if (Number.isNaN(radius) || radius < 1 || radius > 100000) {
            setErr("Bán kính phải là số hợp lệ từ 1 đến 100000");
            return;
        }
        if (Number.isNaN(priority)) {
            setErr("Priority phải là số hợp lệ");
            return;
        }
        setErr("");
        setBusyCode("__create__");
        try {
            await createPoi({
                code,
                location: { lat, lng },
                radius,
                priority,
                languageCode: "vi",
                name,
                summary: form.summary.trim(),
                narrationShort: form.narrationShort.trim(),
                narrationLong: form.narrationLong.trim(),
            });
            setCreateOpen(false);
            await load(pagination.page);
        } catch (e) {
            setErr(e.message || "Tạo POI thất bại");
        } finally {
            setBusyCode(null);
        }
    }

    async function submitEdit(e) {
        e.preventDefault();
        if (!editRow?.code) return;
        const lat = Number(form.lat);
        const lng = Number(form.lng);
        if (Number.isNaN(lat) || Number.isNaN(lng)) {
            setErr("Vĩ độ và kinh độ phải là số hợp lệ");
            return;
        }
        const radius = Number(form.radius);
        const priority = Number(form.priority);
        const name = form.name.trim();
        if (!name) {
            setErr("Tên địa điểm là bắt buộc");
            return;
        }
        if (Number.isNaN(radius) || radius < 1 || radius > 100000) {
            setErr("Bán kính phải là số hợp lệ từ 1 đến 100000");
            return;
        }
        if (Number.isNaN(priority)) {
            setErr("Priority phải là số hợp lệ");
            return;
        }
        setErr("");
        setBusyCode(editRow.code);
        try {
            await updatePoiByCode(editRow.code, {
                location: { lat, lng },
                radius,
                priority,
                languageCode: "vi",
                name,
                summary: form.summary.trim(),
                narrationShort: form.narrationShort.trim(),
                narrationLong: form.narrationLong.trim(),
            });
            setEditRow(null);
            await load(pagination.page);
        } catch (e) {
            setErr(e.message || "Cập nhật POI thất bại");
        } finally {
            setBusyCode(null);
        }
    }

    async function confirmDelete() {
        if (!deleteRow?.code) return;
        setBusyCode(deleteRow.code);
        setErr("");
        try {
            await deletePoiByCode(deleteRow.code);
            setDeleteRow(null);
            await load(pagination.page);
        } catch (e) {
            setErr(e.message || "Xóa POI thất bại");
        } finally {
            setBusyCode(null);
        }
    }

    const page = pagination.page || 1;
    const totalPages = pagination.totalPages || 0;

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-black text-slate-900 tracking-tight">Quản lý <span className="text-emerald-600">POI</span></h1>
                    <p className="text-sm font-medium text-slate-500 mt-1">
                        Hệ thống quản lý dữ liệu gốc và phân phối nội dung địa điểm.
                    </p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <button
                        type="button"
                        onClick={() => load(page)}
                        className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50 transition-all active:scale-95"
                    >
                        Làm mới
                    </button>
                    <button
                        type="button"
                        onClick={openCreate}
                        className="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white shadow-md shadow-emerald-200 hover:bg-emerald-500 hover:-translate-y-0.5 transition-all active:scale-95"
                    >
                        + THÊM POI MỚI
                    </button>
                </div>
            </div>

            {err && (
                <div className="rounded-2xl border border-red-100 bg-red-50 p-4 text-sm text-red-600 font-bold animate-in fade-in slide-in-from-top-2">
                    {err}
                </div>
            )}

            <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
                {loading ? (
                    <div className="py-20 text-center">
                        <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-emerald-500 border-r-transparent"></div>
                        <p className="mt-4 text-sm font-bold text-slate-400">Đang tải danh sách POI...</p>
                    </div>
                ) : (
                    <TableScrollWrapper>
                        <table className="min-w-full text-left text-sm">
                            <thead className="bg-slate-50 border-b border-slate-200 text-slate-400">
                                <tr>
                                    <th className="px-6 py-4 font-bold uppercase tracking-widest text-[10px]">Mã</th>
                                    <th className="px-6 py-4 font-bold uppercase tracking-widest text-[10px]">Trạng thái</th>
                                    <th className="px-6 py-4 font-bold uppercase tracking-widest text-[10px]">Tên địa điểm</th>
                                    <th className="px-6 py-4 font-bold uppercase tracking-widest text-[10px]">R / P</th>
                                    <th className="px-6 py-4 font-bold uppercase tracking-widest text-[10px]">Tọa độ</th>
                                    <th className="px-6 py-4 font-bold uppercase tracking-widest text-[10px] text-right">Hành động</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {rows.map((row) => {
                                    const loc = row.location;
                                    const lat = loc != null ? Number(loc.lat) : NaN;
                                    const lng = loc != null ? Number(loc.lng) : NaN;
                                    const locStr = loc && !Number.isNaN(lat) && !Number.isNaN(lng) ? `${lat.toFixed(4)}, ${lng.toFixed(4)}` : "—";
                                    const busy = busyCode === row.code;
                                    
                                    return (
                                        <tr key={String(row.id || row.code)} className="group hover:bg-slate-50/50 transition-colors">
                                            <td className="px-6 py-4 font-mono font-bold text-slate-900">{row.code}</td>
                                            <td className="px-6 py-4">
                                                <Badge variant={row.status?.toLowerCase()}>{row.status}</Badge>
                                            </td>
                                            <td className="px-6 py-4">
                                                <p className="max-w-[200px] truncate font-bold text-slate-900">
                                                    {safeText(row.name || row.localizedContent?.vi?.name)}
                                                </p>
                                            </td>
                                            <td className="px-6 py-4 font-mono font-bold text-slate-500">
                                                {`${row.radius ?? "—"} / ${row.priority ?? "—"}`}
                                            </td>
                                            <td className="px-6 py-4 font-medium text-slate-500">{locStr}</td>
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
                                                        onClick={() => setDeleteRow(row)}
                                                        className="rounded-xl bg-slate-900 px-3 py-1.5 text-xs font-bold text-white hover:bg-slate-800 transition-all disabled:opacity-50"
                                                    >
                                                        Xóa
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

            {/* Pagination */}
            {totalPages > 1 && (
                <div className="flex items-center justify-between px-2">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                        Trang <span className="text-slate-900">{page}</span> / {totalPages} 
                        <span className="ml-2 font-medium">({pagination.total ?? 0} bản ghi)</span>
                    </p>
                    <div className="flex gap-2">
                        <button
                            type="button"
                            disabled={page <= 1 || loading}
                            onClick={() => load(page - 1)}
                            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-black text-slate-700 shadow-sm hover:bg-slate-50 transition-all disabled:opacity-30"
                        >
                            TRƯỚC
                        </button>
                        <button
                            type="button"
                            disabled={page >= totalPages || loading}
                            onClick={() => load(page + 1)}
                            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-black text-slate-700 shadow-sm hover:bg-slate-50 transition-all disabled:opacity-30"
                        >
                            SAU
                        </button>
                    </div>
                </div>
            )}

            {/* CREATE MODAL */}
            {createOpen && (
                <Modal 
                    title="Thêm POI mới" 
                    onClose={() => setCreateOpen(false)} 
                    onSubmit={submitCreate}
                    busy={busyCode === "__create__"}
                >
                    <div className="grid grid-cols-2 gap-4">
                        <Field label="Mã POI" value={form.code} onChange={(v) => setForm((f) => ({ ...f, code: v }))} required />
                        <div className="grid grid-cols-2 gap-2">
                             <Field label="Vĩ độ" value={form.lat} onChange={(v) => setForm((f) => ({ ...f, lat: v }))} required />
                             <Field label="Kinh độ" value={form.lng} onChange={(v) => setForm((f) => ({ ...f, lng: v }))} required />
                        </div>
                    </div>
                    <Field label="Tên địa điểm" value={form.name} onChange={(v) => setForm((f) => ({ ...f, name: v }))} required />
                    <Field label="Tóm tắt" value={form.summary} onChange={(v) => setForm((f) => ({ ...f, summary: v }))} />
                    <div className="grid grid-cols-2 gap-4">
                        <Field label="Bán kính (m)" value={form.radius} onChange={(v) => setForm((f) => ({ ...f, radius: v }))} required />
                        <Field label="Độ ưu tiên" value={form.priority} onChange={(v) => setForm((f) => ({ ...f, priority: v }))} required />
                    </div>
                </Modal>
            )}

            {/* EDIT MODAL */}
            {editRow && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 backdrop-blur-sm p-4 animate-in fade-in duration-200">
                    <div className={`w-full ${editTab === 'translations' ? 'max-w-6xl' : 'max-w-lg'} overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl animate-in zoom-in-95 duration-300`}>
                        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 bg-slate-50/50">
                            <div>
                                <h2 className="text-xl font-black tracking-tight text-slate-900">Sửa POI</h2>
                                <p className="font-mono text-[10px] font-bold text-emerald-600 uppercase">{editRow.code}</p>
                            </div>
                            <button onClick={() => setEditRow(null)} className="rounded-full p-1 text-slate-400 hover:bg-slate-100 transition-colors">
                                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                        </div>

                        <div className="flex border-b border-slate-100 bg-white">
                            <button
                                onClick={() => setEditTab("base")}
                                className={`px-6 py-3 text-xs font-black tracking-widest transition-all ${editTab === "base" ? "border-b-2 border-emerald-500 text-emerald-600" : "text-slate-400 hover:text-slate-600"}`}
                            >
                                CẤU HÌNH & NỘI DUNG GỐC
                            </button>
                            <button
                                onClick={() => setEditTab("translations")}
                                className={`px-6 py-3 text-xs font-black tracking-widest transition-all ${editTab === "translations" ? "border-b-2 border-emerald-500 text-emerald-600" : "text-slate-400 hover:text-slate-600"}`}
                            >
                                BẢN DỊCH ĐA NGÔN NGỮ
                            </button>
                        </div>

                        <div className="p-6 overflow-y-auto max-h-[70vh]">
                            {editTab === "base" ? (
                                <form onSubmit={submitEdit} className="space-y-4">
                                    <div className="grid grid-cols-2 gap-4">
                                        <Field label="Vĩ độ" value={form.lat} onChange={(v) => setForm((f) => ({ ...f, lat: v }))} required />
                                        <Field label="Kinh độ" value={form.lng} onChange={(v) => setForm((f) => ({ ...f, lng: v }))} required />
                                    </div>
                                    <Field label="Tên địa điểm" value={form.name} onChange={(v) => setForm((f) => ({ ...f, name: v }))} required />
                                    <Field label="Tóm tắt" value={form.summary} onChange={(v) => setForm((f) => ({ ...f, summary: v }))} />
                                    <Field label="Văn bản ngắn" value={form.narrationShort} onChange={(v) => setForm((f) => ({ ...f, narrationShort: v }))} />
                                    <label className="block">
                                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5 block">Văn bản dài (Premium)</span>
                                        <textarea
                                            value={form.narrationLong}
                                            onChange={(e) => setForm((f) => ({ ...f, narrationLong: e.target.value }))}
                                            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-bold text-slate-900 outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 transition-all"
                                            rows={3}
                                        />
                                    </label>
                                    <div className="grid grid-cols-2 gap-4">
                                        <Field label="Bán kính (m)" value={form.radius} onChange={(v) => setForm((f) => ({ ...f, radius: v }))} required />
                                        <Field label="Độ ưu tiên" value={form.priority} onChange={(v) => setForm((f) => ({ ...f, priority: v }))} required />
                                    </div>
                                    <div className="flex gap-3 pt-4">
                                        <button type="button" onClick={() => setEditRow(null)} className="flex-1 rounded-2xl border border-slate-200 bg-white py-3 text-sm font-black text-slate-500 hover:bg-slate-50 transition-all">HỦY</button>
                                        <button type="submit" disabled={busyCode === editRow.code} className="flex-1 rounded-2xl bg-slate-900 py-3 text-sm font-black text-white shadow-lg shadow-slate-200 hover:bg-slate-800 transition-all disabled:opacity-50">LƯU THAY ĐỔI</button>
                                    </div>
                                </form>
                            ) : (
                                <TranslationWorkflow
                                    poiCode={editRow.code}
                                    baseContent={{
                                        name: form.name,
                                        summary: form.summary,
                                        narrationShort: form.narrationShort,
                                        narrationLong: form.narrationLong
                                    }}
                                    baseVersion={editRow.version || 1}
                                />
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* DELETE CONFIRM */}
            {deleteRow && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 backdrop-blur-sm p-4 animate-in fade-in duration-200">
                    <div className="w-full max-w-sm overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl animate-in zoom-in-95 duration-300 p-6 text-center">
                        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-red-50 text-red-600 mb-4">
                             <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        </div>
                        <h2 className="text-xl font-black tracking-tight text-slate-900">Xác nhận xóa?</h2>
                        <p className="mt-2 text-sm font-medium text-slate-500">
                            Bạn có chắc chắn muốn xóa vĩnh viễn POI <span className="font-mono font-bold text-red-600 uppercase">{deleteRow.code}</span> không?
                        </p>
                        <div className="mt-6 flex gap-3">
                            <button onClick={() => setDeleteRow(null)} className="flex-1 rounded-2xl border border-slate-200 bg-white py-3 text-sm font-black text-slate-500 hover:bg-slate-50 transition-all">HỦY</button>
                            <button onClick={confirmDelete} disabled={busyCode === deleteRow.code} className="flex-1 rounded-2xl bg-red-600 py-3 text-sm font-black text-white shadow-lg shadow-red-200 hover:bg-red-500 transition-all disabled:opacity-50">XÓA NGAY</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// ── Shared UI Components ──
function Modal({ title, children, onClose, onSubmit, busy }) {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="w-full max-w-lg overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl animate-in zoom-in-95 duration-300">
                <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 bg-slate-50/50">
                    <h2 className="text-xl font-black tracking-tight text-slate-900">{title}</h2>
                    <button onClick={onClose} className="rounded-full p-1 text-slate-400 hover:bg-slate-100 transition-colors">
                        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>
                <form onSubmit={onSubmit} className="p-6 space-y-4">
                    {children}
                    <div className="flex gap-3 pt-4">
                        <button type="button" onClick={onClose} className="flex-1 rounded-2xl border border-slate-200 bg-white py-3 text-sm font-black text-slate-500 hover:bg-slate-50 transition-all">HỦY</button>
                        <button type="submit" disabled={busy} className="flex-1 rounded-2xl bg-slate-900 py-3 text-sm font-black text-white shadow-lg shadow-slate-200 hover:bg-slate-800 transition-all disabled:opacity-50">XÁC NHẬN</button>
                    </div>
                </form>
            </div>
        </div>
    );
}

function Field({ label, value, onChange, required, type = "text" }) {
    return (
        <label className="block">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5 block">{label}</span>
            <input
                type={type}
                required={required}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-bold text-slate-900 outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 transition-all"
            />
        </label>
    );
}