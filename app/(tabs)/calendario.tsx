import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { AppBar } from "../../components/AppBar";
import { CumpleRow } from "../../components/Cumples";
import { Body, Card, Chip, Headline, Label, Muted, Title } from "../../components/ui";
import { useAuth } from "../../lib/auth";
import {
  addDays,
  addMonths,
  diasHastaCumple,
  endOfMonth,
  esCumpleEn,
  formatHora,
  formatMesAnio,
  monthMatrix,
  startOfMonth,
  startOfWeek,
  toISODate,
} from "../../lib/date";
import { colors, fonts } from "../../lib/theme";
import { DIAS_SEMANA, DirectorioEntry } from "../../lib/types";
import { useActividadesActivas } from "../../lib/queries/actividades";
import { useDirectorio } from "../../lib/queries/directorio";
import { useDiscipulados } from "../../lib/queries/discipulados";
import { useEventosVigentes } from "../../lib/queries/eventos";
import { useReunionesMes, useReunionesSemana } from "../../lib/queries/reuniones";

function rango(d: Date) {
  return d.toLocaleDateString("es-AR", { day: "2-digit", month: "short" });
}

const ORDEN_SEMANA = [1, 2, 3, 4, 5, 6, 0]; // lunes..domingo

type Vista = "semana" | "mes";

export default function Calendario() {
  const router = useRouter();
  const { isAdmin } = useAuth();
  const [vista, setVista] = useState<Vista>("semana");

  const { data: discipulados = [] } = useDiscipulados();
  const { data: eventos = [] } = useEventosVigentes();
  const { data: actividades = [] } = useActividadesActivas();

  // Cumpleaños de toda la congregación (directorio, visible a todo miembro activo).
  const { data: miembros = [] } = useDirectorio();

  return (
    <View className="flex-1 bg-cream">
      <AppBar />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }} showsVerticalScrollIndicator={false}>
        <View className="mb-4">
          <Headline>{isAdmin ? "Calendario general" : "Mi calendario"}</Headline>
          <Muted className="mt-1">
            {isAdmin
              ? "Todos los discipulados, reuniones y actividades"
              : "Tus discipulados y las actividades de la iglesia"}
          </Muted>
        </View>

        <Toggle vista={vista} onChange={setVista} />

        {vista === "semana" ? (
          <VistaSemana discipulados={discipulados} eventos={eventos} actividades={actividades} miembros={miembros} />
        ) : (
          <VistaMes discipulados={discipulados} eventos={eventos} actividades={actividades} miembros={miembros} />
        )}
      </ScrollView>
    </View>
  );
}

/* ============================ Toggle semana / mes ============================ */

function Toggle({ vista, onChange }: { vista: Vista; onChange: (v: Vista) => void }) {
  const opciones: { key: Vista; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
    { key: "semana", label: "Semana", icon: "calendar-outline" },
    { key: "mes", label: "Mes", icon: "grid-outline" },
  ];
  return (
    <View className="mb-5 flex-row rounded-lg border border-black/10 bg-surface-mid p-1">
      {opciones.map((o) => {
        const activo = vista === o.key;
        return (
          <Pressable
            key={o.key}
            onPress={() => onChange(o.key)}
            style={activo ? { backgroundColor: colors.primary } : undefined}
            className={`flex-1 flex-row items-center justify-center gap-1.5 rounded-md px-3 py-2 ${
              activo ? "" : "active:opacity-70"
            }`}
          >
            <Ionicons name={o.icon} size={15} color={activo ? "#fff" : colors.onSurfaceVariant} />
            <Body className={activo ? "text-white" : "text-ink-variant"} style={{ fontFamily: fonts.sansSemibold }}>
              {o.label}
            </Body>
          </Pressable>
        );
      })}
    </View>
  );
}

/* ============================ Tarjetas reutilizables ============================ */

function DiscipuladoRow({
  d,
  registrada,
  onPress,
}: {
  d: import("../../lib/types").Discipulado;
  registrada: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} className="active:opacity-80">
      <Card className="flex-row items-center justify-between py-4">
        <View className="flex-1 flex-row items-center gap-3">
          <View className="items-center rounded-md bg-surface-mid px-2.5 py-1.5">
            <Muted className="text-navy">{formatHora(d.hora_inicio)}</Muted>
          </View>
          <View className="flex-1">
            <Title numberOfLines={1} className="text-base">
              {d.nombre ?? d.descripcion_etaria ?? "Discipulado"}
            </Title>
            <Muted className="capitalize">{d.modalidad}</Muted>
          </View>
        </View>
        <Chip tone={registrada ? "success" : "neutral"}>{registrada ? "Registrada" : "Pendiente"}</Chip>
      </Card>
    </Pressable>
  );
}

