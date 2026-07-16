import { render, screen } from "@testing-library/react";
import { MemoryRouter, Navigate, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";

describe("admin route ordering", () => {
  it("redirects /admin to /admin/dashboard", async () => {
    renderAdminRoutes("/admin");

    expect(await screen.findByText("Dashboard page")).toBeInTheDocument();
  });

  it("keeps /admin/organizations/new from matching the detail route", () => {
    renderAdminRoutes("/admin/organizations/new");

    expect(screen.getByText("Organization new page")).toBeInTheDocument();
    expect(screen.queryByText("Organization detail page")).not.toBeInTheDocument();
  });

  it("matches organization detail URLs separately from list URLs", () => {
    renderAdminRoutes("/admin/organizations/12");

    expect(screen.getByText("Organization detail page")).toBeInTheDocument();
  });
});

function renderAdminRoutes(initialEntry: string) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/admin" element={<Navigate to="/admin/dashboard" replace />} />
        <Route path="/admin/dashboard" element={<div>Dashboard page</div>} />
        <Route path="/admin/organizations" element={<div>Organizations page</div>} />
        <Route
          path="/admin/organizations/new"
          element={<div>Organization new page</div>}
        />
        <Route
          path="/admin/organizations/:organizationId/invites/new"
          element={<div>Organization invite page</div>}
        />
        <Route
          path="/admin/organizations/:organizationId/edit"
          element={<div>Organization edit page</div>}
        />
        <Route
          path="/admin/organizations/:organizationId"
          element={<div>Organization detail page</div>}
        />
      </Routes>
    </MemoryRouter>,
  );
}
