import { Session } from "@supabase/supabase-js";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createContext,
  PropsWithChildren,
  useContext,
  useEffect,
  useState,
} from "react";
import { supabase } from "./supabase";
import { Profile } from "./types";

type AuthState = {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  // Perfil no cargado por un error real (red, servidor) tras agotar reintentos.
  // Distinto de `!profile` durante la carga o antes de tener sesión.
  profileError: boolean;
  isAdmin: boolean;
  esObrero: boolean;
  aprobado: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthState | undefined>(undefined);

export const authKeys = {
  profile: (userId: string) => ["auth", "profile", userId] as const,
};

async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  return data as Profile | null;
}

export function AuthProvider({ children }: PropsWithChildren) {
  const qc = useQueryClient();
  const [session, setSession] = useState<Session | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);

  useEffect(() => {
    let active = true;
    // Guarda el uid de la sesión ya "vista" para detectar cuándo el token
    // recién llega (arranque en frío: getSession devuelve null y el token
    // aparece después en SIGNED_IN/TOKEN_REFRESHED). Al detectarlo, invalidamos
    // las queries que corrieron sin token y quedaron cacheadas vacías (RLS → []).
    let lastUserId: string | null = null;
    const t0 = Date.now();
    if (__DEV__) console.log("[auth] ▶ getSession…");

    const syncSession = (s: Session | null, label: string) => {
      const prevUserId = lastUserId;
      lastUserId = s?.user?.id ?? null;
      setSession(s);
      // El token pasó de ausente a presente (o cambió de usuario): refetch de
      // todo (incluida la query del perfil, keyed por uid) para reemplazar los
      // resultados vacíos por los reales.
      if (lastUserId && lastUserId !== prevUserId) {
        if (__DEV__) console.log(`[auth] ↻ token disponible (${label}) — invalidando queries`);
        qc.invalidateQueries();
      }
    };

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      if (__DEV__)
        console.log(`[auth] ✔ getSession ${Date.now() - t0}ms — con sesión: ${!!data.session}`);
      syncSession(data.session, "getSession");
      if (active) setSessionLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      if (!active) return;
      if (__DEV__) console.log(`[auth] ⚡ onAuthStateChange: ${event} — con sesión: ${!!s}`);
      syncSession(s, event);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const userId = session?.user?.id ?? null;

  // Perfil en React Query, keyed por uid: da retry y cache (a diferencia del
  // fetch suelto anterior) y expone un estado de error distinguible en vez de
  // tragarse el fallo y dejar `profile` en null para siempre (spinner infinito
  // en app/_layout.tsx si la red falla en el arranque en frío).
  const {
    data: profile = null,
    isLoading: profileLoading,
    isError: profileError,
    refetch: refetchProfile,
  } = useQuery({
    queryKey: authKeys.profile(userId ?? ""),
    queryFn: () => fetchProfile(userId as string),
    enabled: !!userId,
    retry: 3,
    staleTime: 30_000,
  });

  const value: AuthState = {
    session,
    profile,
    loading: sessionLoading || (!!userId && profileLoading),
    profileError: !!userId && profileError,
    isAdmin: profile?.rol === "admin",
    esObrero: profile?.rol === "obrero" || profile?.rol === "admin",
    aprobado: !!profile && profile.rol !== "pendiente",
    signOut: async () => {
      await supabase.auth.signOut();
    },
    refreshProfile: async () => {
      await refetchProfile();
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth debe usarse dentro de <AuthProvider>");
  return ctx;
}
