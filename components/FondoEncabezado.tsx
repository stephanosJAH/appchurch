import { PropsWithChildren } from "react";
import { ImageBackground, ImageSourcePropType, View } from "react-native";
import { acuarela } from "../lib/theme";

// Recorte derecho de images-2/FONDO.jpg a 900x760: el original es 16:9 y con
// `cover` en un encabezado casi cuadrado se veía solo el cielo claro del medio.
// Es el fondo del discipulado y el de un ministerio que no cargó imagen propia.
const FONDO_POR_DEFECTO: ImageSourcePropType = require("../assets/images-2/fondo-discipulado.jpg");

// Foto del bloque de arriba de discipulado/[id] y ministerio/[id]. `imagenUrl`
// es la que subió el ministerio (bucket `adjuntos`, 0033); sin ella, la
// acuarela de siempre.
//
// La acuarela es oscura a la derecha (la mancha con las hojas) y el texto cae
// sobre la parte clara de la izquierda, de ahí el velo plano; con una foto
// cualquiera hace falta igual, porque no se sabe dónde va a quedar clara. El
// degradado arranca en el color de la barra de navegación para que la foto no
// empiece con un corte.
export function FondoEncabezado({
  imagenUrl,
  children,
}: PropsWithChildren<{ imagenUrl?: string | null }>) {
  return (
    <ImageBackground
      source={imagenUrl ? { uri: imagenUrl } : FONDO_POR_DEFECTO}
      resizeMode="cover"
      style={{ backgroundColor: acuarela.medianoche }}
    >
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: acuarela.velo,
          experimental_backgroundImage: `linear-gradient(to bottom, ${acuarela.medianoche} 0%, rgba(32,47,86,0) 35%)`,
        }}
      />
      {children}
    </ImageBackground>
  );
}
