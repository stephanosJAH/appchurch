import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import {
  Body,
  Card,
  Display,
  Headline,
  Label,
  Muted,
  Screen,
  SkeletonRows,
  Title,
} from "../../components/ui";
import {
  addMonths,
  endOfMonth,
  formatFechaCorta,
  formatMesAnio,
  formatMoneda,
  startOfMonth,
  toISODate,
} from "../../lib/date";
import { useOfrendasMinisterio } from "../../lib/queries/ministerios";
import { useOfrendas } from "../../lib/queries/reuniones";
import { cardShadow, colors } from "../../lib/theme";

// Resumen mensual de ofrendas (admin). El corte de permisos lo hacen el layout
// de app/admin (UI) y la RLS de `reuniones` / `reuniones_ministerio` (real).
//
// **Consolida los dos libros.** La contabilidad de discipulados y la de
// ministerios viven en tablas separadas por decisión de producto (ver 0025) y
// app/ofrendas.tsx muestra una u otra según `origen`. Acá se suman: es la
// pantalla que responde "cuánto entró este mes", y para esa pregunta el origen
// es un desglose, no una bifurcación. Las tarjetas por libro siguen llevando a
// app/ofrendas.tsx para ver uno solo con todo su historial.
//
// Se trae una única ventana de 12 meses y todo lo demás (mes elegido,
// comparación con el anterior, desglose por grupo, evolución) se calcula en
// memoria: son pocas filas y así cambiar de mes no dispara una consulta. El
// precio es que no se puede ir más atrás de la ventana — las flechas se apagan
// en el borde.
const MESES_VENTANA = 12;

type Origen = "discipulado" | "ministerio";

// Fila normalizada entre los dos orígenes: cuándo, de quién y cuánto.
type Fila = {
  id: string;
  fecha: string; // "YYYY-MM-DD"
  mes: string; // "YYYY-MM"
  origen: Origen;
  nombre: string;
  monto: number;
};

type ResumenMes = {
  clave: string; // "YYYY-MM"
  fecha: Date; // primer día del mes (para el label)
  total: number;
  discipulados: number;
  ministerios: number;
  filas: Fila[];
};

type Grupo = {
  nombre: string;
  origen: Origen;
  total: number;
  reuniones: number;
};

const claveMes = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

const ICONO: Record<Origen, keyof typeof Ionicons.glyphMap> = {
  discipulado: "git-network-outline",
  ministerio: "sparkles-outline",
};

// Barra de proporción. `pct` es participación sobre el total; un grupo que
// ofrendó pero no llega al 3% igual tiene que verse.
function Barra({ pct, origen }: { pct: number; origen: Origen }) {
  return (
    <View className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-mid">
      <View
        style={{ width: `${pct > 0 ? Math.max(pct, 3) : 0}%` }}
        className={`h-full rounded-full ${origen === "ministerio" ? "bg-gold" : "bg-navy"}`}
      />
    </View>
  );
}

// Tarjeta de un libro (discipulados / ministerios) dentro del mes elegido.
//
// El ícono va en línea con el label, no en un círculo arriba: a media pantalla
// apilar círculo + label + monto + recuento estiraba la tarjeta y dejaba aire
// muerto debajo del recuento. Tampoco lleva `h-full`: las dos tarjetas ya
// igualan altura por el `items-stretch` implícito de la fila, y un
// `height: "100%"` contra un padre de altura automática es justamente lo que
// puede dejarla más alta que su contenido.
function TarjetaOrigen({
  origen,
  label,
  total,
  reuniones,
  onPress,
}: {
  origen: Origen;
  label: string;
  total: number;
  reuniones: number;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} className="flex-1 active:opacity-80">
      <Card className="p-4">
        <View className="flex-row items-center gap-1.5">
          <Ionicons name={ICONO[origen]} size={14} color={colors.primaryContainer} />
          <Label className="flex-1">{label}</Label>
        </View>
        <Title className="mt-1.5" numberOfLines={1}>
          {formatMoneda(total)}
        </Title>
        <Muted className="mt-0.5">
          {reuniones} {reuniones === 1 ? "reunión" : "reuniones"}
        </Muted>
      </Card>
    </Pressable>
  );
}

