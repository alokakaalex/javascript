// Roles and the portal each one lands on after signing in. A user holds
// exactly one role; the admin ("access manager") assigns it.

export const ROLES = ["admin", "real_estate", "sales", "ops", "business"] as const;
export type Role = (typeof ROLES)[number];

export interface RoleInfo {
  label: string;
  description: string;
  portal: string;
}

export const ROLE_INFO: Record<Role, RoleInfo> = {
  admin: {
    label: "Access Manager",
    description:
      "Manages who has access and which role they hold. Sees every property, all media and every team's decision.",
    portal: "/admin",
  },
  real_estate: {
    label: "Real Estate Manager",
    description:
      "Uploads properties with full commercial terms and media, and is notified of every team's decision.",
    portal: "/real-estate",
  },
  sales: {
    label: "Sales & Category",
    description:
      "First review. Sees media, map location and area only, to assess the surrounding market.",
    portal: "/sales",
  },
  ops: {
    label: "Ops Leader",
    description:
      "Second review, after sales approval. Sees area, location, advance rent, security deposit and rent-free days.",
    portal: "/ops",
  },
  business: {
    label: "Business Leader",
    description:
      "Final review, after sales and ops approval. Sees location, area, rent, deposit, advance, rent-free days and media.",
    portal: "/business",
  },
};

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}
