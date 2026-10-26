import { Ionicons } from "@expo/vector-icons";
import { ReactNode } from "react";
import { Pressable, StyleProp, Text, View, ViewStyle } from "react-native";
import { Card, Label, Muted, Title } from "./ui";
import {
  EstadoAsistencia,
  FALTAS_PARA_AVISAR,
  REUNIONES_A_LA_VISTA,
  ReunionConPresentes,
  estadoEn,
  etiquetaColumna,
  faltasSeguidas,
  porcentajePresentes,
  presentesDe,
} from "../lib/asistencia";
import { colors, fonts } from "../lib/theme";

// Grilla de asistencia de un roster: una fila por persona, una columna por
// cada una de las últimas reuniones y el porcentaje de cada uno. La comparten
// discipulado/discipulos y ministerio/integrantes, que leen libros distintos
// pero con la misma forma (ver lib/asistencia).

// Ancho de cada columna de reunión y de la de porcentaje: fijos, para que el
// encabezado, las filas y los totales queden alineados.
const ANCHO_COLUMNA = "w-7";
const ANCHO_PORCENTAJE = "w-10";
const ANCHO_ACCION = "w-8";

// Nombre corto ("Nicolás F.") para que entre al lado de las columnas. El
// nombre completo queda en la etiqueta de accesibilidad y en la ficha.
function nombreCorto(nombre?: string | null, apellido?: string | null): string {
  const n = (nombre ?? "").split(" ")[0];
  const inicial = apellido?.trim()?.charAt(0);
  return [n, inicial ? `${inicial}.` : null].filter(Boolean).join(" ") || "Sin nombre";
}

function Punto({ estado }: { estado: EstadoAsistencia }) {
  if (estado === "presente") return <View className="h-3 w-3 rounded-full bg-navy" />;
  if (estado === "ausente")
    return <View className="h-3 w-3 rounded-full border-[1.5px] border-ink-muted" />;
  return <View className="h-0.5 w-2 rounded-full bg-line" />;
}

function Leyenda({ estado, texto }: { estado: EstadoAsistencia; texto: string }) {
  return (
    <View className="flex-row items-center gap-1.5">
      <Punto estado={estado} />
      <Text style={{ fontFamily: fonts.sans }} className="text-xs text-ink-muted">
        {texto}
      </Text>
    </View>
  );
}

export type FilaGrilla = {
  key: string;
  miembroId: string;
  nombre?: string | null;
  apellido?: string | null;
  // Ícono junto al nombre (el regalo del cumpleaños próximo) y lo que dice de
  // él el lector de pantalla.
  icono?: ReactNode;
  accesibilidad?: string | null;
};

type Props = {
  reuniones: ReunionConPresentes[]; // de la más nueva a la más vieja
  filas: FilaGrilla[];
  encabezado: string; // "Discípulo", "Integrante"
  onPress?: (fila: FilaGrilla) => void;
  onQuitar?: (fila: FilaGrilla) => void;
  style?: StyleProp<ViewStyle>; // el fondo/sombra de la pantalla que la aloja
};