function EventoRow({ e, onPress }: { e: import("../../lib/types").Evento; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} className="active:opacity-80">
      <Card className="flex-row items-center gap-3 py-4">
        <View className="h-9 w-9 items-center justify-center rounded-full bg-gold-container">
          <Ionicons name="megaphone-outline" size={17} color={colors.onTertiaryContainer} />
        </View>
        <Body className="flex-1 text-ink" numberOfLines={1}>
          {e.titulo}
        </Body>
        <Ionicons name="chevron-forward" size={16} color={colors.outline} />
      </Card>
    </Pressable>
  );
}

function ActividadRow({ a, onPress }: { a: import("../../lib/types").Actividad; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} className="active:opacity-80">
      <Card className="flex-row items-center gap-3 py-4">
        <View
          className="h-9 w-9 items-center justify-center rounded-full"
          style={{ backgroundColor: colors.success + "22" }}
        >
          <Ionicons name="repeat-outline" size={17} color={colors.success} />
        </View>
        <View className="flex-1">
          <Body className="text-ink" numberOfLines={1}>
            {a.titulo}
          </Body>
          <Muted>
            {formatHora(a.hora_inicio)}
            {a.hora_fin ? ` – ${formatHora(a.hora_fin)}` : ""}
          </Muted>
        </View>
        <Ionicons name="chevron-forward" size={16} color={colors.outline} />
      </Card>
    </Pressable>
  );
}

/* ============================ Vista semanal ============================ */

function VistaSemana({
  discipulados,
  eventos,
  actividades,
  miembros,
}: {
  discipulados: import("../../lib/types").Discipulado[];
  eventos: import("../../lib/types").Evento[];
  actividades: import("../../lib/types").Actividad[];
  miembros: DirectorioEntry[];
}) {
  const router = useRouter();
  const inicio = useMemo(() => startOfWeek(), []);
  const fin = useMemo(() => addDays(inicio, 6), [inicio]);
  const { data: reuniones = [] } = useReunionesSemana(toISODate(inicio), toISODate(fin));

  const tieneReunion = (discipuladoId: string, fechaISO: string) =>
    reuniones.some((r) => r.discipulado_id === discipuladoId && r.fecha === fechaISO);
  const cumplesDe = (fecha: Date) => miembros.filter((m) => esCumpleEn(m.fecha_nacimiento, fecha));

  return (
    <>
      <View className="mb-4">
        <Label>Esta semana</Label>
        <Muted className="mt-1">
          {rango(inicio)} – {rango(fin)}
        </Muted>
      </View>

      {ORDEN_SEMANA.map((diaIdx, i) => {
        const fecha = addDays(inicio, i);
        const fechaDia = toISODate(fecha);
        const delDia = discipulados
          .filter((d) => d.dia_semana === diaIdx)
          .sort((a, b) => a.hora_inicio.localeCompare(b.hora_inicio));
        const eventosDia = eventos.filter((e) => toISODate(new Date(e.fecha_inicio)) === fechaDia);
        const actividadesDia = actividades
          .filter((a) => a.dias_semana.includes(diaIdx))
          .sort((a, b) => a.hora_inicio.localeCompare(b.hora_inicio));
        const cumplesDia = cumplesDe(fecha);
        if (
          delDia.length === 0 &&
          eventosDia.length === 0 &&
          actividadesDia.length === 0 &&
          cumplesDia.length === 0
        )
          return null;

        const esHoy = fechaDia === toISODate(new Date());

        return (
          <View key={diaIdx} className="mb-5">
            <View className="mb-2 flex-row items-center gap-2">
              <Label>{DIAS_SEMANA[diaIdx]}</Label>
              {esHoy ? <Chip tone="gold">Hoy</Chip> : null}
            </View>
            <View className="gap-2.5">
              {delDia.map((d) => (
                <DiscipuladoRow
                  key={d.id}
                  d={d}
                  registrada={tieneReunion(d.id, fechaDia)}
                  onPress={() => router.push(`/discipulado/${d.id}`)}
                />
              ))}
              {actividadesDia.map((a) => (
                <ActividadRow
                  key={a.id}
                  a={a}
                  onPress={() => router.push({ pathname: "/actividad-semanal/[id]", params: { id: a.id } })}
                />
              ))}
              {eventosDia.map((e) => (
                <EventoRow
                  key={e.id}
                  e={e}
                  onPress={() => router.push({ pathname: "/actividad/[id]", params: { id: e.id } })}
                />
              ))}
              {cumplesDia.map((m) => (
                <CumpleRow key={m.id} miembro={m} dias={diasHastaCumple(m.fecha_nacimiento) ?? 0} />
              ))}
            </View>
          </View>
        );
      })}

      {discipulados.length === 0 && (
        <Card>
          <Muted>No hay discipulados para mostrar en el calendario.</Muted>
        </Card>
      )}
    </>
  );
}

