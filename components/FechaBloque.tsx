import { Text, View } from "react-native";
import { fechaToDate } from "../lib/date";
import { fonts } from "../lib/theme";

// Fecha de una reunión en bloque: el día grande y el mes abreviado abajo. Para
// listas de reuniones, donde lo que se recorre con la vista es la fecha.
export function FechaBloque({ fecha }: { fecha: string }) {
  const d = fechaToDate(fecha);
  return (
    <View className="w-10 items-center">
      <Text
        style={{ fontFamily: fonts.serifSemibold, fontSize: 20, lineHeight: 24 }}
        className="text-navy"
      >
        {String(d.getDate()).padStart(2, "0")}
      </Text>
      <Text
        style={{ fontFamily: fonts.sansBold, letterSpacing: 0.8 }}
        className="text-[10px] uppercase text-ink-muted"
      >
        {d.toLocaleDateString("es-AR", { month: "short" }).replace(".", "")}
      </Text>
    </View>
  );
}
