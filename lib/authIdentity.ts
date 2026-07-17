// Login por usuario o teléfono, SIN email real.
// Convertimos el identificador que tipea la persona en un email sintético, para
// usar el proveedor email/password de Supabase sin que nadie tenga que tener
// correo. Nada se envía porque la confirmación de email está APAGADA por diseño
// (Auth → Confirm email = off); esto DEBE quedar así.
//
// El dominio NO puede ser un TLD reservado/de ejemplo (.local, .test, .example,
// .invalid, .internal): Supabase (GoTrue) los rechaza en la validación de
// formato con "Email address ... is invalid" (error email_address_invalid),
// antes de intentar enviar. Por eso usamos un TLD real. Si tenés un dominio
// propio, cambialo por un subdominio tuyo (ej. "u.tudominio.com").

const SYNTHETIC_DOMAIN = "u.appchurch.app";

/**
 * Normaliza un usuario o teléfono a un slug estable y comparable.
 * - Si parece teléfono (solo dígitos/separadores y ≥6 dígitos), deja solo dígitos.
 * - Si es un usuario, pasa a minúsculas y conserva solo [a-z0-9._-].
 */
export function normalizeIdentifier(raw: string): string {
  const trimmed = raw.trim().toLowerCase();
  const soloTelefono = /^[\d\s()+.\-]+$/.test(trimmed);
  const digits = trimmed.replace(/\D/g, "");
  if (soloTelefono && digits.length >= 6) {
    return digits;
  }
  return trimmed.replace(/[^a-z0-9._-]/g, "");
}

/** Convierte el identificador ingresado en el email sintético para Supabase. */
export function identifierToEmail(raw: string): string {
  return `${normalizeIdentifier(raw)}@${SYNTHETIC_DOMAIN}`;
}

/** ¿El identificador queda usable tras normalizar? (validación de formulario) */
export function isValidIdentifier(raw: string): boolean {
  return normalizeIdentifier(raw).length >= 3;
}
