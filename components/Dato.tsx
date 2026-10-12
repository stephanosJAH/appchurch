import { Text } from "react-native";
import { cardShadow, fonts } from "../lib/theme";
import { Card } from "./ui";

// Tarjeta de un número del resumen, colgada del bloque navy del encabezado
// (discipulado y ministerio). `adjustsFontSizeToFit`: una ofrenda de siete
// cifras tiene que entrar en un tercio de pantalla.
export function Dato({ valor, titulo, detalle }: { valor: string; titulo: string; detalle: string }) {
  return (
    <Card className="flex-1 px-3 py-3.5" style={cardShadow}>
      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        style={{ fontFamily: fonts.serifBold, fontSize: 22, lineHeight: 28 }}
        className="text-navy"
      >
        {valor}
      </Text>
      <Text style={{ fontFamily: fonts.sans }} className="text-[13px] text-ink-variant">
        {titulo}
      </Text>
      <Text numberOfLines={1} style={{ fontFamily: fonts.sans }} className="text-xs text-ink-muted">
        {detalle}
      </Text>
    </Card>
  );
}
