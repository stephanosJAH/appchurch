import { Ionicons } from "@expo/vector-icons";
import { View } from "react-native";
import { diasHastaCumple, etiquetaCumple, fechaToDate, formatCumple } from "../lib/date";
import { colors } from "../lib/theme";
import { Body, Card, Chip, Label, LinkAction, Muted, SkeletonRows } from "./ui";

// Forma mínima para calcular/mostrar cumpleaños. La satisfacen tanto `Miembro`
// (participaciones) como `DirectorioEntry` (vista directorio).
export type PersonaCumple = {
  id: string;
  nombre: string;
  apellido: string | null;
  fecha_nacimiento: string | null;
};

export type CumpleItem = { miembro: PersonaCumple; dias: number };

// Próximos cumpleaños (dentro de `dentroDe` días), ordenados por proximidad.
// Descarta personas sin fecha de nacimiento cargada.
export function proximosCumples(
  miembros: (PersonaCumple | undefined | null)[],
  dentroDe = 14
): CumpleItem[] {
  const items: CumpleItem[] = [];
  for (const m of miembros) {
    if (!m) continue;
    const dias = diasHastaCumple(m.fecha_nacimiento);
    if (dias == null || dias > dentroDe) continue;
    items.push({ miembro: m, dias });
  }
  return items.sort((a, b) => a.dias - b.dias);
}

// Cumpleaños del mes calendario de `ref` (todos, incluidos los que ya pasaron),
// ordenados por día. Es otro corte que `proximosCumples`, que mira una ventana
// de días y puede cruzar de mes: esta es la que usa app/cumpleanos.tsx.
export function cumplesDelMes(
  miembros: (PersonaCumple | undefined | null)[],
  ref = new Date()
): PersonaCumple[] {
  return miembros
    .filter((m): m is PersonaCumple => {
      if (!m?.fecha_nacimiento || !/^\d{4}-\d{2}-\d{2}$/.test(m.fecha_nacimiento)) return false;
      return fechaToDate(m.fecha_nacimiento).getMonth() === ref.getMonth();
    })
    .sort(
      (a, b) =>
        fechaToDate(a.fecha_nacimiento!).getDate() - fechaToDate(b.fecha_nacimiento!).getDate()
    );
}

// `etiqueta` sobreescribe la cuenta regresiva del chip; con `null` no se dibuja
// (en la vista del mes los cumpleaños que ya pasaron dirían "en 340 días").
export function CumpleRow({
  miembro,
  dias,
  etiqueta,
}: {
  miembro: PersonaCumple;
  dias: number;
  etiqueta?: string | null;
}) {
  const nombre = `${miembro.nombre} ${miembro.apellido ?? ""}`.trim();
  const hoy = dias <= 0;
  const chip = etiqueta === undefined ? etiquetaCumple(dias) : etiqueta;
  return (
    <Card className="flex-row items-center gap-3 py-3.5">
      <View
        className="h-10 w-10 items-center justify-center rounded-full"
        style={{ backgroundColor: hoy ? colors.cumple : "#f3e0e7" }}
      >
        <Ionicons name="gift-outline" size={19} color={hoy ? "#fff" : colors.cumple} />
      </View>
      <View className="flex-1">
        <Body className="text-ink" numberOfLines={1}>
          {nombre}
        </Body>
        <Muted className="capitalize">{formatCumple(miembro.fecha_nacimiento)}</Muted>
      </View>
      {chip ? <Chip tone={hoy ? "gold" : "neutral"}>{chip}</Chip> : null}
    </Card>
  );
}

// Sección "Cumpleaños" reutilizable. No renderiza nada si no hay próximos.
// Con `cargando` muestra filas fantasma hasta que llegan los miembros (y se
// esconde igual si al final no hay ninguno dentro del plazo).
//
// `max` recorta la lista y, si quedó gente afuera, muestra "Ver todos" ->
// `onVerTodos` (en el feed, la vista del mes). Sin `max` se listan todos, que
// es como la usa el detalle de un discipulado.
export function CumplesSection({
  miembros,
  titulo = "Cumpleaños",
  dentroDe = 30,
  className,
  cargando,
  max,
  onVerTodos,
}: {
  miembros: (PersonaCumple | undefined | null)[];
  titulo?: string;
  dentroDe?: number;
  className?: string;
  cargando?: boolean;
  max?: number;
  onVerTodos?: () => void;
}) {
  const items = proximosCumples(miembros, dentroDe);
  if (items.length === 0 && !cargando) return null;
  const visibles = max == null ? items : items.slice(0, max);
  const hayMas = items.length > visibles.length;
  return (
    <View className={className}>
      <View className="mb-2 flex-row items-end justify-between">
        <Label>{titulo}</Label>
        {hayMas && onVerTodos ? <LinkAction title="Ver todos" onPress={onVerTodos} /> : null}
      </View>
      {items.length === 0 ? (
        <SkeletonRows count={2} accesorio={72} />
      ) : (
        <View className="gap-2.5">
          {visibles.map(({ miembro, dias }) => (
            <CumpleRow key={miembro.id} miembro={miembro} dias={dias} />
          ))}
        </View>
      )}
    </View>
  );
}
