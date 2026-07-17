import { Session } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
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
  isAdmin: boolean;
  esObrero: boolean;
  aprobado: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthState | undefined>(undefined);

async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();
  if (error) {
    console.warn("[auth] no se pudo cargar el perfil:", error.message);
    return null;
  }
  return data as Profile | null;
}

export function AuthProvider({ children }: PropsWithChildren) {
  const qc = useQueryClient();
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = async (s: Session | null) => {
    if (s?.user) {
      setProfile(await fetchProfile(s.user.id));
    } else {
      setProfile(null);
    }
  };

  useEffect(() => {
    let active = true;
    // Guarda el uid de la sesión ya "vista" para detectar cuándo el token
    // recién llega (arranque en frío: getSession devuelve null y el token
    // aparece después en SIGNED_IN/TOKEN_REFRESHED). Al detectarlo, invalidamos
    // las queries que corrieron sin token y quedaron cacheadas vacías (RLS → []).
    let lastUserId: string | null = null;
    const t0 = Date.now();
    if (__DEV__) console.log("[auth] ▶ getSession…");

    const syncSession = async (s: Session | null, label: string) => {
      const prevUserId = lastUserId;
      lastUserId = s?.user?.id ?? null;
      setSession(s);
      await loadProfile(s);
      // El token pasó de ausente a presente (o cambió de usuario): refetch de
      // todo para reemplazar los resultados vacíos por los reales.
      if (lastUserId && lastUserId !== prevUserId) {
        if (__DEV__) console.log(`[auth] ↻ token disponible (${label}) — invalidando queries`);
        qc.invalidateQueries();
      }
    };

    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return;
      if (__DEV__)
        console.log(`[auth] ✔ getSession ${Date.now() - t0}ms — con sesión: ${!!data.session}`);
      const tp = Date.now();
      await syncSession(data.session, "getSession");
      if (__DEV__)
        console.log(`[auth] ✔ perfil ${Date.now() - tp}ms — rol: ${data.session ? "(cargado)" : "sin sesión"}`);
      if (active) setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange(async (event, s) => {
      if (!active) return;
      if (__DEV__) console.log(`[auth] ⚡ onAuthStateChange: ${event} — con sesión: ${!!s}`);
      const tp = Date.now();
      await syncSession(s, event);
      if (__DEV__) console.log(`[auth] ✔ perfil tras ${event} ${Date.now() - tp}ms`);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const value: AuthState = {
    session,
    profile,
    loading,
    isAdmin: profile?.rol === "admin",
    esObrero: profile?.rol === "obrero" || profile?.rol === "admin",
    aprobado: !!profile && profile.rol !== "pendiente",
    signOut: async () => {
      await supabase.auth.signOut();
    },
    refreshProfile: async () => {
      if (session?.user) setProfile(await fetchProfile(session.user.id));
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth debe usarse dentro de <AuthProvider>");
  return ctx;
}
