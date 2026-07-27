import { render, screen } from "@testing-library/react";
import { MemoryRouter, Navigate, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";

describe("admin route ordering", () => {
  it("redirects legacy /admin to /system-admin/dashboard", async () => {
    renderAdminRoutes("/admin");

    expect(await screen.findByText("Dashboard page")).toBeInTheDocument();
  });

  it("keeps /system-admin/organizations/new from matching the detail route", () => {
    renderAdminRoutes("/system-admin/organizations/new");

    expect(screen.getByText("Organization new page")).toBeInTheDocument();
    expect(screen.queryByText("Organization detail page")).not.toBeInTheDocument();
  });

  it("matches organization detail URLs separately from list URLs", () => {
    renderAdminRoutes("/system-admin/organizations/12");

    expect(screen.getByText("Organization detail page")).toBeInTheDocument();
  });
});

function renderAdminRoutes(initialEntry: string) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/admin" element={<Navigate to="/system-admin" replace />} />
        <Route
          path="/system-admin"
          element={<Navigate to="/system-admin/dashboard" replace />}
        />
        <Route path="/system-admin/dashboard" element={<div>Dashboard page</div>} />
        <Route
          path="/system-admin/organizations"
          element={<div>Organizations page</div>}
        />
        <Route
          path="/system-admin/organizations/new"
          element={<div>Organization new page</div>}
        />
        <Route
          path="/system-admin/organizations/:organizationId/invites/new"
          element={<div>Organization invite page</div>}
        />
        <Route
          path="/system-admin/organizations/:organizationId/edit"
          element={<div>Organization edit page</div>}
        />
        <Route
          path="/system-admin/organizations/:organizationId"
          element={<div>Organization detail page</div>}
        />
      </Routes>
    </MemoryRouter>,
  );
}