export function GrillaAsistencia({ reuniones, filas, encabezado, onPress, onQuitar, style }: Props) {
  // Las columnas: las últimas reuniones, de la más vieja a la más nueva
  // (`reuniones` llega al revés), para que se lean de izquierda a derecha.
  const columnas = [...reuniones.slice(0, REUNIONES_A_LA_VISTA)].reverse();
  const promedio = porcentajePresentes(columnas);
  const espacioAccion = onQuitar ? <View className={ANCHO_ACCION} /> : null;

  return (
    <Card className="px-3.5 py-4" style={style}>
      <View className="flex-row items-start justify-between px-0.5">
        <View className="flex-1 pr-3">
          <Title style={{ fontSize: 18, lineHeight: 24 }}>Asistencia</Title>
          <Muted>
            {columnas.length === 0
              ? "Sin reuniones registradas"
              : `Últimas ${columnas.length} ${columnas.length === 1 ? "reunión" : "reuniones"}`}
          </Muted>
        </View>
        {promedio != null && (
          <View className="items-end">
            <Text
              style={{ fontFamily: fonts.serifBold, fontSize: 22, lineHeight: 26 }}
              className="text-navy"
            >
              {promedio}%
            </Text>
            <Text style={{ fontFamily: fonts.sans }} className="text-xs text-ink-muted">
              promedio
            </Text>
          </View>
        )}
      </View>

      {columnas.length > 0 && (
        <View className="mt-3.5 flex-row items-end pb-1.5">
          <Label className="flex-1">{encabezado}</Label>
          {columnas.map((r) => (
            <Text
              key={r.id}
              style={{ fontFamily: fonts.sans }}
              className={`${ANCHO_COLUMNA} text-center text-[10px] leading-3 text-ink-muted`}
            >
              {etiquetaColumna(r.fecha)}
            </Text>
          ))}
          <View className={ANCHO_PORCENTAJE} />
          {espacioAccion}
        </View>
      )}

      {filas.map((f) => {
        const nombreCompleto = `${f.nombre ?? ""} ${f.apellido ?? ""}`.trim() || "Sin nombre";
        const faltas = faltasSeguidas(reuniones, f.miembroId);
        const pct = porcentajePresentes(columnas, f.miembroId);
        const contenido = (
          <>
            <View className="flex-1 pr-2">
              <View className="flex-row items-center gap-1.5">
                <Text
                  numberOfLines={1}
                  style={{ fontFamily: fonts.sans }}
                  className="shrink text-[15px] text-ink"
                >
                  {nombreCorto(f.nombre, f.apellido)}
                </Text>
                {f.icono}
              </View>
              {faltas >= FALTAS_PARA_AVISAR && (
                <Text
                  style={{ fontFamily: fonts.sansSemibold, color: colors.onTertiaryContainer }}
                  className="text-[11px] leading-4"
                >
                  Faltó a las últimas {faltas}
                </Text>
              )}
            </View>
            {columnas.map((r) => (
              <View key={r.id} className={`${ANCHO_COLUMNA} items-center`}>
                <Punto estado={estadoEn(r, f.miembroId)} />
              </View>
            ))}
            {columnas.length > 0 && (
              <Text
                style={{ fontFamily: fonts.sansSemibold }}
                className={`${ANCHO_PORCENTAJE} text-right text-[13px] text-ink`}
              >
                {pct != null ? `${pct}%` : "—"}
              </Text>
            )}
          </>
        );
        const etiqueta = [
          nombreCompleto,
          f.accesibilidad,
          pct != null ? `${pct}% de asistencia` : null,
        ]
          .filter(Boolean)
          .join(", ");
        return (
          <View
            key={f.key}
            className="flex-row items-center border-t border-black/5"
            style={{ minHeight: 46 }}
          >
            {onPress ? (
              <Pressable
                onPress={() => onPress(f)}
                accessibilityRole="button"
                accessibilityLabel={etiqueta}
                className="flex-1 flex-row items-center py-2 active:opacity-60"
              >
                {contenido}
              </Pressable>
            ) : (
              <View accessible accessibilityLabel={etiqueta} className="flex-1 flex-row items-center py-2">
                {contenido}
              </View>
            )}
            {onQuitar && (
              <Pressable
                onPress={() => onQuitar(f)}
                hitSlop={6}
                accessibilityRole="button"
                accessibilityLabel={`Quitar a ${nombreCompleto}`}
                className={`${ANCHO_ACCION} items-end active:opacity-60`}
              >
                <Ionicons name="close-circle-outline" size={20} color={colors.onSurfaceVariant} />
              </Pressable>
            )}
          </View>
        );
      })}

      {columnas.length > 0 && (
        <>
          <View className="flex-row items-center border-t border-black/10 py-2.5">
            <Text
              style={{ fontFamily: fonts.sansSemibold }}
              className="flex-1 text-xs text-ink-variant"
            >
              Presentes
            </Text>
            {columnas.map((r) => {
              const { presentes, total } = presentesDe(r);
              return (
                <Text
                  key={r.id}
                  style={{ fontFamily: fonts.sansSemibold }}
                  className={`${ANCHO_COLUMNA} text-center text-[11px] text-ink-variant`}
                >
                  {presentes}/{total}
                </Text>
              );
            })}
            <View className={ANCHO_PORCENTAJE} />
            {espacioAccion}
          </View>
          <View className="flex-row flex-wrap items-center gap-x-4 gap-y-1 border-t border-black/5 pt-2.5">
            <Leyenda estado="presente" texto="Presente" />
            <Leyenda estado="ausente" texto="Ausente" />
            <Leyenda estado="sin-registro" texto="Todavía no estaba" />
          </View>
        </>
      )}
    </Card>
  );
}
