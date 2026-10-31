import { Image, Text, View } from "react-native";
import { colors, fonts } from "../lib/theme";

// Foto del ministerio (bucket `adjuntos`, 0033) en un cuadrado redondeado. Sin
// foto, la inicial del nombre sobre navy, igual que en el detalle
// (app/ministerio/[id].tsx). Es la única imagen del ministerio: el ícono
// (`ministerios.icono`) ya no se ofrece ni se muestra.
export function FotoMinisterio({
  nombre,
  imagenUrl,
  size = 56,
}: {
  nombre: string;
  imagenUrl: string | null | undefined;
  size?: number;
}) {
  return (
    <View
      className="items-center justify-center overflow-hidden"
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.22),
        backgroundColor: colors.primary,
      }}
    >
      {imagenUrl ? (
        <Image
          source={{ uri: imagenUrl }}
          resizeMode="cover"
          accessibilityIgnoresInvertColors
          style={{ width: "100%", height: "100%" }}
        />
      ) : (
        <Text
          style={{ fontFamily: fonts.serifBold, fontSize: size * 0.42, lineHeight: size * 0.5 }}
          className="text-gold-dim"
        >
          {nombre.charAt(0).toUpperCase()}
        </Text>
      )}
    </View>
  );
}