export default function AdminOfrendas() {
  const router = useRouter();

  // Ventana fija anclada al mes corriente, de más nuevo a más viejo.
  const { desde, hasta, claves } = useMemo(() => {
    const hoy = new Date();
    const primero = addMonths(startOfMonth(hoy), -(MESES_VENTANA - 1));
    const claves = Array.from({ length: MESES_VENTANA }, (_, i) => {
      const d = addMonths(primero, MESES_VENTANA - 1 - i);
      return { clave: claveMes(d), fecha: d };
    });
    return { desde: toISODate(primero), hasta: toISODate(endOfMonth(hoy)), claves };
  }, []);

  const disc = useOfrendas(desde, hasta);
  const min = useOfrendasMinisterio(desde, hasta);
  const cargando = disc.isLoading || min.isLoading;

  const filas = useMemo<Fila[]>(() => {
    const deDiscipulados = (disc.data ?? []).map<Fila>((r) => ({
      id: r.id,
      fecha: r.fecha,
      mes: r.fecha.slice(0, 7),
      origen: "discipulado",
      nombre:
        r.discipulado?.nombre ?? r.discipulado?.descripcion_etaria ?? "Discipulado",
      monto: Number(r.ofrenda_total ?? 0),
    }));
    const deMinisterios = (min.data ?? []).map<Fila>((r) => ({
      id: r.id,
      fecha: r.fecha,
      mes: r.fecha.slice(0, 7),
      origen: "ministerio",
      nombre: r.ministerio?.nombre ?? "Ministerio",
      monto: Number(r.ofrenda_total ?? 0),
    }));
    return [...deDiscipulados, ...deMinisterios].sort((a, b) =>
      b.fecha.localeCompare(a.fecha)
    );
  }, [disc.data, min.data]);

  // Un resumen por cada mes de la ventana, incluidos los que no tuvieron nada:
  // la evolución tiene que mostrar el hueco, no saltearlo.
  const meses = useMemo<ResumenMes[]>(() => {
    const base = new Map<string, ResumenMes>(
      claves.map(({ clave, fecha }) => [
        clave,
        { clave, fecha, total: 0, discipulados: 0, ministerios: 0, filas: [] },
      ])
    );
    for (const f of filas) {
      const m = base.get(f.mes);
      if (!m) continue; // fuera de la ventana
      m.total += f.monto;
      if (f.origen === "ministerio") m.ministerios += f.monto;
      else m.discipulados += f.monto;
      m.filas.push(f);
    }
    return claves.map(({ clave }) => base.get(clave)!);
  }, [claves, filas]);

  // 0 = mes corriente; el índice crece hacia atrás en el tiempo.
  const [idx, setIdx] = useState(0);
  const mes = meses[idx];
  const anterior = meses[idx + 1];

  const variacion =
    anterior && anterior.total > 0
      ? ((mes.total - anterior.total) / anterior.total) * 100
      : null;

  const reunionesDisc = mes.filas.filter((f) => f.origen === "discipulado").length;
  const reunionesMin = mes.filas.length - reunionesDisc;

  // Desglose por grupo del mes elegido. La clave lleva el origen adelante: un
  // discipulado y un ministerio pueden llamarse igual y son cajas distintas.
  const grupos = useMemo<Grupo[]>(() => {
    const mapa = new Map<string, Grupo>();
    for (const f of mes.filas) {
      const k = `${f.origen}:${f.nombre}`;
      const g = mapa.get(k) ?? {
        nombre: f.nombre,
        origen: f.origen,
        total: 0,
        reuniones: 0,
      };
      g.total += f.monto;
      g.reuniones += 1;
      mapa.set(k, g);
    }
    return [...mapa.values()].sort((a, b) => b.total - a.total);
  }, [mes]);

  const { totalVentana, promedio, maxMes } = useMemo(() => {
    const total = meses.reduce((s, m) => s + m.total, 0);
    const conDatos = meses.filter((m) => m.total > 0).length;
    return {
      totalVentana: total,
      promedio: conDatos > 0 ? total / conDatos : 0,
      maxMes: Math.max(...meses.map((m) => m.total), 0),
    };
  }, [meses]);

  const [verReuniones, setVerReuniones] = useState(false);

  return (
    <Screen>
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Navegación de mes — los extremos de la ventana apagan la flecha */}
        <View className="mb-3 flex-row items-center justify-between">
          <Pressable
            onPress={() => setIdx((i) => Math.min(i + 1, MESES_VENTANA - 1))}
            disabled={idx >= MESES_VENTANA - 1}
            className={`h-9 w-9 items-center justify-center rounded-full bg-surface-mid active:opacity-70 ${
              idx >= MESES_VENTANA - 1 ? "opacity-30" : ""
            }`}
          >
            <Ionicons name="chevron-back" size={18} color={colors.primary} />
          </Pressable>
          <Title className="text-base capitalize">{formatMesAnio(mes.fecha)}</Title>
          <Pressable
            onPress={() => setIdx((i) => Math.max(i - 1, 0))}
            disabled={idx === 0}
            className={`h-9 w-9 items-center justify-center rounded-full bg-surface-mid active:opacity-70 ${
              idx === 0 ? "opacity-30" : ""
            }`}
          >
            <Ionicons name="chevron-forward" size={18} color={colors.primary} />
          </Pressable>
        </View>

        {/* Total del mes. No usa `Card`: su `bg-surface` blanco chocaría con el
            navy (mismo motivo que GrupoDestacado en (tabs)/index.tsx). */}
        <View
          style={[
            cardShadow,
            {
              experimental_backgroundImage: `linear-gradient(135deg, ${colors.primary} 0%, ${colors.primaryContainer} 100%)`,
            },
          ]}
          className="mb-4 overflow-hidden rounded-2xl bg-navy p-5"
        >
          <View
            pointerEvents="none"
            style={{ position: "absolute", right: -18, bottom: -26 }}
            className="opacity-10"
          >
            <Ionicons name="wallet" size={140} color={colors.tertiaryDim} />
          </View>
          <Label className="text-navy-soft">Total del mes</Label>
          <Display className="mt-1 text-cream">{formatMoneda(mes.total)}</Display>
          {/* `navy-soft` y no `navy-on`: el #8292b0 sobre navy no llega a AA */}
          <Body className="mt-0.5 text-navy-soft">
            {mes.filas.length} {mes.filas.length === 1 ? "reunión" : "reuniones"} ·{" "}
            {grupos.length} {grupos.length === 1 ? "grupo" : "grupos"}
          </Body>
          {variacion !== null ? (
            <View className="mt-3 flex-row items-center gap-1.5">
              <Ionicons
                name={variacion >= 0 ? "trending-up" : "trending-down"}
                size={15}
                color={colors.tertiaryDim}
              />
              <Muted className="text-gold-dim">
                {variacion >= 0 ? "+" : ""}
                {variacion.toFixed(0)}% vs. {formatMesAnio(anterior.fecha)}
              </Muted>
            </View>
          ) : anterior && mes.total > 0 ? (
            <View className="mt-3 flex-row items-center gap-1.5">
              <Ionicons name="trending-up" size={15} color={colors.tertiaryDim} />
              <Muted className="text-gold-dim">
                Sin ofrendas en {formatMesAnio(anterior.fecha)}
              </Muted>
            </View>
          ) : null}
        </View>

        {/* Los dos libros, cada uno con su historial completo a un toque */}
        <View className="mb-5 flex-row gap-3">
          <TarjetaOrigen
            origen="discipulado"
            label="Discipulados"
            total={mes.discipulados}
            reuniones={reunionesDisc}
            onPress={() =>
              router.push({ pathname: "/ofrendas", params: { origen: "discipulado" } })
            }
          />
          <TarjetaOrigen
            origen="ministerio"
            label="Ministerios"
            total={mes.ministerios}
            reuniones={reunionesMin}
            onPress={() =>
              router.push({ pathname: "/ofrendas", params: { origen: "ministerio" } })
            }
          />
        </View>

        {/* Desglose por grupo */}
        <Headline className="mb-3">Por grupo</Headline>
        {cargando ? (
          <SkeletonRows count={3} />
        ) : grupos.length === 0 ? (
          <Card>
            <Muted>No hay ofrendas registradas en este mes.</Muted>
          </Card>
        ) : (
          <View className="gap-2.5">
            {grupos.map((g) => {
              const pct = mes.total > 0 ? (g.total / mes.total) * 100 : 0;
              return (
                <Card key={`${g.origen}:${g.nombre}`} className="p-4">
                  <View className="flex-row items-center gap-2.5">
                    <Ionicons
                      name={ICONO[g.origen]}
                      size={16}
                      color={
                        g.origen === "ministerio" ? colors.tertiary : colors.primaryContainer
                      }
                    />
                    <View className="flex-1">
                      <Body className="text-ink" numberOfLines={1}>
                        {g.nombre}
                      </Body>
                      <Muted>
                        {g.reuniones} {g.reuniones === 1 ? "reunión" : "reuniones"} ·{" "}
                        {pct.toFixed(0)}%
                      </Muted>
                    </View>
                    <Title className="text-base">{formatMoneda(g.total)}</Title>
                  </View>
                  <Barra pct={pct} origen={g.origen} />
                </Card>
              );
            })}
          </View>
        )}

        {/* Detalle reunión por reunión del mes elegido */}
        {mes.filas.length > 0 && (
          <Card className="mt-5 overflow-hidden p-0">
            <Pressable
              onPress={() => setVerReuniones((v) => !v)}
              className="flex-row items-center gap-3 p-4 active:opacity-80"
            >
              <View className="flex-1">
                <Title className="text-base">Reuniones del mes</Title>
                <Muted>
                  {mes.filas.length} {mes.filas.length === 1 ? "registro" : "registros"}
                </Muted>
              </View>
              <Ionicons
                name={verReuniones ? "chevron-up" : "chevron-down"}
                size={18}
                color={colors.outline}
              />
            </Pressable>
            {verReuniones && (
              <View className="border-t border-black/10">
                {mes.filas.map((f) => (
                  <Pressable
                    key={`${f.origen}:${f.id}`}
                    onPress={() =>
                      router.push({
                        pathname: "/reunion/[id]",
                        params: { id: f.id, origen: f.origen },
                      })
                    }
                    className="flex-row items-center gap-3 border-b border-black/5 px-4 py-3 active:opacity-80"
                  >
                    <Ionicons
                      name={ICONO[f.origen]}
                      size={16}
                      color={
                        f.origen === "ministerio" ? colors.tertiary : colors.primaryContainer
                      }
                    />
                    <View className="flex-1">
                      <Body className="text-ink" numberOfLines={1}>
                        {f.nombre}
                      </Body>
                      <Muted>{formatFechaCorta(f.fecha)}</Muted>
                    </View>
                    <Body className="text-ink">{formatMoneda(f.monto)}</Body>
                  </Pressable>
                ))}
              </View>
            )}
          </Card>
        )}

        {/* Evolución de la ventana — tocar un mes lo trae arriba.
            Una sola tarjeta con filas propias, no una `Card` por mes: el mes
            activo se pinta con `bg-surface-low` y dos clases de fondo en el
            mismo className no garantizan cuál gana (ver (tabs)/index.tsx). */}
        <Headline className="mb-3 mt-6">Últimos {MESES_VENTANA} meses</Headline>
        <Card className="overflow-hidden p-0">
          {meses.map((m, i) => {
            const pct = maxMes > 0 ? (m.total / maxMes) * 100 : 0;
            const activo = i === idx;
            return (
              <Pressable
                key={m.clave}
                onPress={() => setIdx(i)}
                className={`border-b border-black/5 px-4 py-3 active:opacity-80 ${
                  activo ? "bg-surface-low" : ""
                }`}
              >
                <View className="flex-row items-center gap-3">
                  <Body className="flex-1 capitalize text-ink" numberOfLines={1}>
                    {formatMesAnio(m.fecha)}
                  </Body>
                  <Title className={`text-base ${m.total > 0 ? "" : "text-ink-muted"}`}>
                    {formatMoneda(m.total)}
                  </Title>
                </View>
                <Barra pct={pct} origen="discipulado" />
              </Pressable>
            );
          })}
        </Card>

        {/* Acumulado de la ventana */}
        <Card className="mt-5">
          <Label>Acumulado · últimos {MESES_VENTANA} meses</Label>
          <Display className="mt-1">{formatMoneda(totalVentana)}</Display>
          <Muted className="mt-1">
            Promedio {formatMoneda(promedio)} por mes con ofrendas · {filas.length}{" "}
            {filas.length === 1 ? "reunión" : "reuniones"}
          </Muted>
        </Card>
      </ScrollView>
    </Screen>
  );
}
