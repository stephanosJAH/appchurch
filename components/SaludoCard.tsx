import { Ionicons } from "@expo/vector-icons";
import { useMemo } from "react";
import { ImageBackground, ImageSourcePropType, View } from "react-native";
import { saludoDelDia } from "../lib/saludos";
import { cardShadow, colors, fonts } from "../lib/theme";
import { Display, Label, Muted } from "./ui";

// Saludo del día del feed: una tarjeta cuadrada con la foto a sangre —sin
// margen ni relleno alrededor— y encima, alineados a la izquierda, la bajada
// ("Hola, bienvenido, recordá:") arriba, el saludo con el nombre al medio y la
// cita al pie.
//
// El texto lo elige el calendario (uno por fecha, ver lib/saludos.ts); la foto
// se sortea al montar la pantalla, así el mismo saludo no se ve siempre igual.
// Son dos ejes a propósito: el saludo tiene que ser el mismo para todos ese día
// —se comenta entre hermanos—, la imagen no.
//
// `require` necesita rutas literales: el bundler resuelve los assets en build,
// no se puede armar el path con una variable. Por eso la lista es estática.
const FONDOS: ImageSourcePropType[] = [
  require("../assets/images/jeren-emlano-ZRD3zrbNkEg-unsplash.jpg"),
  require("../assets/images/marek-piwnicki-rwcONvax9qE-unsplash.jpg"),
  require("../assets/images/matthew-mosbauer-NNmomR7Ppm4-unsplash.jpg"),
  require("../assets/images/mike-hindle-OndxaYyxsS0-unsplash.jpg"),
  require("../assets/images/peter-herrmann-2iaFrHDRzWY-unsplash.jpg"),
  require("../assets/images/spencer-plouzek-yUHvuCwpeeE-unsplash.jpg"),
];

export function SaludoCard({ nombre, className }: { nombre: string; className?: string }) {
  const saludo = useMemo(() => saludoDelDia(nombre), [nombre]);
  // Sin dependencias: una sola foto por montaje. Si se sorteara en cada render
  // la imagen cambiaría con cada refetch del feed.
  const fondo = useMemo(() => FONDOS[Math.floor(Math.random() * FONDOS.length)], []);

  return (
    <View className={className}>
      {/* No usa `Card`: su `p-5`/`bg-surface` dejarían un marco blanco entre la
          foto y el borde. Acá el contenedor es solo la máscara redondeada y la
          imagen ocupa el 100% —el texto va encima, no al lado. */}
      <View
        style={[cardShadow, { aspectRatio: 1 }]}
        className="overflow-hidden rounded-2xl bg-navy"
      >
        <ImageBackground source={fondo} resizeMode="cover" style={{ flex: 1 }}>
          {/* Velo navy: las fotos van de cielos claros a bosques oscuros y el
              texto es blanco en todas. El tinte plano garantiza el contraste
              mínimo y el degradado suma peso en los dos extremos, que es donde
              apoyan la bajada y la cita; el medio queda más claro y deja ver la
              foto detrás del saludo. */}
          <View
            pointerEvents="none"
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: "rgba(4, 22, 46, 0.32)",
              experimental_backgroundImage:
                "linear-gradient(to bottom, rgba(4,22,46,0.62) 0%, rgba(4,22,46,0.14) 45%, rgba(4,22,46,0.68) 100%)",
            }}
          />
          {/* Los tres textos repartidos en la altura de la tarjeta: la bajada
              arriba, el saludo al medio y la cita al pie. El saludo va en un
              bloque `flex-1` centrado —no con márgenes— así queda en el centro
              óptico sin importar si ocupa una línea o tres. */}
          <View className="flex-column gap-2 p-6 pt-6">
            <Label className="text-white">Hola, bienvenido! </Label>
            <Label className="text-white font-bold">Hoy recordá</Label>
          </View>
          <View className="flex-1 justify-center px-6 py-4">
            {/* Semibold y a 26px, más chico que los 32 de `Display`: sobre la
                foto el serif bold a tamaño completo se veía pesado. Con fuentes
                custom `fontWeight` no alcanza en Android, hay que cambiar de
                familia. El tamaño va en `style` y no como clase: dos
                `text-[..px]` en el mismo className no garantizan cuál gana. */}
            <Display
              className="text-white"
              style={{ fontFamily: fonts.serifSemibold, fontSize: 26, lineHeight: 34 }}
            >
              {saludo.texto}
            </Display>
          </View>
          <View className="flex-row items-center gap-1.5 px-6 pb-6">
            <Ionicons name="book-outline" size={14} color={colors.tertiaryDim} />
            <Muted className="text-gold-dim">{saludo.cita}</Muted>
          </View>
        </ImageBackground>
      </View>
    </View>
  );
}
