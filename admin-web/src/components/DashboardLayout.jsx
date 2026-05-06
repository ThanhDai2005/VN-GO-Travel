import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../AuthContext.jsx";

/* ── Thêm Icon cho nút Menu trên Mobile ── */
function IconMenu() {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
            <path strokeLinecap="round" d="M4 6h16M4 12h16M4 18h16" />
        </svg>
    );
}
function IconClose() {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
            <path strokeLinecap="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
    );
}

const linkClass = ({ isActive }) =>
    `block rounded-lg px-3 py-2 text-sm font-medium transition-colors ${isActive
        ? "bg-emerald-600/20 text-emerald-300"
        : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
    }`;

export default function DashboardLayout() {
    const { logout, user } = useAuth();
    const navigate = useNavigate();
    const role = user?.role;

    /* 1. State quản lý trạng thái đóng/mở sidebar */
    const [sidebarOpen, setSidebarOpen] = useState(true);

    const adminLinks = [
        { to: "/", label: "Bảng điều khiển" },
        { to: "/pois", label: "Quản lý POI" },
        { to: "/zones", label: "Quản lý Zone" },
        { to: "/pending", label: "Địa Điểm Chờ Duyệt" },
        { to: "/users", label: "Quản lý Premium" },
        { to: "/devices", label: "Quản lý Thiết bị" },
        { to: "/audits", label: "Nhật ký duyệt" },
        { to: "/intelligence/dashboard", label: "Intelligence Dashboard" },
        { to: "/revenue", label: "Thống kê doanh thu" },
        { to: "/change-requests", label: "Yêu cầu thay đổi" },
    ];

    const ownerLinks = [
        { to: "/my-pois", label: "POI của tôi" },
        { to: "/submit-poi", label: "Gửi POI mới" },
    ];

    const links = role === "ADMIN" ? adminLinks : ownerLinks;

    return (
        <div className="flex min-h-screen bg-slate-950">

            {/* 2. Lớp phủ đen (Overlay) trên Mobile khi mở sidebar */}
            {sidebarOpen && (
                <div
                    className="fixed inset-0 z-30 bg-black/50 lg:hidden"
                    onClick={() => setSidebarOpen(false)}
                />
            )}

            {/* 3. Container chính của Sidebar (trượt ra/vào trên mobile, cố định trên desktop) */}
            <aside
                className={`
          fixed top-0 left-0 z-40 flex h-full w-64 flex-col border-r border-slate-800 bg-slate-950
          transition-transform duration-300 ease-in-out
          ${sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}
          lg:relative lg:h-auto lg:shrink-0
        `}
            >
                <div className="border-b border-slate-800 px-4 py-4">
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                        Cổng quản trị
                    </p>
                    <p className="mt-1 font-semibold tracking-tight text-emerald-400">
                        VNGo Admin
                    </p>
                </div>
                <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-3">
                    {links.map((item) => (
                        <NavLink
                            key={item.to}
                            to={item.to}
                            end={item.to === "/"}
                            className={linkClass}
                            onClick={() => {
                                /* 4. Tự động đóng Sidebar khi chuyển trang trên Mobile */
                                if (window.innerWidth < 1024) setSidebarOpen(false);
                            }}
                        >
                            {item.label}
                        </NavLink>
                    ))}
                </nav>
                <div className="border-t border-slate-800 p-3">
                    <p className="truncate px-1 text-xs text-slate-500">{user?.email}</p>
                    <p className="mt-0.5 px-1 text-[10px] font-medium uppercase text-slate-600">
                        {role}
                    </p>
                    <button
                        type="button"
                        onClick={() => {
                            logout();
                            navigate("/login", { replace: true });
                        }}
                        className="mt-3 w-full rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:bg-slate-800"
                    >
                        Đăng xuất
                    </button>
                </div>
            </aside>

            {/* ── Main Content Area ── */}
            <div className="flex min-w-0 flex-1 flex-col">

                {/* 5. Thanh Header chứa nút Menu cho Mobile */}
                <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3 shadow-sm lg:hidden">
                    <button
                        type="button"
                        onClick={() => setSidebarOpen((v) => !v)}
                        className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-100"
                        aria-label="Mở/đóng menu"
                    >
                        {sidebarOpen ? <IconClose /> : <IconMenu />}
                    </button>
                    <span className="font-semibold tracking-tight text-emerald-600">VNGo Admin</span>
                </header>

                <main className="min-w-0 flex-1 overflow-auto bg-white text-slate-900">
                    <div className="mx-auto max-w-6xl px-6 py-8">
                        <Outlet />
                    </div>
                </main>
            </div>

        </div>
    );
}