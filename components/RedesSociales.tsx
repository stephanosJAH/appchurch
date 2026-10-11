import { Ionicons } from "@expo/vector-icons";
import { Alert, Linking, Pressable, View } from "react-native";
import { colors } from "../lib/theme";
import { Card, Label, Muted, Title } from "./ui";

// Redes de la iglesia, al pie del feed. Son constantes del bundle —no vienen de
// la base ni de un feed remoto—, por eso se abren directo con `Linking` sin
// pasar por la validación de `abrirAdjunto` / `abrirVideo`.
const EMAIL = "ministeriopuertasdeadoracion@gmail.com";

const REDES: { icon: keyof typeof Ionicons.glyphMap; nombre: string; url: string }[] = [
  { icon: "logo-instagram", nombre: "Instagram", url: "https://www.instagram.com/puertasdeadoracion/" },
  { icon: "logo-facebook", nombre: "Facebook", url: "https://www.facebook.com/iglesiapuertasdeadoracion" },
  {
    icon: "logo-youtube",
    nombre: "YouTube",
    url: "https://www.youtube.com/watch?v=-VkjfKASJ3g&list=PLiMgs5vrHLBQieLWRQtA3UOTQn3w_Lkzu",
  },
  { icon: "mail-outline", nombre: "Email", url: `mailto:${EMAIL}` },
];

async function abrir(url: string) {
  try {
    await Linking.openURL(url);
  } catch {
    // `mailto:` falla si el teléfono no tiene app de correo configurada.
    Alert.alert("No se puede abrir", url.startsWith("mailto:") ? `Escribinos a ${EMAIL}` : url);
  }
}

export function RedesSociales({ className }: { className?: string }) {
  return (
    <View className={className}>
      <Label className="mb-2">Seguinos</Label>
      <Card className="items-center">
        <Title className="text-center text-base">Puertas de Adoración</Title>
        <View className="mt-4 flex-row justify-center gap-4">
          {REDES.map((r) => (
            <Pressable
              key={r.nombre}
              onPress={() => abrir(r.url)}
              accessibilityRole="link"
              accessibilityLabel={r.nombre}
              hitSlop={6}
              className="h-12 w-12 items-center justify-center rounded-full bg-gold-container active:opacity-80"
            >
              <Ionicons name={r.icon} size={22} color={colors.onTertiaryContainer} />
            </Pressable>
          ))}
        </View>
        <Pressable onPress={() => abrir(`mailto:${EMAIL}`)} className="mt-4 active:opacity-70">
          <Muted className="text-center text-xs">{EMAIL}</Muted>
        </Pressable>
      </Card>
    </View>
  );
}
