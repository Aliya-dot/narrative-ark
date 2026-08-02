import { Outlet, createHashRouter } from "react-router-dom";
import { AppShell } from "@/components/app-shell";

function ClientLayout() {
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}

function ClientNotFound() {
  return (
    <div className="container py-16">
      <div className="panel p-8 text-center">
        <h1 className="display mb-3 text-3xl">页面不存在</h1>
        <a className="btn btn-primary" href="#/">
          返回叙界
        </a>
      </div>
    </div>
  );
}

export const clientRouter = createHashRouter([
  {
    element: <ClientLayout />,
    children: [
      {
        path: "/",
        lazy: async () => ({ Component: (await import("@/app/page")).default }),
      },
      {
        path: "/create",
        lazy: async () => ({
          Component: (await import("@/app/create/page")).default,
        }),
      },
      {
        path: "/generate/:id",
        lazy: async () => ({
          Component: (await import("@/app/generate/[id]/page")).default,
        }),
      },
      {
        path: "/editor/:id",
        lazy: async () => ({
          Component: (await import("@/app/editor/[id]/page")).default,
        }),
      },
      {
        path: "/play/:id",
        lazy: async () => ({
          Component: (await import("@/app/play/[id]/page")).default,
        }),
      },
      {
        path: "/settings",
        lazy: async () => ({
          Component: (await import("@/app/settings/page")).default,
        }),
      },
      {
        path: "/worldbooks",
        lazy: async () => ({
          Component: (await import("@/app/worldbooks/page")).default,
        }),
      },
      {
        path: "/worldbooks/extract",
        lazy: async () => ({
          Component: (await import("@/app/worldbooks/extract/page")).default,
        }),
      },
      {
        path: "/worldbooks/:id",
        lazy: async () => ({
          Component: (await import("@/app/worldbooks/[id]/page")).default,
        }),
      },
      { path: "*", element: <ClientNotFound /> },
    ],
  },
]);
