import { PropsWithChildren } from "react";
import { ImageBackground, ImageSourcePropType, View } from "react-native";
import { acuarela } from "../lib/theme";

// Recorte derecho de images-2/FONDO.jpg a 900x760: el original es 16:9 y con
// `cover` en un encabezado casi cuadrado se veía solo el cielo claro del medio.
// Es el fondo del discipulado y la portada de todos los ministerios.
const FONDO: ImageSourcePropType = require("../assets/images-2/fondo-discipulado.jpg");

// Acuarela del bloque de arriba de discipulado/[id] y ministerio/[id]. La foto
// propia del ministerio no va acá: va en el cuadrado de la hoja, en el detalle.
//
// La acuarela es oscura a la derecha (la mancha con las hojas) y el texto cae
// sobre la parte clara de la izquierda, de ahí el velo plano. El degradado
// arranca en el color de la barra de navegación para que la foto no empiece con
// un corte.
//
// `velo={false}` es la portada del ministerio: la acuarela va sola, sin texto
// encima, así que sobra el tinte plano; queda el degradado de arriba, que es lo
// que hace legibles la barra de estado y los botones flotantes.
export function FondoEncabezado({
  velo = true,
  children,
}: PropsWithChildren<{ velo?: boolean }>) {
  return (
    <ImageBackground
      source={FONDO}
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
          backgroundColor: velo ? acuarela.velo : undefined,
          experimental_backgroundImage: `linear-gradient(to bottom, ${acuarela.medianoche} 0%, rgba(32,47,86,0) 35%)`,
        }}
      />
      {children}
    </ImageBackground>
  );
}
