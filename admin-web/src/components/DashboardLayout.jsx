import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../AuthContext.jsx";

// ── Shared Icons ──
const Icons = {
    Dashboard: () => (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
        </svg>
    ),
    Poi: () => (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
    ),
    Zone: () => (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
        </svg>
    ),
    Audit: () => (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
        </svg>
    ),
    User: () => (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
        </svg>
    ),
    Device: () => (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
        </svg>
    ),
    Analytics: () => (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m0 0a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2v14" />
        </svg>
    ),
    Request: () => (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
        </svg>
    ),
    Logout: () => (
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
        </svg>
    ),
    Menu: () => (
        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
    ),
    Close: () => (
        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
    )
};

const linkClass = ({ isActive }) =>
    `flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-bold transition-all duration-200 ${isActive
        ? "bg-emerald-600 text-white shadow-lg shadow-emerald-900/40 translate-x-1"
        : "text-slate-400 hover:bg-slate-900 hover:text-slate-200 hover:translate-x-1"
    }`;

export default function DashboardLayout() {
    const { logout, user } = useAuth();
    const navigate = useNavigate();
    const role = user?.role;

    const [sidebarOpen, setSidebarOpen] = useState(true);

    const adminLinks = [
        { to: "/", label: "Bảng điều khiển", icon: Icons.Dashboard },
        { to: "/pois", label: "Quản lý POI", icon: Icons.Poi },
        { to: "/zones", label: "Quản lý Zone", icon: Icons.Zone },
        { to: "/pending", label: "Chờ Duyệt", icon: Icons.Audit },
        { to: "/users", label: "Người Dùng", icon: Icons.User },
        { to: "/devices", label: "Thiết bị", icon: Icons.Device },
        { to: "/audits", label: "Nhật ký", icon: Icons.Audit },
        { to: "/intelligence/dashboard", label: "Intelligence", icon: Icons.Analytics },
        { to: "/revenue", label: "Doanh thu", icon: Icons.Analytics },
        { to: "/change-requests", label: "Yêu cầu", icon: Icons.Request },
    ];

    const ownerLinks = [
        { to: "/my-pois", label: "POI của tôi", icon: Icons.Poi },
        { to: "/submit-poi", label: "Gửi POI mới", icon: Icons.Request },
    ];

    const links = role === "ADMIN" ? adminLinks : ownerLinks;

    return (
        <div className="flex min-h-screen bg-slate-50">
            {/* Mobile Overlay */}
            {sidebarOpen && (
                <div
                    className="fixed inset-0 z-30 bg-slate-950/40 backdrop-blur-sm lg:hidden"
                    onClick={() => setSidebarOpen(false)}
                />
            )}

            {/* Sidebar */}
            <aside
                className={`
          fixed top-0 left-0 z-40 flex h-full w-72 flex-col bg-slate-950 text-white
          transition-all duration-300 ease-in-out border-r border-slate-900
          ${sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}
          lg:relative lg:shrink-0
        `}
            >
                <div className="flex items-center gap-3 px-6 py-8">
                    <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center shadow-lg shadow-emerald-900/20">
                        <span className="font-black text-white text-xl">V</span>
                    </div>
                    <div>
                        <p className="font-black tracking-tight text-white text-lg leading-tight">VNGo <span className="text-emerald-500">Travel</span></p>
                        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Admin Portal</p>
                    </div>
                </div>

                <nav className="flex-1 space-y-1 overflow-y-auto px-4 py-2 custom-scrollbar">
                    {links.map((item) => (
                        <NavLink
                            key={item.to}
                            to={item.to}
                            end={item.to === "/"}
                            className={linkClass}
                            onClick={() => {
                                if (window.innerWidth < 1024) setSidebarOpen(false);
                            }}
                        >
                            <item.icon />
                            <span>{item.label}</span>
                        </NavLink>
                    ))}
                </nav>

                <div className="border-t border-slate-900 p-6 bg-slate-950/50">
                    <div className="flex items-center gap-3 px-1 mb-4">
                        <div className="h-8 w-8 rounded-full bg-slate-800 flex items-center justify-center border border-slate-700">
                             <Icons.User />
                        </div>
                        <div className="min-w-0">
                            <p className="truncate text-xs font-bold text-white">{user?.fullName || user?.email}</p>
                            <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-500">{role}</p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={() => {
                            logout();
                            navigate("/login", { replace: true });
                        }}
                        className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-800 bg-slate-900/50 px-4 py-2.5 text-xs font-bold text-slate-300 transition-all hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/20"
                    >
                        <Icons.Logout />
                        <span>ĐĂNG XUẤT</span>
                    </button>
                </div>
            </aside>

            {/* Main Content Area */}
            <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
                {/* Mobile Header */}
                <header className="flex h-16 items-center justify-between border-b border-slate-200 bg-white/80 backdrop-blur-md px-6 lg:hidden">
                    <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-lg bg-emerald-600 flex items-center justify-center">
                            <span className="font-bold text-white">V</span>
                        </div>
                        <span className="font-black tracking-tight text-slate-900 text-lg">VNGo Admin</span>
                    </div>
                    <button
                        type="button"
                        onClick={() => setSidebarOpen((v) => !v)}
                        className="rounded-xl p-2 text-slate-600 hover:bg-slate-100 transition-colors"
                    >
                        {sidebarOpen ? <Icons.Close /> : <Icons.Menu />}
                    </button>
                </header>

                <main className="flex-1 overflow-y-auto bg-slate-50/50 custom-scrollbar">
                    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
                        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                            <Outlet />
                        </div>
                    </div>
                </main>
            </div>
        </div>
    );
}