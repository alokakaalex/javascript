"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { parsePropertyInput, type FieldErrors } from "@/lib/expansion/propertyInput";
import type { Decision } from "@/lib/expansion/workflow";
import { removeFiles, removeUpload } from "@/lib/server/mediaStore";
import { markRead } from "@/lib/server/notifications";
import {
  createProperty,
  decide,
  deleteDraft,
  PropertyError,
  submitProperty,
  updateProperty,
} from "@/lib/server/properties";
import { requireRole, requireUser } from "@/lib/server/session";

export interface PropertyFormState {
  error?: string;
  fieldErrors?: FieldErrors;
}

function field(formData: FormData, name: string): string {
  const v = formData.get(name);
  return typeof v === "string" ? v : "";
}

function propertyId(formData: FormData): number {
  return Number(field(formData, "propertyId"));
}

export async function saveProperty(_: PropertyFormState, formData: FormData): Promise<PropertyFormState> {
  const user = await requireRole("real_estate");
  const parsed = parsePropertyInput(formData);
  if (!parsed.ok) return { error: "Please fix the highlighted fields.", fieldErrors: parsed.errors };
  const existing = propertyId(formData);
  let id: number;
  try {
    if (existing) {
      updateProperty(user, existing, parsed.value);
      id = existing;
    } else {
      id = createProperty(user, parsed.value);
    }
  } catch (error) {
    if (error instanceof PropertyError) return { error: error.message };
    throw error;
  }
  revalidatePath("/real-estate");
  redirect(`/real-estate/properties/${id}/edit${existing ? "" : "?created=1"}`);
}

export interface ActionState {
  error?: string;
}

export async function submitForReview(_: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireRole("real_estate");
  const id = propertyId(formData);
  try {
    submitProperty(user, id);
  } catch (error) {
    if (error instanceof PropertyError) return { error: error.message };
    throw error;
  }
  revalidatePath("/real-estate");
  redirect(`/real-estate/properties/${id}?submitted=1`);
}

export async function discardDraft(_: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireRole("real_estate");
  const id = propertyId(formData);
  try {
    removeFiles(id, deleteDraft(user, id));
  } catch (error) {
    if (error instanceof PropertyError) return { error: error.message };
    throw error;
  }
  revalidatePath("/real-estate");
  redirect("/real-estate");
}

export async function removeMedia(formData: FormData) {
  const user = await requireRole("real_estate");
  try {
    removeUpload(user, field(formData, "mediaId"));
  } catch (error) {
    if (!(error instanceof PropertyError)) throw error;
  }
  revalidatePath(`/real-estate/properties/${propertyId(formData)}/edit`);
}

export async function recordDecision(_: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireRole("sales", "ops", "business");
  const id = propertyId(formData);
  try {
    decide(user, id, field(formData, "decision") as Decision, field(formData, "remarks"));
  } catch (error) {
    if (error instanceof PropertyError) return { error: error.message };
    throw error;
  }
  revalidatePath(`/${user.role}`);
  redirect(`/${user.role}/properties/${id}?decided=1`);
}

export async function markNotificationsRead(formData: FormData) {
  const user = await requireUser();
  const id = field(formData, "notificationId");
  markRead(user.id, id ? Number(id) : undefined);
  revalidatePath("/", "layout");
}
