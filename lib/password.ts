// Contraseña de la cuenta: regla de fortaleza (compartida entre el registro y
// el cambio desde "Mis datos") y el cambio self-service.
//
// Esto NO es el reset de contraseña (#8 Parte C, diferido): reset = "me la
// olvidé, no puedo entrar", y sin email real eso necesita un admin con
// `service_role`. Acá la persona YA está adentro y sabe la actual.
import { useMutation } from "@tanstack/react-query";
import { supabase } from "./supabase";

/** Requisitos mínimos de contraseña (#8 Parte A). Devuelve el problema o null. */
export function passwordProblem(pw: string): string | null {
  if (pw.length < 8) return "Usá al menos 8 caracteres.";
  if (/^\d+$/.test(pw)) return "No uses solo números; sumá letras.";
  return null;
}

// Supabase habla de "email" y de contraseñas en inglés; acá el identificador es
// un usuario/teléfono y la persona lee español.
function traducirError(msg?: string): string {
  if (!msg) return "No se pudo cambiar la contraseña.";
  const m = msg.toLowerCase();
  if (m.includes("should be different"))
    return "La contraseña nueva tiene que ser distinta de la actual.";
  if (m.includes("weak") || m.includes("pwned") || m.includes("password"))
    return "La contraseña nueva no cumple los requisitos mínimos.";
  if (m.includes("reauthentication"))
    return "Por seguridad, volvé a iniciar sesión antes de cambiar la contraseña.";
  if (m.includes("rate limit") || m.includes("too many"))
    return "Demasiados intentos. Esperá un momento y probá de nuevo.";
  return msg;
}

export type CambiarPasswordInput = { actual: string; nueva: string };

/**
 * Cambia la contraseña de la cuenta que tiene la sesión abierta.
 *
 * `updateUser` sólo exige sesión válida: con el teléfono desbloqueado y la app
 * abierta, cualquiera podría cambiarla sin saber la actual. Por eso primero
 * reautenticamos con `signInWithPassword` sobre el mismo email sintético; un
 * intento fallido no toca la sesión vigente.
 */
export function useCambiarPassword() {
  return useMutation({
    mutationFn: async ({ actual, nueva }: CambiarPasswordInput): Promise<void> => {
      // getSession() lee el storage local (sin viaje al servidor); el email es
      // el sintético que armó authIdentity al registrarse.
      const { data } = await supabase.auth.getSession();
      const email = data.session?.user.email;
      if (!email) throw new Error("Tu sesión expiró. Volvé a iniciar sesión.");

      const { error: errorReauth } = await supabase.auth.signInWithPassword({
        email,
        password: actual,
      });
      if (errorReauth) throw new Error("La contraseña actual no es correcta.");

      const { error } = await supabase.auth.updateUser({ password: nueva });
      if (error) throw new Error(traducirError(error.message));
    },
  });
}