/* ============================ Vista mensual ============================ */

function VistaMes({
  discipulados,
  eventos,
  actividades,
  miembros,
}: {
  discipulados: import("../../lib/types").Discipulado[];
  eventos: import("../../lib/types").Evento[];
  actividades: import("../../lib/types").Actividad[];
  miembros: DirectorioEntry[];
}) {
  const router = useRouter();
  const hoyISO = toISODate(new Date());
  const [refMes, setRefMes] = useState(() => startOfMonth());
  const [seleccion, setSeleccion] = useState(hoyISO);

  const semanas = useMemo(() => monthMatrix(refMes), [refMes]);
  const rango = useMemo(
    () => ({ desde: toISODate(startOfMonth(refMes)), hasta: toISODate(endOfMonth(refMes)) }),
    [refMes]
  );
  const { data: reuniones = [] } = useReunionesMes(rango.desde, rango.hasta);

  const discipuladosDe = (fecha: Date) =>
    discipulados
      .filter((d) => d.dia_semana === fecha.getDay())
      .sort((a, b) => a.hora_inicio.localeCompare(b.hora_inicio));
  const eventosDe = (fechaISO: string) =>
    eventos.filter((e) => toISODate(new Date(e.fecha_inicio)) === fechaISO);
  const actividadesDe = (fecha: Date) =>
    actividades
      .filter((a) => a.dias_semana.includes(fecha.getDay()))
      .sort((a, b) => a.hora_inicio.localeCompare(b.hora_inicio));
  const cumplesDe = (fecha: Date) => miembros.filter((m) => esCumpleEn(m.fecha_nacimiento, fecha));
  const tieneReunion = (discipuladoId: string, fechaISO: string) =>
    reuniones.some((r) => r.discipulado_id === discipuladoId && r.fecha === fechaISO);

  const selDate = new Date(seleccion + "T00:00:00");
  const selDiscipulados = discipuladosDe(selDate);
  const selEventos = eventosDe(seleccion);
  const selActividades = actividadesDe(selDate);
  const selCumples = cumplesDe(selDate);

  const cambiarMes = (n: number) => {
    const nuevo = addMonths(refMes, n);
    setRefMes(nuevo);
    // Mantener seleccionado el día equivalente dentro del nuevo mes.
    setSeleccion(nuevo.getMonth() === new Date().getMonth() && nuevo.getFullYear() === new Date().getFullYear() ? hoyISO : toISODate(nuevo));
  };

  return (
    <>
      {/* Navegación de mes */}
      <View className="mb-3 flex-row items-center justify-between">
        <Pressable onPress={() => cambiarMes(-1)} className="h-9 w-9 items-center justify-center rounded-full bg-surface-mid active:opacity-70">
          <Ionicons name="chevron-back" size={18} color={colors.primary} />
        </Pressable>
        <Title className="capitalize text-base">{formatMesAnio(refMes)}</Title>
        <Pressable onPress={() => cambiarMes(1)} className="h-9 w-9 items-center justify-center rounded-full bg-surface-mid active:opacity-70">
          <Ionicons name="chevron-forward" size={18} color={colors.primary} />
        </Pressable>
      </View>

      {/* Grilla */}
      <Card className="mb-5 p-3">
        <View className="mb-1 flex-row">
          {["L", "M", "M", "J", "V", "S", "D"].map((d, i) => (
            <View key={i} className="flex-1 items-center py-1">
              <Label>{d}</Label>
            </View>
          ))}
        </View>
        {semanas.map((semana, wi) => (
          <View key={wi} className="flex-row">
            {semana.map((fecha) => {
              const fechaISO = toISODate(fecha);
              const delMes = fecha.getMonth() === refMes.getMonth();
              const esHoy = fechaISO === hoyISO;
              const seleccionado = fechaISO === seleccion;
              const nDisc = discipuladosDe(fecha).length;
              const nEvt = eventosDe(fechaISO).length;
              const nAct = actividadesDe(fecha).length;
              const nCumple = cumplesDe(fecha).length;
              return (
                <Pressable
                  key={fechaISO}
                  onPress={() => setSeleccion(fechaISO)}
                  className="flex-1 items-center py-1.5 active:opacity-70"
                >
                  <View
                    style={seleccionado ? { backgroundColor: colors.primary } : undefined}
                    className={`h-9 w-9 items-center justify-center rounded-full ${
                      !seleccionado && esHoy ? "border border-gold" : ""
                    }`}
                  >
                    <Body
                      className={
                        seleccionado ? "text-white" : delMes ? "text-ink" : "text-ink-muted"
                      }
                      style={{ fontFamily: esHoy ? fonts.sansBold : fonts.sans }}
                    >
                      {fecha.getDate()}
                    </Body>
                  </View>
                  <View className="mt-0.5 h-1.5 flex-row gap-0.5">
                    {nDisc > 0 ? <View className="h-1.5 w-1.5 rounded-full bg-navy" /> : null}
                    {nEvt > 0 ? <View className="h-1.5 w-1.5 rounded-full bg-gold" /> : null}
                    {nAct > 0 ? (
                      <View className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: colors.success }} />
                    ) : null}
                    {nCumple > 0 ? (
                      <View className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: colors.cumple }} />
                    ) : null}
                  </View>
                </Pressable>
              );
            })}
          </View>
        ))}
        <View className="mt-2 flex-row flex-wrap justify-center gap-x-4 gap-y-1">
          <View className="flex-row items-center gap-1.5">
            <View className="h-1.5 w-1.5 rounded-full bg-navy" />
            <Muted>Discipulado</Muted>
          </View>
          <View className="flex-row items-center gap-1.5">
            <View className="h-1.5 w-1.5 rounded-full bg-gold" />
            <Muted>Evento</Muted>
          </View>
          <View className="flex-row items-center gap-1.5">
            <View className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: colors.success }} />
            <Muted>Actividad</Muted>
          </View>
          <View className="flex-row items-center gap-1.5">
            <View className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: colors.cumple }} />
            <Muted>Cumpleaños</Muted>
          </View>
        </View>
      </Card>

      {/* Agenda del día seleccionado */}
      <View className="mb-2 flex-row items-center gap-2">
        <Label>
          {selDate.toLocaleDateString("es-AR", { weekday: "long", day: "2-digit", month: "long" })}
        </Label>
        {seleccion === hoyISO ? <Chip tone="gold">Hoy</Chip> : null}
      </View>

      {selDiscipulados.length === 0 &&
      selEventos.length === 0 &&
      selActividades.length === 0 &&
      selCumples.length === 0 ? (
        <Card>
          <Muted>Sin discipulados, eventos, actividades ni cumpleaños este día.</Muted>
        </Card>
      ) : (
        <View className="gap-2.5">
          {selDiscipulados.map((d) => (
            <DiscipuladoRow
              key={d.id}
              d={d}
              registrada={tieneReunion(d.id, seleccion)}
              onPress={() => router.push(`/discipulado/${d.id}`)}
            />
          ))}
          {selActividades.map((a) => (
            <ActividadRow
              key={a.id}
              a={a}
              onPress={() => router.push({ pathname: "/actividad-semanal/[id]", params: { id: a.id } })}
            />
          ))}
          {selEventos.map((e) => (
            <EventoRow
              key={e.id}
              e={e}
              onPress={() => router.push({ pathname: "/actividad/[id]", params: { id: e.id } })}
            />
          ))}
          {selCumples.map((m) => (
            <CumpleRow key={m.id} miembro={m} dias={diasHastaCumple(m.fecha_nacimiento) ?? 0} />
          ))}
        </View>
      )}
    </>
  );
}
