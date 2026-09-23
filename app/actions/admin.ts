"use server";

import { revalidatePath } from "next/cache";
import { isRole } from "@/lib/expansion/roles";
import { requireRole } from "@/lib/server/session";
import { changeRole, inviteUser, issueAccessLink, setUserEnabled, UserError } from "@/lib/server/users";

export interface AdminFormState {
  error?: string;
  /** Set after issuing an invite or reset link, so the access manager can copy it. */
  link?: { email: string; url: string; emailed: boolean };
}

function field(formData: FormData, name: string): string {
  const v = formData.get(name);
  return typeof v === "string" ? v : "";
}

async function guarded(fn: () => AdminFormState): Promise<AdminFormState> {
  try {
    const result = fn();
    revalidatePath("/admin/users");
    return result;
  } catch (error) {
    if (error instanceof UserError) return { error: error.message };
    throw error;
  }
}

export async function addUser(_: AdminFormState, formData: FormData): Promise<AdminFormState> {
  const actor = await requireRole("admin");
  const role = field(formData, "role");
  if (!isRole(role)) return { error: "Choose a role." };
  return guarded(() => {
    const { user, link } = inviteUser(actor, { email: field(formData, "email"), name: field(formData, "name"), role });
    return { link: { email: user.email, ...link } };
  });
}

export async function updateUser(_: AdminFormState, formData: FormData): Promise<AdminFormState> {
  const actor = await requireRole("admin");
  const userId = field(formData, "userId");
  const intent = field(formData, "intent");
  return guarded(() => {
    if (intent === "role") {
      const role = field(formData, "role");
      if (!isRole(role)) return { error: "Choose a role." };
      changeRole(actor, userId, role);
    } else if (intent === "disable" || intent === "enable") {
      setUserEnabled(actor, userId, intent === "enable");
    } else if (intent === "link") {
      const link = issueAccessLink(actor, userId);
      return { link: { email: field(formData, "email"), ...link } };
    }
    return {};
  });
}
