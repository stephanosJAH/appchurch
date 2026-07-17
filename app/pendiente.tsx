import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Body, Button, Card, Display, Muted } from "../components/ui";
import { useAuth } from "../lib/auth";
import { cardShadow, colors } from "../lib/theme";

// Pantalla para cuentas recién registradas que aún no fueron habilitadas.
// El usuario está logueado pero con rol 'pendiente' (sin acceso): el AuthGate
// (app/_layout.tsx) lo trae acá hasta que un obrero/admin lo active a 'miembro'.
export default function Pendiente() {
  const insets = useSafeAreaInsets();
  const { profile, signOut, refreshProfile } = useAuth();
  const [checking, setChecking] = useState(false);

  const actualizar = async () => {
    setChecking(true);
    try {
      await refreshProfile();
    } finally {
      setChecking(false);
    }
  };

  return (
    <View
      className="flex-1 bg-cream px-6"
      style={{ paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }}
    >
      <View className="flex-1 items-center justify-center">
        <View
          style={cardShadow}
          className="mb-5 h-16 w-16 items-center justify-center rounded-full bg-navy"
        >
          <Ionicons name="hourglass-outline" size={30} color={colors.tertiaryDim} />
        </View>

        <Display className="text-center">Cuenta pendiente</Display>
        <Body className="mt-2 text-center">
          Hola{profile?.nombre_completo ? `, ${profile.nombre_completo}` : ""}. Tu cuenta se creó y
          está esperando que un líder o administrador la habilite.
        </Body>

        <Card className="mt-6 w-full">
          <Muted className="text-center">
            Cuando te habiliten vas a poder ver los eventos, anuncios y el directorio de la
            iglesia. Si ya te avisaron que te aprobaron, tocá «Actualizar estado».
          </Muted>
        </Card>

        <View className="mt-6 w-full">
          <Button title="Actualizar estado" icon="refresh" onPress={actualizar} loading={checking} />
        </View>
      </View>

      <Button
        title="Cerrar sesión"
        variant="ghost"
        icon="log-out-outline"
        onPress={() => signOut()}
      />
    </View>
  );
}
