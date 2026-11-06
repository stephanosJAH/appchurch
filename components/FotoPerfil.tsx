import { Ionicons } from "@expo/vector-icons";
import { ActivityIndicator, Alert, Pressable, View } from "react-native";
import { useGuardarFotoPerfil } from "../lib/queries/profiles";
import { elegirFotoPerfil, urlFotoPerfil } from "../lib/storage";
import { colors } from "../lib/theme";
import { Avatar } from "./ui";

const TAMANO = 72;

// El avatar de la pantalla de Perfil, editable: tocarlo elige una foto o, si ya
// hay una, ofrece cambiarla o quitarla.
export function FotoPerfilEditable({
  userId,
  nombre,
  fotoPath,
}: {
  userId: string;
  nombre?: string | null;
  fotoPath: string | null;
}) {
  const guardar = useGuardarFotoPerfil();

  const avisarError = () =>
    Alert.alert("No se pudo guardar la foto", "Revisá tu conexión e intentá de nuevo.");

  const cambiar = async () => {
    try {
      const foto = await elegirFotoPerfil();
      if (foto) guardar.mutate({ userId, foto }, { onError: avisarError });
    } catch {
      Alert.alert("No se pudo abrir la foto", "Probá con otra imagen.");
    }
  };

  const quitar = () => guardar.mutate({ userId, foto: null }, { onError: avisarError });

  const alTocar = () => {
    if (!fotoPath) {
      cambiar();
      return;
    }
    Alert.alert("Foto de perfil", undefined, [
      { text: "Cambiar foto", onPress: cambiar },
      { text: "Quitar foto", style: "destructive", onPress: quitar },
      { text: "Cancelar", style: "cancel" },
    ]);
  };

  return (
    <Pressable
      onPress={alTocar}
      disabled={guardar.isPending}
      accessibilityRole="button"
      accessibilityLabel={fotoPath ? "Cambiar o quitar foto de perfil" : "Agregar foto de perfil"}
      className="active:opacity-80"
    >
      <Avatar name={nombre} foto={urlFotoPerfil(fotoPath)} size={TAMANO} />
      {guardar.isPending && (
        <View
          className="absolute items-center justify-center bg-black/40"
          style={{ width: TAMANO, height: TAMANO, borderRadius: TAMANO / 2 }}
        >
          <ActivityIndicator color="#fff" />
        </View>
      )}
      <View
        className="absolute -bottom-0.5 -right-0.5 h-7 w-7 items-center justify-center rounded-full border-2 border-white"
        style={{ backgroundColor: colors.primary }}
      >
        <Ionicons name="camera" size={13} color="#fff" />
      </View>
    </Pressable>
  );
}
