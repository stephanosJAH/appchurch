import { Ionicons } from "@expo/vector-icons";
import { View } from "react-native";
import { diasHastaCumple, etiquetaCumple, formatCumple } from "../lib/date";
import { colors } from "../lib/theme";
import { Miembro } from "../lib/types";
import { Body, Card, Chip, Label, Muted } from "./ui";

export type CumpleItem = { miembro: Miembro; dias: number };

// Próximos cumpleaños (dentro de `dentroDe` días), ordenados por proximidad.
// Descarta miembros sin fecha de nacimiento cargada.
export function proximosCumples(
  miembros: (Miembro | undefined | null)[],
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

export function CumpleRow({ miembro, dias }: { miembro: Miembro; dias: number }) {
  const nombre = `${miembro.nombre} ${miembro.apellido ?? ""}`.trim();
  const hoy = dias <= 0;
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
      <Chip tone={hoy ? "gold" : "neutral"}>{etiquetaCumple(dias)}</Chip>
    </Card>
  );
}

// Sección "Cumpleaños" reutilizable. No renderiza nada si no hay próximos.
export function CumplesSection({
  miembros,
  titulo = "Cumpleaños",
  dentroDe = 30,
  className,
}: {
  miembros: (Miembro | undefined | null)[];
  titulo?: string;
  dentroDe?: number;
  className?: string;
}) {
  const items = proximosCumples(miembros, dentroDe);
  if (items.length === 0) return null;
  return (
    <View className={className}>
      <Label className="mb-2">{titulo}</Label>
      <View className="gap-2.5">
        {items.map(({ miembro, dias }) => (
          <CumpleRow key={miembro.id} miembro={miembro} dias={dias} />
        ))}
      </View>
    </View>
  );
}
