// Sistema de diseño "Sacred Assembly" (ver ref/DESIGN.md).
// Solemne y cálido: crema de fondo, navy profundo, acentos dorados.

export const colors = {
  // Superficies
  background: "#fbf9f8", // crema (canvas)
  // Extremo cálido del degradado del feed. La crema del canvas está a 4 puntos
  // del blanco: un degradado entre esos dos no se ve. El recorrido visible sale
  // de estirar este extremo, no de blanquear el otro.
  backgroundWarm: "#f3efe9",
  surface: "#fbf9f8",
  surfaceContainerLowest: "#ffffff",
  surfaceContainerLow: "#f5f3f3",
  surfaceContainer: "#efeded",
  surfaceContainerHigh: "#eae8e7",
  surfaceContainerHighest: "#e4e2e2",

  // Texto
  onSurface: "#1b1c1c",
  onSurfaceVariant: "#44474d",

  // Primario (navy)
  primary: "#04162e",
  onPrimary: "#ffffff",
  primaryContainer: "#1a2b44",
  onPrimaryContainer: "#8292b0",
  inversePrimary: "#b6c7e7",

  // Secundario (gris cálido)
  secondary: "#5f5e5a",
  secondaryContainer: "#e5e2dc",

  // Terciario (dorado — "divine highlight")
  tertiary: "#af8c47",
  tertiaryDim: "#e9c176",
  tertiaryContainer: "#ffdea5",
  onTertiaryContainer: "#5d4201",

  // Acento cumpleaños (rosado cálido, distinto de navy/dorado)
  cumple: "#b5476b",

  // Estado
  error: "#ba1a1a",
  errorContainer: "#ffdad6",
  onErrorContainer: "#93000a",
  success: "#3f6b3f",

  // Estructura
  outline: "#75777e",
  outlineVariant: "#c5c6ce",
  hairline: "rgba(26, 43, 68, 0.10)", // borde navy tenue
};

// Azules de la acuarela de fondo (assets/images-2/FONDO.jpg), por ahora solo en
// el encabezado del detalle de discipulado y de ministerio. No reemplazan a `primary`: el resto
// de la app sigue en el navy de arriba hasta que se decida llevarlos a todo.
export const acuarela = {
  medianoche: "#202f56", // barra de navegación y unión con la foto
  velo: "rgba(16, 25, 56, 0.40)", // tinte plano para que el texto blanco contraste
  panel: "rgba(16, 25, 56, 0.55)", // recuadro de "Próxima reunión" sobre la foto
  // Degradado de la tarjeta del discipulado en Inicio: del tono más oscuro de
  // la imagen al índigo, sin salir de la gama de la acuarela.
  degradeOscuro: "#101938", // abismo
  degradeClaro: "#324266", // índigo
};

// Nombres de familia que expone @expo-google-fonts (cargadas en el root layout).
export const fonts = {
  serifSemibold: "SourceSerif4_600SemiBold",
  serifBold: "SourceSerif4_700Bold",
  sans: "SourceSans3_400Regular",
  sansMedium: "SourceSans3_500Medium",
  sansSemibold: "SourceSans3_600SemiBold",
  sansBold: "SourceSans3_700Bold",
};

// Sombra suave difusa con tinte navy (Level 1 — tarjetas).
export const cardShadow = {
  shadowColor: "#1a2b44",
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.05,
  shadowRadius: 12,
  elevation: 2,
};
