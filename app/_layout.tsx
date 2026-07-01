import "../global.css";

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
import { AuthProvider, useAuth } from "../lib/auth";
import { colors, fonts } from "../lib/theme";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000 },
  },
});

function Loader() {
  return (
    <View className="flex-1 items-center justify-center bg-cream">
      <ActivityIndicator size="large" color={colors.primary} />
    </View>
  );
}

// Redirige según haya o no sesión: protege las rutas autenticadas
// y saca al usuario logueado de la pantalla de login.
function AuthGate() {
  const { session, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    const inAuthGroup = segments[0] === "(auth)";
    if (!session && !inAuthGroup) {
      router.replace("/(auth)/login");
    } else if (session && inAuthGroup) {
      router.replace("/(tabs)");
    }
  }, [session, loading, segments]);

  if (loading) return <Loader />;

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
      <Stack.Screen name="ofrendas" options={{ title: "Ofrendas" }} />
      <Stack.Screen name="actividad/[id]" options={{ title: "Actividad" }} />
      <Stack.Screen name="discipulado/[id]" options={{ title: "Discipulado" }} />
      <Stack.Screen name="discipulado/editar" options={{ title: "Discipulado" }} />
      <Stack.Screen
        name="reunion/nueva"
        options={{ title: "Registrar reunión", presentation: "modal" }}
      />
      <Stack.Screen name="reunion/[id]" options={{ title: "Reunión" }} />
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
