import "../global.css";

import { Ionicons } from "@expo/vector-icons";
import {
  SourceSans3_400Regular,
  SourceSans3_500Medium,
  SourceSans3_600SemiBold,
  SourceSans3_700Bold,
} from "@expo-google-fonts/source-sans-3";
import {
  SourceSerif4_600SemiBold,
  SourceSerif4_700Bold,
  useFonts,
} from "@expo-google-fonts/source-serif-4";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Body, Button } from "../components/ui";
import { AuthProvider, useAuth } from "../lib/auth";
import { attachQueryLogger } from "../lib/query-logger";
import { colors, fonts } from "../lib/theme";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000 },
  },
});

// Logger de tiempos de queries (solo en desarrollo).
if (__DEV__) attachQueryLogger(queryClient);

function Loader() {
  return (
    <View className="flex-1 items-center justify-center bg-cream">
      <ActivityIndicator size="large" color={colors.primary} />
    </View>
  );
}

// Se muestra en vez de quedar con el spinner para siempre cuando el perfil no
// carga por un error real (red, servidor) y ya se agotaron los reintentos.
function ProfileErrorScreen({ onRetry, onSignOut }: { onRetry: () => void; onSignOut: () => void }) {
  return (
    <View className="flex-1 items-center justify-center gap-4 bg-cream px-8">
      <Ionicons name="cloud-offline-outline" size={40} color={colors.outline} />
      <Body className="text-center text-ink">
        No pudimos cargar tu perfil. Revisá tu conexión e intentá de nuevo.
      </Body>
      <View className="w-full gap-2.5">
        <Button title="Reintentar" onPress={onRetry} />
        <Button title="Cerrar sesión" variant="outline" onPress={onSignOut} />
      </View>
    </View>
  );
}

// Redirige según haya o no sesión: protege las rutas autenticadas
// y saca al usuario logueado de la pantalla de login.
function AuthGate() {
  const { session, loading, profile, profileError, signOut, refreshProfile } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  const esPendiente = !!session && profile?.rol === "pendiente";

  useEffect(() => {
    if (loading || profileError) return; // no decidir a medias ni con el perfil roto
    // Con sesión pero sin perfil cargado aún: esperar (no decidir a medias).
    if (session && !profile) return;

    const inAuthGroup = segments[0] === "(auth)";
    const enPendiente = segments[0] === "pendiente";

    if (!session) {
      if (!inAuthGroup) router.replace("/(auth)/login");
    } else if (esPendiente) {
      if (!enPendiente) router.replace("/pendiente");
    } else if (inAuthGroup || enPendiente) {
      router.replace("/(tabs)");
    }
  }, [session, loading, profile, profileError, esPendiente, segments]);

  if (loading) return <Loader />;
  if (session && profileError) {
    return <ProfileErrorScreen onRetry={refreshProfile} onSignOut={signOut} />;
  }
  // Sesión iniciada pero perfil todavía cargando (post-login): evita mostrar la
  // pantalla equivocada por un instante.
  if (session && !profile) return <Loader />;

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerShadowVisible: false,
        headerTitleStyle: { color: colors.primary, fontFamily: fonts.serifSemibold },
        headerTintColor: colors.primary,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="(auth)" options={{ headerShown: false }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="pendiente" options={{ headerShown: false }} />
      <Stack.Screen name="aprobaciones" options={{ title: "Aprobar cuentas" }} />
      <Stack.Screen name="directorio" options={{ title: "Directorio" }} />
      <Stack.Screen name="mis-datos" options={{ title: "Mis datos" }} />
      <Stack.Screen name="ofrendas" options={{ title: "Ofrendas" }} />
      <Stack.Screen name="actividad/[id]" options={{ title: "Evento" }} />
      <Stack.Screen name="actividad-semanal/[id]" options={{ title: "Actividad" }} />
      <Stack.Screen name="discipulado/[id]" options={{ title: "Discipulado" }} />
      <Stack.Screen name="discipulado/editar" options={{ title: "Discipulado" }} />
      <Stack.Screen
        name="reunion/nueva"
        options={{ title: "Registrar reunión", presentation: "modal" }}
      />
      <Stack.Screen name="reunion/[id]" options={{ title: "Reunión" }} />
      <Stack.Screen name="miembro/[id]" options={{ title: "Miembro" }} />
      <Stack.Screen name="admin" options={{ headerShown: false }} />
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    SourceSerif4_600SemiBold,
    SourceSerif4_700Bold,
    SourceSans3_400Regular,
    SourceSans3_500Medium,
    SourceSans3_600SemiBold,
    SourceSans3_700Bold,
  });

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <StatusBar style="dark" />
            {fontsLoaded ? <AuthGate /> : <Loader />}
          </AuthProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
