import { Children, ReactNode, useCallback, useEffect, useMemo } from "react";
import { View, useWindowDimensions } from "react-native";
import { Gesture, GestureDetector, GestureType } from "react-native-gesture-handler";
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";

// Sin carruseles adentro. Constante de módulo y no `= []` en el destructuring:
// un arreglo nuevo por render rearmaría el gesto en medio de un arrastre.
const SIN_CARRUSELES: readonly GestureType[] = [];

type PanelesProps = {
  // Panel a la vista. Quien lo pasa también dibuja el selector del header
  // (`AppBar`), así el tap en la pestaña y el desliz mueven lo mismo.
  index: number;
  onIndexChange: (index: number) => void;
  // Gestos nativos de los scrolls horizontales que viven dentro de los paneles
  // (carruseles). Tiene que ser una referencia estable —memoizala—, por lo mismo
  // que `SIN_CARRUSELES`.
  carruseles?: readonly GestureType[];
  // Un hijo por panel. Cada uno tiene que ser `flex-1`: acá se lo envuelve en un
  // View del ancho de la pantalla que el contenido rellena a lo alto.
  children: ReactNode;
};

// Paneles hermanos que se deslizan de a uno, con tap en el header o arrastre.
// Lo usan el feed (Inicio/Nosotros) y "Eventos y actividades"
// (Actividades/Eventos); el movimiento tiene que sentirse igual en los dos.
export function Paneles({ index, onIndexChange, carruseles = SIN_CARRUSELES, children }: PanelesProps) {
  const { width } = useWindowDimensions();
  const paneles = Children.toArray(children);
  const ultimo = Math.max(paneles.length - 1, 0);

  const translateX = useSharedValue(-index * width);
  const dragStartX = useSharedValue(0);
  // A dónde está yendo el panel. Lo mira el efecto de acá abajo para no
  // relanzar la animación cuando el índice lo cambió el propio gesto: volver a
  // disparar el resorte a mitad de vuelo es lo que se sentía como un tirón.
  const targetX = useSharedValue(-index * width);

  // Reanimated corre esto en el hilo de UI: el panel se mueve sin pasar por el
  // puente JS. Un solo resorte para el tap y para el desliz, así los dos se
  // sienten igual. `velocity` lo engancha a la velocidad con la que se soltó el
  // dedo —con una duración fija, un manotazo y un arrastre lento frenaban
  // igual— y `overshootClamping` lo para justo en el borde: sin eso el resorte
  // se pasa de largo y asoma el vacío que queda al costado de los paneles.
  const settle = useCallback(
    (target: number, velocity = 0) => {
      "worklet";
      targetX.value = target;
      translateX.value = withSpring(target, {
        velocity,
        damping: 20,
        stiffness: 180,
        mass: 0.7,
        overshootClamping: true,
      });
    },
    [targetX, translateX]
  );

  // Por acá entra el tap en la pestaña del header. El desliz no: al soltar el
  // dedo la animación ya arrancó en el hilo de UI y `onIndexChange` sólo
  // sincroniza el header, así que cuando el efecto corre no queda nada por hacer.
  useEffect(() => {
    const x = -index * width;
    if (targetX.value !== x) settle(x);
  }, [index, width, targetX, settle]);

  // Un desliz nunca sale perfectamente horizontal: `activeOffsetX` pide 12 px de
  // intención horizontal antes de tomar el gesto, y `failOffsetY` se lo cede al
  // scroll vertical del panel apenas el dedo se va para abajo.
  //
  // Memoizado porque el contenido se vuelve a renderizar solo —llega una
  // consulta, cambia un contador— y rearmar el gesto en medio de un arrastre lo
  // entrecorta.
  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX([-12, 12])
        .failOffsetY([-12, 12])
        // Sin esto el pan gana el gesto y arrastrar entre tarjetas de un
        // carrusel terminaba cambiando de panel: ahora espera a que el carrusel
        // falle —o ni empiece, que es lo que pasa cuando el arrastre nace fuera
        // de él—.
        .requireExternalGestureToFail(...carruseles)
        .onStart(() => {
          // La posición viva del panel, no la del índice: agarrarlo a mitad de
          // la animación lo toma donde está en vez de hacerlo saltar.
          dragStartX.value = translateX.value;
        })
        .onUpdate((e) => {
          const next = dragStartX.value + e.translationX;
          const tope = -ultimo * width;
          // Gomita en los bordes: pasado el límite el panel sigue al dedo a un
          // cuarto, en vez de clavarse en seco contra un tope invisible.
          translateX.value =
            next > 0 ? next / 4 : next < tope ? tope + (next - tope) / 4 : next;
        })
        .onEnd((e) => {
          // Dónde terminaría el panel si lo soltáramos y siguiera solo con la
          // velocidad que trae. Decidir con esa proyección —y no con cuánto se
          // arrastró— es lo que hace que un flick corto pero rápido complete el
          // cambio, y que un arrastre largo ya frenado a mitad se vuelva.
          const proyectado = translateX.value + e.velocityX * 0.15;
          const desde = Math.round(-dragStartX.value / width);
          const avance = proyectado - dragStartX.value;
          // El umbral es el 35% del camino desde donde arrancó el arrastre, no
          // la mitad de la pantalla: completar el desliz no tiene que costar
          // medio ancho. Sale de `dragStartX` y no del índice de React para que
          // agarrar el panel a mitad de camino también funcione.
          const destino =
            avance < -width * 0.35 ? desde + 1 : avance > width * 0.35 ? desde - 1 : desde;
          const i = Math.min(Math.max(destino, 0), ultimo);
          settle(-i * width, e.velocityX);
          // El header cambia al soltar, en el mismo momento que el panel, no
          // cuando termina la animación.
          runOnJS(onIndexChange)(i);
        }),
    [carruseles, dragStartX, onIndexChange, settle, translateX, ultimo, width]
  );

  const slideStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  return (
    <View style={{ flex: 1, overflow: "hidden" }}>
      <GestureDetector gesture={panGesture}>
        <Animated.View
          style={[{ flex: 1, flexDirection: "row", width: width * paneles.length }, slideStyle]}
        >
          {paneles.map((panel, i) => (
            <View key={i} style={{ width }}>
              {panel}
            </View>
          ))}
        </Animated.View>
      </GestureDetector>
    </View>
  );
}
