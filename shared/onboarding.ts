// Contratos del onboarding de organizaciones y miembros (api/me/[action].ts y las acciones de miembros en
// api/admin/[action].ts). Lo usará la app móvil: el backend es la fuente.
import { z } from "zod";

export const ORG_NAME_MAX = 60;

/** 'admin' gestiona miembros e invitaciones; 'coach' carga datos deportivos. Debe coincidir con los CHECK de org_members. */
export const MEMBER_ROLES = ["admin", "coach"] as const;
export type MemberRole = (typeof MEMBER_ROLES)[number];

export const MEMBER_ROLE_LABELS: Record<MemberRole, string> = { admin: "Administrador", coach: "Entrenador" };

/** Alfabeto de los códigos de invitación: sin 0/O ni 1/I/L, para dictarlos o copiarlos sin confundirse. */
export const INVITE_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const INVITE_CODE_LENGTH = 8;

/** "k7qm-x2pa" → "K7QMX2PA": se ignoran espacios, guiones y mayúsculas al escribir un código. */
export const normalizeInviteCode = (raw: string): string => raw.replace(/[^A-Za-z0-9]/g, "").toUpperCase();

/** "K7QMX2PA" → "K7QM-X2PA": como se muestra y se comparte. */
export const formatInviteCode = (code: string): string => `${code.slice(0, 4)}-${code.slice(4)}`;

const inviteCode = z.string().trim().min(1, "Escribe el código").max(24);

const hexColor = z.string().trim().regex(/^#[0-9a-fA-F]{6}$/, "Usa un color como #f5b014");

/** Marca del club: lo que la app usa para teñirse (--club-primary, --club-accent, --club-accent-2) y el escudo. */
export const orgThemeInput = z.object({
  primary: hexColor.optional(),
  accent: hexColor.optional(),
  accent_2: hexColor.optional(),
  logo_url: z.url({ protocol: /^https$/, error: "El escudo debe ser una URL https" }).max(500).optional(),
});
export type OrgThemeInput = z.infer<typeof orgThemeInput>;

export const orgCreateInput = z.object({
  name: z.string().trim().min(2, "Escribe el nombre del club").max(ORG_NAME_MAX),
  theme: orgThemeInput.optional(),
});
export type OrgCreateInput = z.infer<typeof orgCreateInput>;

export const inviteAcceptInput = z.object({ code: inviteCode });
export type InviteAcceptInput = z.infer<typeof inviteAcceptInput>;

export const orgLeaveInput = z.object({ slug: z.string().trim().min(1).max(60) });
export type OrgLeaveInput = z.infer<typeof orgLeaveInput>;

/** `max_uses` ausente o null = sin límite de usos. Los códigos no caducan: se revocan. */
export const inviteCreateInput = z.object({
  role: z.enum(MEMBER_ROLES).default("coach"),
  max_uses: z
    .number()
    .int()
    .min(1)
    .max(10_000)
    .nullish()
    .transform((value) => value ?? null),
});
export type InviteCreateInput = z.infer<typeof inviteCreateInput>;

export const inviteRevokeInput = z.object({ code: inviteCode });
export type InviteRevokeInput = z.infer<typeof inviteRevokeInput>;

export const memberRoleInput = z.object({ user_id: z.uuid(), role: z.enum(MEMBER_ROLES) });
export type MemberRoleInput = z.infer<typeof memberRoleInput>;

export const memberRemoveInput = z.object({ user_id: z.uuid() });
export type MemberRemoveInput = z.infer<typeof memberRemoveInput>;

// ─── Respuestas ──────────────────────────────────────────────────────────────

/** Un club del usuario. `slug` es lo que la app envía en la cabecera x-org-slug. */
export type MyOrg = { slug: string; name: string; role: MemberRole };

/** `can_create_org` = tiene permiso de creador y aún le queda cupo: la app muestra "Crear club" o el muro de pago. */
export type MyOrgs = { orgs: MyOrg[]; can_create_org: boolean };

export type JoinedOrg = MyOrg & { already_member: boolean };

export type OrgMember = {
  user_id: string;
  email: string | null;
  name: string | null;
  role: MemberRole;
  joined_at: string;
  is_me: boolean;
};

/** `code` viaja formateado ("K7QM-X2PA"). `max_uses` null = ilimitado. */
export type OrgInvite = {
  code: string;
  role: MemberRole;
  max_uses: number | null;
  uses: number;
  created_at: string;
};

/** Datos públicos de un club (lo que ve un invitado sin cuenta). */
export type OrgInfo = { slug: string; name: string; theme: Record<string, unknown> };
