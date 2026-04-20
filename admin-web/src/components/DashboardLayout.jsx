import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../AuthContext.jsx";

const linkClass = ({ isActive }) =>
  `block rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
    isActive
      ? "bg-emerald-600/20 text-emerald-300"
      : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
  }`;

export default function DashboardLayout() {
  const { logout, user } = useAuth();
  const navigate = useNavigate();
  const role = user?.role;

  const adminLinks = [
    { to: "/", label: "Bảng điều khiển" },
    { to: "/pois", label: "Quản lý POI" },
    { to: "/pending", label: "Địa Điểm Chờ Duyệt" },
    { to: "/users", label: "Quản lý Người Dùng" },
    { to: "/devices", label: "Quản lý Thiết bị" },
    { to: "/audits", label: "Nhật ký duyệt" },
    { to: "/intelligence/dashboard", label: "Intelligence Dashboard" },
  ];

  const ownerLinks = [
    { to: "/my-pois", label: "POI của tôi" },
    { to: "/submit-poi", label: "Gửi POI mới" },
  ];

  const links = role === "ADMIN" ? adminLinks : ownerLinks;

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-64 shrink-0 flex-col border-r border-slate-800 bg-slate-950">
        <div className="border-b border-slate-800 px-4 py-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Cổng quản trị
          </p>
          <p className="mt-1 font-semibold tracking-tight text-emerald-400">
            VNGo Admin
          </p>
        </div>
        <nav className="flex flex-1 flex-col gap-1 p-3">
          {links.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              className={linkClass}
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
      <main className="min-w-0 flex-1 overflow-auto bg-white text-slate-900">
        <div className="mx-auto max-w-6xl px-6 py-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
